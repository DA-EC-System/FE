import { http, HttpResponse, delay } from 'msw';
import { db } from '../db';
import * as inventory from '../inventoryData';
import * as sales from '../salesData';
import * as fulfillment from '../fulfillmentData';
import * as returns from '../returnsData';
import * as purchasing from '../purchasingData';
import * as ledger from '../ledgerData';
import { configs, publicRow } from '../financeLifecycleData';
import type { MockLedgerLine } from '../ledgerData';
import type { MockOrder } from '../salesData';
import { FINANCE_VIEW_ANY, PERMISSIONS } from '@/utils/permissions';
import { LEDGER_KIND_LABELS, isCostKind, taxWarnings } from '@/utils/ledger';
import { isRefunded } from '@/lib/machines/returns';
import type {
  LedgerFilter,
  LedgerKind,
  LedgerResponse,
  LedgerTotals,
  OrderProfit,
  OrderProfitList,
  OrderProfitRow,
  ProfitTotals,
  SkuProfitList,
  SkuProfitRow,
  TaxWarningList,
} from '@/types/finance';
import { API, LATENCY, pageParams, paginate, problem, requireCompanyAny, type CompanyActor } from './utils';
import { registerMarketplaceEvent } from '../engine/marketplace';

// ---------- Sổ tiền (sơ đồ D4.1, FE#150, Documents/21 §21.1): ghi sổ từ kiện đã giao, kiện hoàn, yêu cầu trả; sàn quyết toán thay dòng ước tính ----------

