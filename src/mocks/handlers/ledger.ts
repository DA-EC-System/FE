import { http, HttpResponse, delay } from 'msw';
import { db } from '../db';
import * as inventory from '../inventoryData';
import * as sales from '../salesData';
import * as fulfillment from '../fulfillmentData';
import * as returns from '../returnsData';
import * as purchasing from '../purchasingData';
import * as ledger from '../ledgerData';
import type { MockLedgerLine } from '../ledgerData';
import type { MockOrder } from '../salesData';
import { PERMISSIONS } from '@/utils/permissions';
import { LEDGER_KIND_LABELS, summarizeLedger, taxWarnings } from '@/utils/ledger';
import { isRefunded } from '@/lib/machines/returns';
import type {
  LedgerFilter,
  LedgerLine,
  LedgerResponse,
  LedgerTotals,
  OrderProfit,
  OrderProfitList,
  OrderProfitRow,
  TaxWarningList,
} from '@/types/finance';
import { API, LATENCY, pageParams, paginate, problem, requireCompany, type CompanyActor } from './utils';
import { orderRef } from './finance';
import { registerMarketplaceEvent } from '../engine/marketplace';

// ---------- Sổ tiền (sơ đồ D4.1, FE#76): ghi sổ từ kiện đã giao, kiện hoàn, yêu cầu trả; sàn quyết toán thay dòng ước tính ----------