const P = PERMISSIONS;
const FILTERS: LedgerFilter[] = ['all', 'estimated', 'actual', 'replaced'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = Object.keys(LEDGER_KIND_LABELS) as LedgerKind[];

const orderOf = (id: string | null) => (id ? sales.orders.find((o) => o.id === id) : undefined);
const sumBy = <T>(items: T[], f: (x: T) => number) => items.reduce((s, x) => s + f(x), 0);
/** Ngày theo giờ Việt Nam của một thời điểm ISO */
const vnDay = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Phiên bản cấu hình đang áp dụng (D4.4): phí theo gian hàng, các loại khác theo công ty */
function activeConfig(companyId: string, kind: string, shopId: string | null = null) {
  const active = configs.filter((c) => c.companyId === companyId && c.kind === kind && c.status === 'active');
  // Mock chỉ có bản phí cho gian hàng đầu: gian hàng khác dùng tạm bản đó để vẫn có dòng phí
  return (kind === 'fee' && active.find((c) => c.shopId === shopId)) || active[0];
}
const pct = (payload: Record<string, unknown> | undefined, key: string) => Number(payload?.[key] ?? 0) / 100;

/** Ghi một lần cho mỗi nghiệp vụ */
function once(key: string, write: () => void) {
  if (ledger.booked.has(key)) return;
  ledger.booked.add(key);
  write();
}

function orderLine(
  o: MockOrder,
  base: { at: string; packageId?: string | null; returnRequestId?: string | null },
  kind: LedgerKind,
  amount: number,
  estimated: boolean,
  configVersionId: string | null = null,
  reason: string | null = null,
) {
  if (Math.round(amount) === 0) return;
  ledger.addLine({
    companyId: o.companyId,
    occurredOn: vnDay(base.at),
    kind,
    amount: Math.round(amount),
    estimated,
    shopId: o.shopId,
    orderId: o.id,
    orderCode: o.code,
    packageId: base.packageId ?? null,
    returnRequestId: base.returnRequestId ?? null,
    configVersionId,
    source: base.packageId ? { type: 'package', id: base.packageId } : base.returnRequestId ? { type: 'return_request', id: base.returnRequestId } : null,
    reason,
  });
}

/** Sinh dòng sổ cho nghiệp vụ mới; gọi lúc đọc nên mock không phải móc vào từng chỗ đổi trạng thái */
export function syncLedger(companyId: string) {
  const tax = activeConfig(companyId, 'tax_rules');
  for (const p of fulfillment.packages) {
    if (p.companyId !== companyId) continue;
    const o = orderOf(p.orderId);
    if (!o) continue;
    const marketplace = o.source === 'marketplace';
    const fee = marketplace ? activeConfig(companyId, 'fee', o.shopId) : undefined;
    const base = { at: p.deliveredAt ?? db.now(), packageId: p.id };
    if (p.status === 'delivered') {
      once(`pkg:${p.id}:delivered`, () => {
        const revenue = sumBy(p.lines, (l) => l.quantity * (o.lines.find((x) => x.variantId === l.variantId)?.unitPrice ?? 0));
        // Đơn tạo tay: tiền khách trả thẳng cho shop, không có phí sàn
        orderLine(o, base, 'revenue', revenue, marketplace, fee?.id ?? null);
        if (marketplace) {
          orderLine(o, base, 'fee_fixed', -revenue * pct(fee?.payload, 'fixedPct'), true, fee?.id ?? null);
          orderLine(o, base, 'fee_transaction', -revenue * pct(fee?.payload, 'transactionPct'), true, fee?.id ?? null);
          orderLine(o, base, 'fee_service', -revenue * pct(fee?.payload, 'servicePct'), true, fee?.id ?? null);
          orderLine(o, base, 'withholding_tax', -revenue * (pct(tax?.payload, 'vatPct') + pct(tax?.payload, 'pitPct')), true, tax?.id ?? null);
        }
        const cogs = sumBy(p.lines, (l) => l.quantity * inventory.levelOf(companyId, l.variantId).avgCost);
        orderLine(o, base, 'cogs', -cogs, false);
      });
    } else if (p.status === 'returned' && marketplace) {
      once(`pkg:${p.id}:returned`, () =>
        orderLine(o, { at: db.now(), packageId: p.id }, 'return_fee', -Number(fee?.payload.returnFee ?? 0), true, fee?.id ?? null, 'Kiện giao không thành, sàn thu phí hoàn'),
      );
    }
  }
  for (const r of returns.requests) {
    if (r.companyId !== companyId) continue;
    const o = orderOf(r.orderId);
    if (!o) continue;
    const marketplace = r.source === 'marketplace';
    const fee = marketplace ? activeConfig(companyId, 'fee', o.shopId) : undefined;
    const base = { at: r.history.at(-1)?.at ?? db.now(), returnRequestId: r.id };
    if (isRefunded(r.status, r.closeResult)) {
      once(`ret:${r.id}:refund`, () =>
        orderLine(o, base, 'customer_refund', -sumBy(r.lines, (l) => l.quantity * l.unitPrice), marketplace, null, `Hoàn tiền ${r.code}`),
      );
    }
    if (r.status === 'closed' && r.closeResult === 'inspected') {
      const qty = sumBy(r.lines, (l) => l.quantity);
      if (r.resellQty && qty) {
        // Phần bán lại được về kho: hoàn giá vốn theo giá vốn bình quân của yêu cầu
        const unitCost = sumBy(r.lines, (l) => l.quantity * l.unitCost) / qty;
        once(`ret:${r.id}:cogs`, () => orderLine(o, base, 'cogs_reversal', unitCost * r.resellQty!, false, null, `Nhập lại kho ${r.code}`));
      }
      if (marketplace) {
        once(`ret:${r.id}:fee`, () =>
          orderLine(o, base, 'return_fee', -Number(fee?.payload.returnFee ?? 0), true, fee?.id ?? null, `Phí hoàn ${r.code}`),
        );
      }
    }
  }
}

const canCost = (actor: CompanyActor) => actor.permissions.includes(P.costView);
const isLive = (l: MockLedgerLine) => l.replacedBy === null;

/** Không có quyền giá vốn: bỏ dòng giá vốn (§21.0) */
function visibleLines(actor: CompanyActor) {
  syncLedger(actor.companyId);
  const cost = canCost(actor);
  return ledger.lines.filter((l) => l.companyId === actor.companyId && (cost || !isCostKind(l.kind)));
}

const newestFirst = (a: MockLedgerLine, b: MockLedgerLine) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt);

/** Thực nhận, giá vốn của các dòng còn hiệu lực của một đơn; giá vốn là số âm */
function sums(rows: MockLedgerLine[]) {
  const live = rows.filter(isLive);
  const net = sumBy(live.filter((l) => !isCostKind(l.kind) && l.kind !== 'withdrawal' && l.kind !== 'ads'), (l) => l.amount);
  const cogs = sumBy(live.filter((l) => isCostKind(l.kind)), (l) => l.amount);
  return { net, cogs, estimated: live.some((l) => l.estimated && !isCostKind(l.kind)) };
}

/** Kiện của đơn đã giao, sớm nhất trước */
const deliveredPackages = (orderId: string) =>
  fulfillment.packages.filter((p) => p.orderId === orderId && p.status === 'delivered').sort((a, b) => (a.deliveredAt ?? '').localeCompare(b.deliveredAt ?? ''));

function orderRow(actor: CompanyActor, o: MockOrder): OrderProfitRow {
  const rows = ledger.lines.filter((l) => l.companyId === actor.companyId && l.orderId === o.id);
  const s = sums(rows);
  const cost = canCost(actor);
  const gross = s.net + s.cogs;
  // Kiện đã giao mà không có dòng giá vốn: giao trước khi bắt đầu lấy đơn (§11.2)
  const costMissing = deliveredPackages(o.id).some((p) => !rows.some((l) => l.packageId === p.id && l.kind === 'cogs'));
  const minMargin = pct(activeConfig(actor.companyId, 'min_margin')?.payload, 'minMarginPct') || ledger.DEFAULT_MIN_MARGIN_PCT / 100;
  return {
    orderId: o.id,
    code: o.code,
    shopId: o.shopId,
    deliveredAt: deliveredPackages(o.id)[0]?.deliveredAt ?? null,
    net: s.net,
    cogs: cost ? s.cogs : null,
    gross: cost ? gross : null,
    marginPct: cost && s.net > 0 ? round1((gross / s.net) * 100) : null,
    estimated: s.estimated,
    costMissing,
    belowFloor: !s.estimated && s.cogs < 0 && s.net < -s.cogs * (1 + minMargin),
  };
}

function totalsOf(companyId: string): LedgerTotals {
  const live = ledger.lines.filter((l) => l.companyId === companyId && isLive(l) && l.shopId && !isCostKind(l.kind));
  const committed = purchasing.requests
    .filter((r) => r.companyId === companyId && ['approved', 'ordered', 'partially_received'].includes(r.status))
    .flatMap((r) => r.lines.filter((l) => !l.excluded))
    .reduce((s, l) => s + Math.max(0, l.quantity - l.received - l.closedShort) * l.unitCost, 0);
  return {
    receivable: sumBy(live.filter((l) => l.estimated), (l) => l.amount),
    platformBalance: sumBy(live.filter((l) => !l.estimated), (l) => l.amount),
    withdrawn: -sumBy(live.filter((l) => l.kind === 'withdrawal'), (l) => l.amount),
    committedPurchase: committed,
  };
}

function dateRange(url: URL, required: boolean) {
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const errors: Record<string, string> = {};
  if (required && !from) errors.from = 'Từ ngày dạng yyyy-mm-dd';
  if (required && !to) errors.to = 'Đến ngày dạng yyyy-mm-dd';
  if (from && !DATE.test(from)) errors.from = 'Từ ngày dạng yyyy-mm-dd';
  if (to && !DATE.test(to)) errors.to = 'Đến ngày dạng yyyy-mm-dd';
  if (from && to && from > to) errors.to = 'Đến ngày không được trước Từ ngày';
  if (Object.keys(errors).length) return { ok: false as const, response: problem(422, 'Dữ liệu không hợp lệ', { errors }) };
  return { ok: true as const, test: (day: string) => (!from || day >= from) && (!to || day <= to) };
}

function profitTotals(rows: { net: number; cogs: number | null; gross: number | null }[], cost: boolean): ProfitTotals {
  return {
    net: sumBy(rows, (r) => r.net),
    cogs: cost ? sumBy(rows, (r) => r.cogs ?? 0) : null,
    gross: cost ? sumBy(rows, (r) => r.gross ?? 0) : null,
  };
}

/** Đơn có kiện giao xong trong kỳ (ngày kiện đầu tiên, giờ Việt Nam) */
function ordersInPeriod(actor: CompanyActor, test: (day: string) => boolean, shopId: string | null) {
  syncLedger(actor.companyId);
  return sales.orders.filter((o) => {
    if (o.companyId !== actor.companyId || (shopId && o.shopId !== shopId)) return false;
    const first = deliveredPackages(o.id)[0]?.deliveredAt;
    return Boolean(first) && test(vnDay(first!));
  });
}