const P = PERMISSIONS;
const FILTERS: LedgerFilter[] = ['all', 'estimated', 'actual', 'replaced'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const orderOf = (id: string | null) => (id ? sales.orders.find((o) => o.id === id) : undefined);
const shopOf = (id: string | null) => (id ? db.shops.find((s) => s.id === id) : undefined);
const sumBy = <T>(items: T[], f: (x: T) => number) => items.reduce((s, x) => s + f(x), 0);

/** Ghi một lần cho mỗi nghiệp vụ */
function once(key: string, write: () => void) {
  if (ledger.booked.has(key)) return;
  ledger.booked.add(key);
  write();
}

function orderLine(
  o: MockOrder,
  base: { at: string; packageId?: string | null },
  kind: MockLedgerLine['kind'],
  amount: number,
  estimated: boolean,
  configVersion: string | null = null,
  note: string | null = null,
) {
  if (amount === 0) return;
  ledger.addLine({
    companyId: o.companyId,
    at: base.at,
    kind,
    amount: Math.round(amount),
    estimated,
    shopId: o.shopId,
    orderId: o.id,
    packageId: base.packageId ?? null,
    configVersion,
    txnId: null,
    note,
  });
}

/** Sinh dòng sổ cho nghiệp vụ mới; gọi lúc đọc nên mock không phải móc vào từng chỗ đổi trạng thái */
export function syncLedger(companyId: string) {
  for (const p of fulfillment.packages) {
    if (p.companyId !== companyId) continue;
    const o = orderOf(p.orderId);
    if (!o) continue;
    const marketplace = o.source === 'marketplace';
    const base = { at: p.deliveredAt ?? db.now(), packageId: p.id };
    if (p.status === 'delivered') {
      once(`pkg:${p.id}:delivered`, () => {
        const revenue = sumBy(p.lines, (l) => l.quantity * (o.lines.find((x) => x.variantId === l.variantId)?.unitPrice ?? 0));
        // Đơn tạo tay: tiền khách trả thẳng cho shop, không có phí sàn
        orderLine(o, base, 'revenue', revenue, marketplace, marketplace ? ledger.FEE_CONFIG.version : null);
        if (marketplace) {
          const fee = ledger.FEE_CONFIG;
          orderLine(o, base, 'fee_fixed', -revenue * fee.fixedRate, true, fee.version);
          orderLine(o, base, 'fee_txn', -revenue * fee.txnRate, true, fee.version);
          orderLine(o, base, 'tax_withheld', -revenue * ledger.TAX_CONFIG.rate, true, ledger.TAX_CONFIG.version);
        }
        const cogs = sumBy(p.lines, (l) => l.quantity * inventory.levelOf(companyId, l.variantId).avgCost);
        orderLine(o, base, 'cogs', -cogs, false);
      });
    } else if (p.status === 'returned' && marketplace) {
      once(`pkg:${p.id}:returned`, () =>
        orderLine(o, { at: db.now(), packageId: p.id }, 'return_fee', -ledger.FEE_CONFIG.returnFee, true, ledger.FEE_CONFIG.version, 'Kiện giao không thành, sàn thu phí hoàn'),
      );
    }
  }
  for (const r of returns.requests) {
    if (r.companyId !== companyId) continue;
    const o = orderOf(r.orderId);
    if (!o) continue;
    const marketplace = r.source === 'marketplace';
    const at = r.history.at(-1)?.at ?? db.now();
    if (isRefunded(r.status, r.closeResult)) {
      once(`ret:${r.id}:refund`, () =>
        orderLine(o, { at }, 'refund', -sumBy(r.lines, (l) => l.quantity * l.unitPrice), marketplace, null, `Hoàn tiền ${r.code}`),
      );
    }
    if (r.status === 'closed' && r.closeResult === 'inspected') {
      const qty = sumBy(r.lines, (l) => l.quantity);
      if (r.resellQty && qty) {
        // Phần bán lại được về kho: giá vốn trả lại theo giá vốn bình quân của yêu cầu
        const unitCost = sumBy(r.lines, (l) => l.quantity * l.unitCost) / qty;
        once(`ret:${r.id}:cogs`, () => orderLine(o, { at }, 'cogs', unitCost * r.resellQty!, false, null, `Nhập lại kho ${r.code}`));
      }
      if (marketplace) {
        once(`ret:${r.id}:fee`, () =>
          orderLine(o, { at }, 'return_fee', -ledger.FEE_CONFIG.returnFee, true, ledger.FEE_CONFIG.version, `Phí hoàn ${r.code}`),
        );
      }
    }
  }
}

function toLine(l: MockLedgerLine): LedgerLine {
  return {
    id: l.id,
    code: l.code,
    at: l.at,
    kind: l.kind,
    amount: l.amount,
    estimated: l.estimated,
    replaced: l.replaced,
    shopId: l.shopId,
    shopName: shopOf(l.shopId)?.shopName ?? null,
    orderId: l.orderId,
    orderCode: orderOf(l.orderId)?.code ?? null,
    packageId: l.packageId,
    configVersion: l.configVersion,
    txnId: l.txnId,
    ref: null,
    note: l.note,
    bankMatched: l.bankMatched,
  };
}

const canCost = (actor: CompanyActor) => actor.permissions.includes(P.costView);

/** Không có quyền giá vốn: bỏ dòng giá vốn */
function visibleLines(actor: CompanyActor) {
  syncLedger(actor.companyId);
  const cost = canCost(actor);
  return ledger.lines.filter((l) => l.companyId === actor.companyId && (cost || l.kind !== 'cogs'));
}

const newestFirst = (a: MockLedgerLine, b: MockLedgerLine) =>
  b.at.localeCompare(a.at) || Number(b.id.slice(4)) - Number(a.id.slice(4));

function profitOf(actor: CompanyActor, orderId: string): OrderProfit {
  const all = ledger.lines.filter((l) => l.companyId === actor.companyId && l.orderId === orderId);
  const s = summarizeLedger(all.map(toLine));
  const cost = canCost(actor);
  return {
    net: s.net,
    ads: s.ads,
    cogs: cost ? s.cogs : null,
    gross: cost ? s.gross : null,
    estimated: s.estimated,
    taxMismatch: s.taxMismatch,
    lines: all
      .filter((l) => cost || l.kind !== 'cogs')
      .sort((a, b) => -newestFirst(a, b))
      .map(toLine),
  };
}

function totalsOf(companyId: string): LedgerTotals {
  const live = ledger.lines.filter((l) => l.companyId === companyId && !l.replaced && l.shopId && l.kind !== 'cogs');
  const committed = purchasing.requests
    .filter((r) => r.companyId === companyId && ['approved', 'ordered', 'partially_received'].includes(r.status))
    .flatMap((r) => r.lines.filter((l) => !l.excluded))
    .reduce((s, l) => s + Math.max(0, l.quantity - l.received - l.closedShort) * l.unitCost, 0);
  return {
    receivable: sumBy(
      live.filter((l) => l.estimated),
      (l) => l.amount,
    ),
    platformBalance: sumBy(
      live.filter((l) => !l.estimated),
      (l) => l.amount,
    ),
    withdrawn: -sumBy(
      live.filter((l) => l.kind === 'withdrawal'),
      (l) => l.amount,
    ),
    committedPurchase: committed,
  };
}

function inRange(url: URL) {
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const errors: Record<string, string> = {};
  if (from && !DATE.test(from)) errors.from = 'Ngày dạng yyyy-mm-dd';
  if (to && !DATE.test(to)) errors.to = 'Ngày dạng yyyy-mm-dd';
  if (from && to && from > to) errors.to = 'Đến ngày phải sau từ ngày';
  if (Object.keys(errors).length) return { ok: false as const, response: problem(422, 'Dữ liệu không hợp lệ', { errors }) };
  const day = (at: string) => at.slice(0, 10);
  return { ok: true as const, from, to, test: (l: MockLedgerLine) => (!from || day(l.at) >= from) && (!to || day(l.at) <= to) };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const ledgerHandlers = [
  http.get(`${API}/finance/ledger/export`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, P.ledgerExport);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    if ((url.searchParams.get('format') ?? 'misa') !== 'misa') {
      return problem(422, 'Dữ liệu không hợp lệ', { errors: { format: 'Chỉ hỗ trợ format=misa' } });
    }
    const range = inRange(url);
    if (!range.ok) return range.response;
    const rows = visibleLines(guard.value)
      .filter((l) => !l.replaced && range.test(l))
      .sort((a, b) => -newestFirst(a, b))
      .map((l) => {
        const line = toLine(l);
        return [
          l.at.slice(0, 10),
          l.code,
          l.note ?? LEDGER_KIND_LABELS[l.kind],
          line.shopName ?? '',
          line.orderCode ?? '',
          LEDGER_KIND_LABELS[l.kind],
          l.amount,
          l.estimated ? 'Có' : 'Không',
          l.configVersion ?? '',
        ];
      });
    const header = ['Ngày', 'Số chứng từ', 'Diễn giải', 'Gian hàng', 'Đơn', 'Khoản', 'Số tiền', 'Ước tính', 'Phiên bản'];
    const csv = '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
    const name = `so-tien-misa-${range.from || 'dau'}-${range.to || 'nay'}.csv`;
    return new HttpResponse(csv, {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` },
    });
  }),

  http.get(`${API}/finance/ledger`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, P.ledgerView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const filter = (url.searchParams.get('filter') ?? 'all') as LedgerFilter;
    if (!FILTERS.includes(filter)) return problem(422, 'Dữ liệu không hợp lệ', { errors: { filter: 'Bộ lọc không hợp lệ' } });
    const range = inRange(url);
    if (!range.ok) return range.response;
    const shopId = url.searchParams.get('shopId');
    const orderId = url.searchParams.get('orderId');
    const items = visibleLines(guard.value)
      .filter(
        (l) =>
          (filter === 'all' ||
            (filter === 'replaced' && l.replaced) ||
            (filter === 'estimated' && l.estimated && !l.replaced) ||
            (filter === 'actual' && !l.estimated && !l.replaced)) &&
          (!shopId || l.shopId === shopId) &&
          (!orderId || l.orderId === orderId) &&
          range.test(l),
      )
      .sort(newestFirst);
    const { page, pageSize } = pageParams(url);
    const paged = paginate(items, page, pageSize);
    return HttpResponse.json<LedgerResponse>({
      ...paged,
      items: paged.items.map(toLine),
      totals: totalsOf(guard.value.companyId),
    });
  }),

  http.get(`${API}/finance/orders/profit`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, P.ledgerView);
    if (!guard.ok) return guard.response;
    const actor = guard.value;
    syncLedger(actor.companyId);
    const latest = new Map<string, string>();
    for (const l of ledger.lines) {
      if (l.companyId !== actor.companyId || !l.orderId) continue;
      if ((latest.get(l.orderId) ?? '') < l.at) latest.set(l.orderId, l.at);
    }
    const rows: OrderProfitRow[] = [...latest.entries()]
      .sort((a, b) => b[1].localeCompare(a[1]))
      .flatMap(([orderId]) => {
        const o = orderOf(orderId);
        if (!o) return [];
        const { lines: _lines, ...profit } = profitOf(actor, orderId);
        return [{ ...profit, order: orderRef(o.id)!, shopName: shopOf(o.shopId)?.shopName ?? null }];
      });
    const { page, pageSize } = pageParams(new URL(request.url));
    return HttpResponse.json<OrderProfitList>(paginate(rows, page, pageSize));
  }),

  http.get(`${API}/finance/orders/:orderId/profit`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, P.ledgerView);
    if (!guard.ok) return guard.response;
    const o = sales.orders.find((x) => x.id === params.orderId && x.companyId === guard.value.companyId);
    if (!o) return problem(404, 'Không tìm thấy đơn');
    syncLedger(guard.value.companyId);
    return HttpResponse.json<OrderProfit>(profitOf(guard.value, o.id));
  }),

  http.get(`${API}/finance/tax-warnings`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, P.ledgerView);
    if (!guard.ok) return guard.response;
    const companyId = guard.value.companyId;
    syncLedger(companyId);
    const year = new Date(db.now()).getFullYear();
    const ytd =
      (ledger.YTD_OPENING[companyId] ?? 0) +
      sumBy(
        ledger.lines.filter(
          (l) => l.companyId === companyId && l.kind === 'revenue' && !l.replaced && l.at.startsWith(String(year)),
        ),
        (l) => l.amount,
      );
    return HttpResponse.json<TaxWarningList>({ year, items: taxWarnings(ytd) });
  }),
];

let txnSeq = 0;

registerMarketplaceEvent({
  type: 'finance.order_settled',
  label: 'Sàn quyết toán đơn',
  description:
    'Sàn trả tiền đơn về ví: các dòng ước tính của đơn bị thay bằng dòng thực tế có mã giao dịch. Nhập thuế thực tế khác ước tính để thấy Lệch thuế; nhập thêm quảng cáo để trừ vào lãi đóng góp.',
  group: 'Tiền',
  needsShop: false,
  param: { key: 'target', label: 'Mã đơn [thuế thực tế] [quảng cáo]', placeholder: 'DH-1012 5000 20000' },
  run({ companyId, params }) {
    const [code, taxRaw, adsRaw] = (params.target ?? '').trim().split(/\s+/);
    const o = sales.orders.find((x) => x.companyId === companyId && x.code === (code ?? '').toUpperCase());
    if (!o) throw new Error(`Không có đơn ${code ?? ''}`);
    if (o.source !== 'marketplace') throw new Error('Chỉ đơn sàn được sàn quyết toán');
    const tax = taxRaw ? Number(taxRaw) : null;
    const ads = adsRaw ? Number(adsRaw) : null;
    if ((tax !== null && !Number.isFinite(tax)) || (ads !== null && !Number.isFinite(ads))) {
      throw new Error('Thuế, quảng cáo là số tiền');
    }
    syncLedger(companyId);
    const pending = ledger.lines.filter((l) => l.orderId === o.id && l.estimated && !l.replaced);
    if (!pending.length) throw new Error(`${o.code} không còn dòng ước tính để quyết toán`);
    const txnId = `TXN-${o.code}-${++txnSeq}`;
    const at = db.now();
    for (const e of pending) {
      e.replaced = true;
      ledger.addLine({
        companyId,
        at,
        kind: e.kind,
        amount: e.kind === 'tax_withheld' && tax !== null ? -Math.abs(tax) : e.amount,
        estimated: false,
        shopId: e.shopId,
        orderId: e.orderId,
        packageId: e.packageId,
        configVersion: e.configVersion,
        txnId,
        note: 'Theo quyết toán sàn',
      });
    }
    if (ads) {
      ledger.addLine({
        companyId,
        at,
        kind: 'ads',
        amount: -Math.abs(ads),
        estimated: false,
        shopId: o.shopId,
        orderId: o.id,
        packageId: null,
        configVersion: null,
        txnId,
        note: 'Quảng cáo tính cho đơn',
      });
    }
    return `${o.code}: thay ${pending.length} dòng ước tính bằng quyết toán ${txnId}`;
  },
});