export const ledgerHandlers = [
  http.get(`${API}/finance/ledger`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompanyAny(request, FINANCE_VIEW_ANY);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const filter = (url.searchParams.get('filter') ?? 'all') as LedgerFilter;
    if (!FILTERS.includes(filter)) return problem(422, 'Dữ liệu không hợp lệ', { errors: { filter: 'Lọc là all, estimated, actual hoặc replaced' } });
    const kind = url.searchParams.get('kind') as LedgerKind | null;
    if (kind && !KINDS.includes(kind)) return problem(422, 'Dữ liệu không hợp lệ', { errors: { kind: 'Loại khoản không hợp lệ' } });
    const range = dateRange(url, false);
    if (!range.ok) return range.response;
    const shopId = url.searchParams.get('shopId');
    const orderId = url.searchParams.get('orderId');
    const items = visibleLines(guard.value)
      .filter(
        (l) =>
          (filter === 'all' ||
            (filter === 'replaced' && !isLive(l)) ||
            (filter === 'estimated' && l.estimated && isLive(l)) ||
            // §21.1: actual gồm cả giá vốn (estimated luôn false)
            (filter === 'actual' && !l.estimated && isLive(l))) &&
          (!kind || l.kind === kind) &&
          (!shopId || l.shopId === shopId) &&
          (!orderId || l.orderId === orderId) &&
          range.test(l.occurredOn),
      )
      .sort(newestFirst);
    const { page, pageSize } = pageParams(url);
    const paged = paginate(items, page, pageSize);
    return HttpResponse.json<LedgerResponse>({ ...paged, items: paged.items.map(publicRow), totals: totalsOf(guard.value.companyId) });
  }),

  http.get(`${API}/finance/orders/profits`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompanyAny(request, FINANCE_VIEW_ANY);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const range = dateRange(url, true);
    if (!range.ok) return range.response;
    const actor = guard.value;
    const rows = ordersInPeriod(actor, range.test, url.searchParams.get('shopId'))
      .map((o) => orderRow(actor, o))
      .filter((r) => (url.searchParams.get('costMissing') !== 'true' || r.costMissing) && (url.searchParams.get('belowFloor') !== 'true' || r.belowFloor))
      .sort((a, b) => (b.deliveredAt ?? '').localeCompare(a.deliveredAt ?? ''));
    const { page, pageSize } = pageParams(url);
    return HttpResponse.json<OrderProfitList>({ ...paginate(rows, page, pageSize), totals: profitTotals(rows, canCost(actor)) });
  }),

  http.get(`${API}/finance/skus/profits`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompanyAny(request, FINANCE_VIEW_ANY);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const range = dateRange(url, true);
    if (!range.ok) return range.response;
    const actor = guard.value;
    const cost = canCost(actor);
    const bySku = new Map<string, SkuProfitRow & { cogsRaw: number }>();
    for (const o of ordersInPeriod(actor, range.test, url.searchParams.get('shopId'))) {
      const row = orderRow(actor, o);
      const s = sums(ledger.lines.filter((l) => l.companyId === actor.companyId && l.orderId === o.id));
      const delivered = deliveredPackages(o.id).flatMap((p) => p.lines);
      const revenueOf = (variantId: string, qty: number) => qty * (o.lines.find((x) => x.variantId === variantId)?.unitPrice ?? 0);
      const revenue = sumBy(delivered, (l) => revenueOf(l.variantId, l.quantity));
      const costTotal = sumBy(delivered, (l) => l.quantity * inventory.levelOf(actor.companyId, l.variantId).avgCost);
      for (const l of delivered) {
        // Thực nhận chia theo tỷ lệ doanh thu dòng hàng, giá vốn theo tỷ lệ giá vốn (§21.1)
        const share = revenue ? revenueOf(l.variantId, l.quantity) / revenue : 1 / delivered.length;
        const costShare = costTotal ? (l.quantity * inventory.levelOf(actor.companyId, l.variantId).avgCost) / costTotal : 0;
        const line = o.lines.find((x) => x.variantId === l.variantId);
        const key = l.variantId || 'unmapped';
        const cur = bySku.get(key) ?? {
          variantId: l.variantId || null, sku: l.variantId ? (line?.sku ?? null) : null, productName: l.variantId ? (line?.productName ?? null) : null,
          soldQty: 0, net: 0, cogs: null, gross: null, marginPct: null, costMissing: false, cogsRaw: 0,
        };
        cur.soldQty += l.quantity;
        cur.net += Math.round(s.net * share);
        cur.cogsRaw += Math.round(s.cogs * costShare);
        cur.costMissing ||= row.costMissing;
        bySku.set(key, cur);
      }
    }
    const rows: SkuProfitRow[] = [...bySku.values()]
      .map(({ cogsRaw, ...r }) => ({
        ...r,
        cogs: cost ? cogsRaw : null,
        gross: cost ? r.net + cogsRaw : null,
        marginPct: cost && r.net > 0 ? round1(((r.net + cogsRaw) / r.net) * 100) : null,
      }))
      .sort((a, b) => b.net - a.net);
    const { page, pageSize } = pageParams(url);
    return HttpResponse.json<SkuProfitList>({ ...paginate(rows, page, pageSize), totals: profitTotals(rows, cost), excludedOrders: 0 });
  }),

  http.get(`${API}/finance/orders/:orderId/profit`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompanyAny(request, FINANCE_VIEW_ANY);
    if (!guard.ok) return guard.response;
    const o = sales.orders.find((x) => x.id === params.orderId && x.companyId === guard.value.companyId);
    if (!o) return problem(404, 'Không tìm thấy đơn');
    const lines = visibleLines(guard.value).filter((l) => l.orderId === o.id).sort((a, b) => -newestFirst(a, b));
    const { net, cogs, gross, estimated, costMissing } = orderRow(guard.value, o);
    return HttpResponse.json<OrderProfit>({ net, cogs, gross, estimated, costMissing, lines: lines.map(publicRow) });
  }),

  http.get(`${API}/finance/tax-warnings`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompanyAny(request, FINANCE_VIEW_ANY);
    if (!guard.ok) return guard.response;
    const companyId = guard.value.companyId;
    syncLedger(companyId);
    const year = String(new Date(db.now()).getFullYear());
    const ytd =
      (ledger.YTD_OPENING[companyId] ?? 0) +
      sumBy(ledger.lines.filter((l) => l.companyId === companyId && l.kind === 'revenue' && isLive(l) && l.occurredOn.startsWith(year)), (l) => l.amount);
    const regime = (activeConfig(companyId, 'tax_regime')?.payload.regime ?? null) as TaxWarningList['regime'];
    return HttpResponse.json<TaxWarningList>({ regime, items: taxWarnings(ytd) });
  }),
];

let txnSeq = 0;

registerMarketplaceEvent({
  type: 'finance.order_settled',
  label: 'Sàn quyết toán đơn',
  description:
    'Sàn trả tiền đơn về ví: mỗi dòng ước tính của đơn được thay bằng một dòng thực tế có mã giao dịch. Nhập thuế thực tế khác ước tính để thấy số thuế theo quyết toán.',
  group: 'Tiền',
  needsShop: false,
  param: { key: 'target', label: 'Mã đơn [thuế thực tế]', placeholder: 'DH-1012 5000' },
  run({ companyId, params }) {
    const [code, taxRaw] = (params.target ?? '').trim().split(/\s+/);
    const o = sales.orders.find((x) => x.companyId === companyId && x.code === (code ?? '').toUpperCase());
    if (!o) throw new Error(`Không có đơn ${code ?? ''}`);
    if (o.source !== 'marketplace') throw new Error('Chỉ đơn sàn được sàn quyết toán');
    const tax = taxRaw ? Number(taxRaw) : null;
    if (tax !== null && !Number.isFinite(tax)) throw new Error('Thuế là số tiền');
    syncLedger(companyId);
    const pending = ledger.lines.filter((l) => l.orderId === o.id && l.estimated && isLive(l));
    if (!pending.length) throw new Error(`${o.code} không còn dòng ước tính để quyết toán`);
    const txnId = `TXN-${o.code}-${++txnSeq}`;
    for (const e of pending) {
      const actual = ledger.addLine({
        ...e,
        occurredOn: vnDay(db.now()),
        amount: e.kind === 'withholding_tax' && tax !== null ? -Math.abs(tax) : e.amount,
        estimated: false,
        replacesId: e.id,
        replacedBy: null,
        txnId,
        source: { type: 'settlement_batch', id: txnId },
        reason: 'Theo quyết toán sàn',
      });
      e.replacedBy = actual.id;
    }
    return `${o.code}: thay ${pending.length} dòng ước tính bằng quyết toán ${txnId}`;
  },
});
