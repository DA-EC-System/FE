import { http, HttpResponse, delay } from 'msw';
import { db } from '../db';
import * as inventory from '../inventoryData';
import type { MockStockDoc } from '../inventoryData';
import { PERMISSIONS } from '@/utils/permissions';
import * as sales from '../salesData';
import type { MockOrder, MockPackage } from '../salesData';
import * as payment from '../paymentData';
import * as fulfillment from '../fulfillmentData';
import * as finance from '../financeData';
import type {
  DeliveryAction,
  DocRef,
  HandOverResult,
  Package,
  PackageAction,
  PackageFlag,
  PackageQueue,
  PackageStatus,
  PackageSummary,
  PackageTab,
  SplitInput,
} from '@/types/fulfillment';
import type { CancelOrderResult, StatusChangeSource } from '@/types/sales';
import { buildPickList } from '@/features/fulfillment/pickList';
import { allocate, reclaim, release, reserveWhole, type Hold, type StockNumbers } from '../engine/stock';
import { registerMarketplaceEvent } from '../engine/marketplace';
import { emitRealtime } from '../engine/realtime';
import { dueState, registerTaskSource } from '../engine/tasks';
import {
  cancelPlan,
  holdsStock,
  isHandedOver,
  isSealed,
  orderMachine,
  packageMachine,
  platformUpdate,
  stockEffect,
  type PackageRecord,
} from '@/lib/machines/order';
import { API, LATENCY, checkTransition, pageParams, paginate, problem, requireCompany, type CompanyActor } from './utils';
import { versionConflict, writeCompanyLog } from './identity';
import { findOwned, rid } from './catalog';
import {
  createReturnInspection,
  nextDocNumber,
  registerAllocator,
  stockDocEntity,
  stockDocSnapshot,
  stockLevelOf,
  variantLabel,
} from './inventory';
import {
  finishCancel,
  orderEntity,
  orderRecord,
  orderSnapshot,
  packagesOf,
  payOrder,
  toOrder,
  toStatusChange,
  tryComplete,
  userRef,
} from './sales';
import { toOrderPayment } from './payment';
import { ensureStandard } from './pricing';
import * as channel from '../channelData';

// ---------- Giao vận theo kiện (sơ đồ D2, FE#59): giữ hàng, đóng gói, bàn giao, giao, hoàn, thất lạc ----------

export const MAX_REASON = 500;
export const MAX_BULK = 50;

export const orderOf = (p: MockPackage) => sales.orders.find((o) => o.id === p.orderId)!;
export const packageEntity = (p: MockPackage) => ({ type: 'fulfillment.packages', id: p.id, label: p.code });
const packageSnapshot = (p: MockPackage) => ({ code: p.code, status: p.status, flags: packageFlags(p) });

export function packageFlags(p: MockPackage): PackageFlag[] {
  const flags: PackageFlag[] = [];
  if (p.needsOpen) flags.push('needs_open');
  if (p.needsAttention) flags.push('needs_attention');
  if (p.lostReport && p.status !== 'lost') flags.push('lost_reported');
  return flags;
}

export function toPackageSummary(p: MockPackage): PackageSummary {
  const o = orderOf(p);
  const shop = o.shopId ? db.shops.find((s) => s.id === o.shopId) : undefined;
  const customer = o.customerId ? sales.customers.find((c) => c.id === o.customerId) : undefined;
  const lines = p.lines.map((l) => {
    const line = o.lines.find((x) => x.variantId === l.variantId);
    return {
      variantId: l.variantId,
      sku: line?.sku ?? '',
      productName: line?.productName ?? '',
      attributesLabel: variantLabel(o.companyId, l.variantId).attributesLabel,
      quantity: l.quantity,
    };
  });
  return {
    id: p.id,
    code: p.code,
    order: { id: o.id, code: o.code, status: o.status },
    source: o.source,
    shop: shop ? { id: shop.id, shopName: shop.shopName, platform: shop.platform } : null,
    customerName: customer?.name ?? o.shippingAddress.name,
    status: p.status,
    flags: packageFlags(p),
    flagNote: p.flagNote,
    openPurpose: p.openPurpose,
    selfDelivery: p.selfDelivery,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.source === 'marketplace' ? null : toOrderPayment(o).status,
    trackingCode: p.trackingCode,
    platformPackageCode: p.platformPackageCode,
    shipBy: o.shipBy,
    lines,
    totalQty: p.lines.reduce((sum, l) => sum + l.quantity, 0),
    handedOverAt: p.handedOverAt,
    deliveredAt: p.deliveredAt,
    deliveredBy: userRef(p.deliveredBy),
    lostReport: p.lostReport ? { by: userRef(p.lostReport.by)!, at: p.lostReport.at, claimCode: p.lostReport.claimCode } : null,
    createdAt: p.createdAt,
    version: p.version,
  };
}

export const toPackage = (p: MockPackage): Package => ({
  ...toPackageSummary(p),
  statusHistory: p.history.map((h) => toStatusChange(h, orderOf(p).source)),
});

export function movePackage(
  p: MockPackage,
  to: PackageStatus,
  at: string,
  by: string | null,
  opts: { source?: StatusChangeSource; reason?: string | null } = {},
) {
  p.history.push({ from: p.status, to, at, by, source: opts.source ?? (by ? 'user' : 'system'), reason: opts.reason ?? null });
  p.status = to;
  p.version += 1;
}

// ---------- Giữ hàng theo kiện ----------

function levelsFor(companyId: string, lines: { variantId: string }[]) {
  const levels = new Map<string, StockNumbers>();
  for (const l of lines) levels.set(l.variantId, stockLevelOf(companyId, l.variantId));
  return levels;
}

function holdOf(p: MockPackage): Hold {
  const o = orderOf(p);
  return {
    id: p.id,
    lines: p.lines.map((l) => ({ variantId: l.variantId, qty: l.quantity })),
    dueAt: o.shipBy,
    createdAt: p.createdAt,
    unpaid: o.status === 'unpaid',
    packed: isSealed(p.status),
  };
}

/** Đang thiếu của tồn kho = hàng các kiện Thiếu hàng cần */
function syncBackordered(companyId: string, variantIds: Iterable<string>) {
  const own = fulfillment.packages.filter((p) => p.companyId === companyId && p.status === 'backordered');
  for (const variantId of new Set(variantIds)) {
    stockLevelOf(companyId, variantId).backordered = own
      .flatMap((p) => p.lines)
      .filter((l) => l.variantId === variantId)
      .reduce((sum, l) => sum + l.quantity, 0);
  }
}

/** Kiện mới: đủ khả dụng cho mọi dòng thì giữ, không thì Thiếu hàng */
export function placePackage(p: MockPackage, at: string) {
  const held = reserveWhole(levelsFor(p.companyId, p.lines), holdOf(p));
  p.status = held ? 'reserved' : 'backordered';
  p.history.push({ from: null, to: p.status, at, by: null, source: 'system', reason: null });
  syncBackordered(p.companyId, p.lines.map((l) => l.variantId));
}

export function newPackage(o: MockOrder, lines: MockPackage['lines'], selfDelivery: boolean, at: string): MockPackage {
  const p: MockPackage = {
    id: rid('pkg'),
    companyId: o.companyId,
    code: sales.nextPackageCode(),
    orderId: o.id,
    status: 'reserved',
    lines: lines.map((l) => ({ ...l })),
    selfDelivery,
    needsOpen: false,
    openPurpose: null,
    needsAttention: false,
    flagNote: null,
    trackingCode: null,
    platformPackageCode: null,
    lostReport: null,
    handedOverAt: null,
    handedOverBy: null,
    deliveredAt: null,
    deliveredBy: null,
    createdAt: at,
    history: [],
    version: 1,
  };
  fulfillment.packages.push(p);
  return p;
}

const releasePackage = (p: MockPackage) => release(levelsFor(p.companyId, p.lines), holdOf(p));

/**
 * Tồn thực giảm: lấy lại phần giữ (kiện chưa đóng gói, đơn chưa thanh toán trước).
 * Khả dụng tăng: chia cho kiện Thiếu hàng (hạn sớm, về trước), giữ nguyên kiện.
 */
export function rebalancePackages(companyId: string, variantIds: string[]) {
  const own = fulfillment.packages.filter((p) => p.companyId === companyId);
  const byId = new Map(own.map((p) => [p.id, p]));
  const at = db.now();
  const touched = new Set(variantIds);
  for (const variantId of new Set(variantIds)) {
    const holding = own.filter((p) => holdsStock(p.status) && p.lines.some((l) => l.variantId === variantId));
    const levels = levelsFor(companyId, [{ variantId }, ...holding.flatMap((p) => p.lines)]);
    for (const h of reclaim(levels, variantId, holding.map(holdOf))) {
      const p = byId.get(h.id)!;
      movePackage(p, 'backordered', at, null, { reason: 'Tồn thực giảm, hàng bị lấy lại' });
      for (const l of p.lines) touched.add(l.variantId);
    }
  }
  const waiting = own.filter(
    (p) => p.status === 'backordered' && orderOf(p).status !== 'cancelled' && p.lines.some((l) => touched.has(l.variantId)),
  );
  const levels = levelsFor(companyId, waiting.flatMap((p) => p.lines));
  for (const h of allocate(levels, waiting.map(holdOf))) {
    const p = byId.get(h.id)!;
    movePackage(p, 'reserved', at, null, { reason: 'Đủ hàng, giữ cho kiện' });
  }
  syncBackordered(companyId, [...touched, ...waiting.flatMap((p) => p.lines.map((l) => l.variantId))]);
}

registerAllocator(rebalancePackages);

// ---------- Hàng rời kho, quay lại kho ----------

function stockDoc(o: MockOrder, p: MockPackage, type: 'issue' | 'receipt', note: string, at: string, by: string, byName: string) {
  const doc: MockStockDoc = {
    id: rid('sd'),
    companyId: o.companyId,
    number: nextDocNumber(o.companyId, type),
    type,
    kind: 'order',
    status: 'posted',
    area: null,
    note,
    orderId: o.id,
    source: { type: 'order', id: o.id, number: o.code },
    claimFlag: false,
    lines: p.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitCost: null })),
    createdBy: by,
    createdAt: at,
    postedBy: by,
    postedAt: at,
    version: 1,
    statusHistory: [{ at, from: null, to: 'posted', by: by === 'system' ? null : { id: by, name: byName }, source: 'system' }],
    followUps: [],
    rejectDecision: null,
  };
  inventory.applyDoc(doc, at, by);
  inventory.docs.push(doc);
  return doc;
}

/** Bàn giao: phiếu xuất theo kiện, nhả số đang giữ; hoá đơn lập ở lần bàn giao đầu của đơn */
export function leaveStock(p: MockPackage, at: string, actor: CompanyActor | null): DocRef {
  const o = orderOf(p);
  const by = actor?.account.id ?? 'system';
  const doc = stockDoc(o, p, 'issue', `Bàn giao kiện ${p.code}`, at, by, actor?.account.fullName ?? '');
  for (const l of p.lines) {
    const level = stockLevelOf(o.companyId, l.variantId);
    level.reserved = Math.max(0, level.reserved - l.quantity);
  }
  p.handedOverAt = at;
  p.handedOverBy = actor?.account.id ?? null;
  if (!finance.invoices.some((i) => i.orderId === o.id)) {
    finance.invoices.push({
      id: rid('inv'),
      companyId: o.companyId,
      number: finance.nextFinanceNumber(o.companyId, 'invoice'),
      orderId: o.id,
      status: 'posted',
      issuedAt: at,
      version: 1,
    });
  }
  if (actor) writeCompanyLog(actor, 'create', stockDocEntity(doc), null, stockDocSnapshot(doc));
  return { id: doc.id, number: doc.number };
}

/** Đảo bàn giao: hàng quay lại kệ, giữ lại cho kiện */
function backToStock(p: MockPackage, at: string, actor: CompanyActor) {
  const o = orderOf(p);
  const doc = stockDoc(o, p, 'receipt', `Đảo bàn giao kiện ${p.code}`, at, actor.account.id, actor.account.fullName);
  for (const l of p.lines) stockLevelOf(o.companyId, l.variantId).reserved += l.quantity;
  p.handedOverAt = null;
  p.handedOverBy = null;
  writeCompanyLog(actor, 'create', stockDocEntity(doc), null, stockDocSnapshot(doc));
}

/** Hàng hoàn, kiện thất lạc tìm thấy: phiếu kiểm hàng về (sơ đồ B3), kho chia bán lại, hỏng, trả NCC */
function inspectReturn(p: MockPackage, note: string, at: string) {
  const o = orderOf(p);
  createReturnInspection(o.companyId, { type: 'order', id: o.id, number: o.code }, p.lines, note, at);
  const row = payment.orderPayments.find((r) => r.orderId === o.id);
  if (row?.method === 'cod' && row.status === 'cod_pending' && !packagesOf(o).some((x) => x.status === 'delivered')) {
    row.status = 'not_collected';
  }
}

/** Sàn báo yêu cầu trả khi kiện chưa giao (sơ đồ D3): nhảy sang Đã giao, bù tồn một lần, gắn cờ Cần xử lý */
export function deliverForReturn(p: MockPackage, at: string) {
  const from = p.status;
  if (stockEffect(from, 'delivered') === 'leave') leaveStock(p, at, null);
  movePackage(p, 'delivered', at, null, { source: 'marketplace', reason: 'Sàn báo khách yêu cầu trả' });
  p.deliveredAt = at;
  p.needsAttention = true;
  p.flagNote = `Sàn báo yêu cầu trả khi kiện đang ${from}`;
}

/** Sau mỗi lần kiện đổi: đơn đang huỷ hết kiện đóng gói thì huỷ hẳn; mọi kiện dừng thì thử hoàn tất */
function settleOrder(o: MockOrder, at: string) {
  if (o.flags.includes('cancelling') && !packagesOf(o).some((p) => isSealed(p.status))) finishCancel(o, at);
  tryComplete(o, Date.parse(at));
}

// ---------- Hàng đợi ----------

const TAB_STATUS: Record<Exclude<PackageTab, 'needs_open'>, PackageStatus[]> = {
  backordered: ['backordered'],
  reserved: ['reserved'],
  packed: ['packed'],
  awaiting_pickup: ['awaiting_pickup'],
  shipping: ['in_transit', 'self_delivering'],
  delivery_failed: ['delivery_failed'],
  returning: ['returning'],
};
export const PACKAGE_TABS = [...Object.keys(TAB_STATUS), 'needs_open'] as PackageTab[];

function inTab(p: MockPackage, tab: PackageTab) {
  if (tab === 'needs_open') return packageFlags(p).length > 0;
  const o = orderOf(p);
  // Cần đóng gói: chỉ kiện của đơn đang xử lý; kiện đơn chưa thanh toán vẫn giữ hàng nhưng chưa làm
  if (tab === 'reserved' && o.status !== 'processing') return false;
  return TAB_STATUS[tab].includes(p.status) && o.status !== 'cancelled';
}

/** Kiện hạn sớm làm trước */
const byDue = (a: MockPackage, b: MockPackage) =>
  (orderOf(a).shipBy ?? '￿').localeCompare(orderOf(b).shipBy ?? '￿') || a.createdAt.localeCompare(b.createdAt);

// ---------- Route ----------

interface Ctx {
  actor: CompanyActor;
  p: MockPackage;
  o: MockOrder;
  body: { version?: number } & Record<string, unknown>;
  at: string;
}

async function withPackage(request: Request, id: unknown, permission: string, run: (c: Ctx) => Response) {
  await delay(LATENCY);
  const guard = requireCompany(request, permission);
  if (!guard.ok) return guard.response;
  const found = findOwned(fulfillment.packages, id, guard.value.companyId, 'kiện');
  if (!found.ok) return found.response;
  const p = found.value;
  const body = ((await request.json().catch(() => ({}))) ?? {}) as Ctx['body'];
  if (body.version !== p.version) return versionConflict(toPackage(p), 'Kiện vừa được người khác cập nhật.');
  return run({ actor: guard.value, p, o: orderOf(p), body, at: db.now() });
}

const recordOf = (p: MockPackage, o: MockOrder, extra: Partial<PackageRecord> = {}): PackageRecord => ({
  source: o.source,
  selfDelivery: p.selfDelivery,
  orderStatus: o.status,
  ...extra,
});

/** Kiểm bảng chuyển, đổi trạng thái, ghi nhật ký, rồi xét đơn */
function step(c: Ctx, action: PackageAction, opts: { reason?: string | null; record?: Partial<PackageRecord>; effect?: () => void } = {}) {
  const next = checkTransition(packageMachine, c.p.status, action, c.actor, recordOf(c.p, c.o, opts.record), opts.reason);
  if (!next.ok) return next.response;
  const before = packageSnapshot(c.p);
  movePackage(c.p, next.value, c.at, c.actor.account.id, { reason: opts.reason ?? null });
  opts.effect?.();
  writeCompanyLog(c.actor, 'update', packageEntity(c.p), before, packageSnapshot(c.p));
  settleOrder(c.o, c.at);
  return HttpResponse.json(toPackage(c.p));
}

const reasonOf = (body: Ctx['body'], key = 'reason') => (typeof body[key] === 'string' ? (body[key] as string).trim() : '');
const tooLong = (field: string) =>
  problem(422, 'Dữ liệu không hợp lệ', { errors: { [field]: `Tối đa ${MAX_REASON} ký tự` } });

export const fulfillmentHandlers = [
  http.post(`${API}/sales/orders/:id/cancel`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.orderCancel);
    if (!guard.ok) return guard.response;
    const found = findOwned(sales.orders, params.id, guard.value.companyId, 'đơn hàng');
    if (!found.ok) return found.response;
    const order = found.value;
    const body = (await request.json()) as { version?: number; reason?: string };
    const reason = body.reason?.trim() ?? '';
    if (reason.length > MAX_REASON) return tooLong('reason');
    if (body.version !== order.version) return versionConflict(toOrder(order), 'Đơn vừa được người khác cập nhật.');
    if (order.flags.includes('cancelling')) {
      return problem(409, 'Đơn đang chờ mở kiện để huỷ', { code: 'invalid_transition', current: toOrder(order) });
    }
    const next = checkTransition(orderMachine, order.status, 'cancel', guard.value, orderRecord(order), reason);
    if (!next.ok) return next.response;
    const at = db.now();
    const before = orderSnapshot(order);
    const result = startCancel(order, reason, at, guard.value.account.id);
    writeCompanyLog(guard.value, 'update', orderEntity(order), before, orderSnapshot(order));
    return HttpResponse.json({ order: toOrder(order), pendingOpen: result } satisfies CancelOrderResult);
  }),

  http.get(`${API}/fulfillment/packages`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.fulfillmentProcess);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    const q = (key: string) => url.searchParams.get(key);
    const tab = (q('tab') ?? 'reserved') as PackageTab;
    if (!PACKAGE_TABS.includes(tab)) {
      return problem(422, 'Dữ liệu không hợp lệ', { errors: { tab: 'Tab không hợp lệ' } });
    }
    const search = q('search')?.trim().toLowerCase() ?? '';
    const own = fulfillment.packages.filter((p) => {
      if (p.companyId !== guard.value.companyId) return false;
      const o = orderOf(p);
      return (
        (!q('source') || o.source === q('source')) &&
        (!q('shopId') || o.shopId === q('shopId')) &&
        (!search ||
          p.code.toLowerCase().includes(search) ||
          o.code.toLowerCase().includes(search) ||
          Boolean(p.trackingCode?.toLowerCase().includes(search)))
      );
    });
    const counts = Object.fromEntries(PACKAGE_TABS.map((t) => [t, own.filter((p) => inTab(p, t)).length])) as Record<
      PackageTab,
      number
    >;
    const items = own.filter((p) => inTab(p, tab)).sort(byDue).map(toPackageSummary);
    return HttpResponse.json({ ...paginate(items, page, pageSize), counts } satisfies PackageQueue);
  }),

  http.get(`${API}/fulfillment/packages/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.fulfillmentProcess);
    if (!guard.ok) return guard.response;
    const found = findOwned(fulfillment.packages, params.id, guard.value.companyId, 'kiện');
    if (!found.ok) return found.response;
    return HttpResponse.json(toPackage(found.value));
  }),

  // Danh sách nhặt gộp theo biến thể cho các kiện chọn (mặc định: mọi kiện Cần đóng gói)
  http.get(`${API}/fulfillment/pick-list`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.fulfillmentProcess);
    if (!guard.ok) return guard.response;
    const ids = new URL(request.url).searchParams.get('ids')?.split(',').filter(Boolean) ?? [];
    const picked = fulfillment.packages.filter(
      (p) => p.companyId === guard.value.companyId && (ids.length ? ids.includes(p.id) : inTab(p, 'reserved')),
    );
    return HttpResponse.json(buildPickList(picked.map(toPackageSummary)));
  }),

  // Quét đóng gói: số quét phải khớp từng dòng của kiện
  http.post(`${API}/fulfillment/packages/:id/pack`, ({ params, request }) =>
    withPackage(request, params.id, PERMISSIONS.fulfillmentProcess, (c) => {
      const scanned = Array.isArray(c.body.lines) ? (c.body.lines as { variantId: string; quantity: number }[]) : [];
      const count = (variantId: string, from: { variantId: string; quantity: number }[]) =>
        from.filter((l) => l.variantId === variantId).reduce((sum, l) => sum + l.quantity, 0);
      const ids = new Set([...c.p.lines, ...scanned].map((l) => l.variantId));
      const mismatch = [...ids].filter((v) => count(v, scanned) !== count(v, c.p.lines));
      if (mismatch.length) {
        return problem(422, 'Số quét chưa khớp kiện', {
          code: 'scan_mismatch',
          errors: Object.fromEntries(mismatch.map((v) => [`lines.${v}`, 'Số quét khác số trong kiện'])),
        });
      }
      return step(c, 'pack');
    }),
  ),

  // Báo sàn sẵn sàng, in vận đơn (giả)
  http.post(`${API}/fulfillment/packages/:id/ready`, ({ params, request }) =>
    withPackage(request, params.id, PERMISSIONS.fulfillmentProcess, (c) =>
      step(c, 'mark_ready', {
        effect: () => {
          const n = c.p.code.replace(/\D/g, '');
          c.p.trackingCode ??= `VD${n}${String(Date.now()).slice(-4)}`;
          if (c.o.source === 'marketplace') c.p.platformPackageCode ??= `PKG${n}`;
        },
      }),
    ),
  ),

  // Bàn giao hàng loạt: từng kiện riêng, kiện bị chặn không làm hỏng kiện khác
  http.post(`${API}/fulfillment/packages/hand-over`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.fulfillmentProcess);
    if (!guard.ok) return guard.response;
    const body = (await request.json()) as { packages?: { id: string; version: number }[] };
    const refs = Array.isArray(body.packages) ? body.packages : [];
    if (!refs.length) return problem(422, 'Dữ liệu không hợp lệ', { errors: { packages: 'Chọn ít nhất một kiện' } });
    if (refs.length > MAX_BULK) {
      return problem(422, 'Dữ liệu không hợp lệ', { errors: { packages: `Mỗi lần tối đa ${MAX_BULK} kiện` } });
    }
    const result: HandOverResult = { handedOver: [], failed: [] };
    const at = db.now();
    for (const ref of refs) {
      const found = findOwned(fulfillment.packages, ref.id, guard.value.companyId, 'kiện');
      if (!found.ok) {
        result.failed.push({ packageId: ref.id, code: 'not_found', detail: 'Không tìm thấy kiện' });
        continue;
      }
      const p = found.value;
      const o = orderOf(p);
      if (p.version !== ref.version) {
        result.failed.push({ packageId: p.id, code: 'version_conflict', detail: `${p.code} vừa được người khác cập nhật` });
        continue;
      }
      const next = packageMachine.check(p.status, 'hand_over', {
        actor: { accountId: guard.value.account.id, permissions: guard.value.permissions },
        record: recordOf(p, o),
      });
      if (!next.ok) {
        result.failed.push({ packageId: p.id, code: next.code, detail: `${p.code} không ở Chờ lấy hàng` });
        continue;
      }
      const before = packageSnapshot(p);
      movePackage(p, next.to, at, guard.value.account.id);
      const issue = leaveStock(p, at, guard.value);
      if (o.source === 'marketplace') o.rawMarketplaceStatus = 'SHIPPED';
      writeCompanyLog(guard.value, 'update', packageEntity(p), before, packageSnapshot(p));
      settleOrder(o, at);
      result.handedOver.push({ id: p.id, code: p.code, issue });
    }
    return HttpResponse.json(result);
  }),

  http.post(`${API}/fulfillment/packages/:id/undo-handover`, ({ params, request }) =>
    withPackage(request, params.id, PERMISSIONS.handoverRevert, (c) => {
      const reason = reasonOf(c.body);
      if (reason.length > MAX_REASON) return tooLong('reason');
      return step(c, 'undo_handover', { reason, effect: () => backToStock(c.p, c.at, c.actor) });
    }),
  ),

  // Mở kiện đã đóng: kiện chờ mở để huỷ thì huỷ và trả hàng về kệ; còn lại về Đã giữ để sửa, chia lại
  http.post(`${API}/fulfillment/packages/:id/open`, ({ params, request }) =>
    withPackage(request, params.id, PERMISSIONS.fulfillmentProcess, (c) => {
      const cancel = c.p.openPurpose === 'cancel' || c.o.status === 'cancelled' || c.o.flags.includes('cancelling');
      return step(c, cancel ? 'open_cancel' : 'open', {
        effect: () => {
          if (cancel) releasePackage(c.p);
          c.p.needsOpen = false;
          c.p.openPurpose = null;
          c.p.flagNote = null;
          if (cancel) rebalancePackages(c.p.companyId, c.p.lines.map((l) => l.variantId));
        },
      });
    }),
  ),

  // Chia kiện: mỗi phần thành kiện mới; kiện đã đóng gói phải mở trước
  http.post(`${API}/fulfillment/packages/:id/split`, ({ params, request }) =>
    withPackage(request, params.id, PERMISSIONS.fulfillmentProcess, (c) => {
      if (c.p.status !== 'reserved' && c.p.status !== 'backordered') {
        return problem(409, 'Chỉ chia được kiện chưa đóng gói', {
          code: isSealed(c.p.status) ? 'package_sealed' : 'invalid_transition',
          current: toPackage(c.p),
        });
      }
      const parts = (Array.isArray(c.body.parts) ? c.body.parts : []) as SplitInput['parts'];
      const taken = new Map<string, number>();
      const errors: Record<string, string> = {};
      parts.forEach((part, i) => {
        if (!Array.isArray(part) || !part.length) errors[`parts.${i}`] = 'Phần chia trống';
        else
          for (const l of part) {
            if (!Number.isInteger(l.quantity) || l.quantity < 1) errors[`parts.${i}`] = 'Số lượng là số nguyên dương';
            taken.set(l.variantId, (taken.get(l.variantId) ?? 0) + l.quantity);
          }
      });
      if (!parts.length) errors.parts = 'Chọn hàng chuyển sang kiện mới';
      const left = c.p.lines
        .map((l) => ({ variantId: l.variantId, quantity: l.quantity - (taken.get(l.variantId) ?? 0) }))
        .filter((l) => l.quantity !== 0);
      if ([...taken.keys()].some((v) => !c.p.lines.some((l) => l.variantId === v)) || left.some((l) => l.quantity < 0)) {
        errors.parts = 'Số chia vượt số trong kiện';
      } else if (!left.length) errors.parts = 'Kiện cũ phải còn ít nhất một món';
      if (Object.keys(errors).length) return problem(422, 'Dữ liệu không hợp lệ', { errors });
      const before = packageSnapshot(c.p);
      const wasHeld = c.p.status === 'reserved';
      c.p.lines = left;
      c.p.version += 1;
      const created = parts.map((part) => {
        const merged = new Map<string, number>();
        for (const l of part) merged.set(l.variantId, (merged.get(l.variantId) ?? 0) + l.quantity);
        const q = newPackage(c.o, [...merged].map(([variantId, quantity]) => ({ variantId, quantity })), c.p.selfDelivery, c.at);
        // Hàng đã giữ đi theo kiện mới; kiện Thiếu hàng chia ra thì phần nhỏ có thể đủ hàng ngay
        q.status = c.p.status;
        q.history.push({ from: null, to: q.status, at: c.at, by: c.actor.account.id, source: 'user', reason: `Chia từ ${c.p.code}` });
        return q;
      });
      if (!wasHeld) rebalancePackages(c.o.companyId, c.p.lines.map((l) => l.variantId).concat(...parts.map((x) => x.map((l) => l.variantId))));
      writeCompanyLog(c.actor, 'update', packageEntity(c.p), before, {
        ...packageSnapshot(c.p),
        split: created.map((q) => q.code),
      });
      return HttpResponse.json(toOrder(c.o));
    }),
  ),

  http.post(`${API}/fulfillment/packages/:id/self-deliver`, ({ params, request }) =>
    withPackage(request, params.id, PERMISSIONS.deliveryUpdate, (c) =>
      step(c, 'self_deliver', {
        effect: () => {
          leaveStock(c.p, c.at, c.actor);
          c.p.deliveredBy = c.actor.account.id;
        },
      }),
    ),
  ),

  // Cập nhật giao cho kiện đơn tạo tay, hộp thư; đơn sàn bị chặn theo nguồn
  http.post(`${API}/fulfillment/packages/:id/delivery`, ({ params, request }) =>
    withPackage(request, params.id, PERMISSIONS.deliveryUpdate, (c) => {
      const action = c.body.action as DeliveryAction;
      if (!['deliver', 'fail', 'redeliver', 'return'].includes(action)) {
        return problem(422, 'Dữ liệu không hợp lệ', { errors: { action: 'Chọn trạng thái giao' } });
      }
      const reason = reasonOf(c.body);
      if (reason.length > MAX_REASON) return tooLong('reason');
      const machineAction: PackageAction = action === 'redeliver' && c.p.selfDelivery ? 'redeliver_self' : action;
      return step(c, machineAction, {
        reason: reason || null,
        effect: () => {
          if (action !== 'deliver') return;
          c.p.deliveredAt = c.at;
          const row = payment.orderPayments.find((r) => r.orderId === c.o.id);
          if (row?.method === 'cod') row.deliveredAt = c.at;
        },
      });
    }),
  ),

  // Quét nhận hàng hoàn: mã quét phải là mã kiện hoặc mã vận đơn
  http.post(`${API}/fulfillment/packages/:id/receive-return`, ({ params, request }) =>
    withPackage(request, params.id, PERMISSIONS.fulfillmentProcess, (c) => {
      const code = reasonOf(c.body, 'code').toUpperCase();
      if (code !== c.p.code && code !== c.p.trackingCode?.toUpperCase()) {
        return problem(422, 'Mã quét không khớp kiện', {
          code: 'package_mismatch',
          errors: { code: `Mã quét không phải ${c.p.code}` },
        });
      }
      return step(c, 'receive_return', { effect: () => inspectReturn(c.p, `Hàng hoàn kiện ${c.p.code}`, c.at) });
    }),
  ),

  // Báo thất lạc: ghi mã khiếu nại với đơn vị vận chuyển, chờ người thứ hai xác nhận
  http.post(`${API}/fulfillment/packages/:id/report-lost`, ({ params, request }) =>
    withPackage(request, params.id, PERMISSIONS.fulfillmentProcess, (c) => {
      const claimCode = reasonOf(c.body, 'claimCode');
      if (!claimCode) return problem(422, 'Dữ liệu không hợp lệ', { errors: { claimCode: 'Nhập mã khiếu nại' } });
      if (claimCode.length > 100) return problem(422, 'Dữ liệu không hợp lệ', { errors: { claimCode: 'Tối đa 100 ký tự' } });
      if (c.p.lostReport) return problem(409, 'Kiện đã được báo thất lạc', { code: 'already_reported', current: toPackage(c.p) });
      if (!packageMachine.transitions.some((t) => t.action === 'lose' && (t.from as readonly string[]).includes(c.p.status))) {
        return problem(409, 'Kiện ở trạng thái này không báo thất lạc được', { code: 'invalid_transition', current: toPackage(c.p) });
      }
      const before = packageSnapshot(c.p);
      c.p.lostReport = { by: c.actor.account.id, at: c.at, claimCode };
      c.p.version += 1;
      writeCompanyLog(c.actor, 'update', packageEntity(c.p), before, packageSnapshot(c.p));
      return HttpResponse.json(toPackage(c.p));
    }),
  ),

  http.post(`${API}/fulfillment/packages/:id/confirm-lost`, ({ params, request }) =>
    withPackage(request, params.id, PERMISSIONS.fulfillmentProcess, (c) => {
      const report = c.p.lostReport;
      if (!report) return problem(409, 'Kiện chưa được báo thất lạc', { code: 'not_reported', current: toPackage(c.p) });
      // Kiện tự giao: người xác nhận còn phải khác người đi giao
      if (c.p.selfDelivery && c.p.deliveredBy === c.actor.account.id) {
        return problem(409, 'Cần người thứ hai', { code: 'second_person_required', current: c.p.status });
      }
      return step(c, 'lose', { reason: report.claimCode, record: { createdBy: report.by } });
    }),
  ),

  http.post(`${API}/fulfillment/packages/:id/found`, ({ params, request }) =>
    withPackage(request, params.id, PERMISSIONS.fulfillmentProcess, (c) =>
      step(c, 'found', { effect: () => inspectReturn(c.p, `Tìm thấy kiện thất lạc ${c.p.code}`, c.at) }),
    ),
  ),
];

/**
 * Huỷ đơn (người bán hoặc sàn): kiện chưa đóng gói huỷ ngay, nhả hàng; kiện đã đóng gói gắn Chờ mở kiện.
 * Còn kiện chờ mở thì đơn mang cờ Đang huỷ; mở hết thì huỷ hẳn. Trả về số kiện chờ mở.
 */
export function startCancel(o: MockOrder, reason: string, at: string, by: string | null, source?: StatusChangeSource) {
  const own = packagesOf(o);
  const touched: string[] = [];
  for (const p of own) {
    if (p.status === 'reserved' || p.status === 'backordered') {
      if (p.status === 'reserved') releasePackage(p);
      movePackage(p, 'cancelled', at, by, { source, reason });
      touched.push(...p.lines.map((l) => l.variantId));
    } else if (isSealed(p.status)) {
      p.needsOpen = true;
      p.openPurpose = 'cancel';
      p.flagNote = `Đơn ${o.code} đã huỷ: mở kiện, trả hàng về kệ`;
      p.version += 1;
    }
  }
  o.cancelReason = reason;
  const pendingOpen = own.filter((p) => p.needsOpen && p.openPurpose === 'cancel').length;
  if (cancelPlan(own.map((p) => p.status)) === 'after_open') {
    if (!o.flags.includes('cancelling')) o.flags.push('cancelling');
    o.version += 1;
  } else {
    finishCancel(o, at, by, source);
  }
  if (touched.length) rebalancePackages(o.companyId, touched);
  return pendingOpen;
}

// ---------- Việc cần làm ----------

registerTaskSource({
  kind: 'package.lost_reported',
  permission: PERMISSIONS.fulfillmentProcess,
  collect: (companyId, now) =>
    fulfillment.packages
      .filter((p) => p.companyId === companyId && p.lostReport && p.status !== 'lost')
      .map((p) => ({
        id: `package.lost_reported:${p.id}`,
        kind: 'package.lost_reported',
        group: 'Giao vận',
        title: `Xác nhận thất lạc kiện ${p.code}`,
        detail: `Mã khiếu nại ${p.lostReport!.claimCode}; người khác người báo xác nhận.`,
        ...dueState(p.lostReport!.at, 24 * 3600_000, now),
        ref: { type: 'package' as const, id: p.id },
      })),
});

registerTaskSource({
  kind: 'package.needs_open',
  permission: PERMISSIONS.fulfillmentProcess,
  collect: (companyId, now) =>
    fulfillment.packages
      .filter((p) => p.companyId === companyId && (p.needsOpen || p.needsAttention))
      .map((p) => ({
        id: `package.needs_open:${p.id}`,
        kind: 'package.needs_open',
        group: 'Giao vận',
        title: p.needsOpen ? `Mở kiện ${p.code}` : `Xử lý kiện ${p.code}`,
        detail: p.flagNote ?? '',
        ...dueState(p.history.at(-1)?.at ?? p.createdAt, 24 * 3600_000, now),
        ref: { type: 'package' as const, id: p.id },
      })),
});

// ---------- Sàn giả lập: đơn mới, khách trả tiền, cập nhật vận chuyển, sàn huỷ, job hoàn tất ----------

function findOrderByCode(companyId: string, code: string | undefined) {
  const key = code?.trim().toUpperCase();
  if (!key) throw new Error('Nhập mã đơn');
  const o = sales.orders.find((x) => x.companyId === companyId && x.code.toUpperCase() === key);
  if (!o) throw new Error(`Không có đơn ${key}`);
  return o;
}

registerMarketplaceEvent({
  type: 'order.created',
  label: 'Đơn mới',
  description:
    'Sàn đẩy đơn mới, chưa thanh toán (UNPAID). Kiện giữ hàng ngay nếu đủ; SKU chưa ghép thì đơn mang cờ Chưa ghép SKU.',
  group: 'Đơn bán',
  needsShop: true,
  param: { key: 'sku', label: 'SKU (người bán)', placeholder: 'Bỏ trống: listing đầu tiên đã ghép' },
  realtime: null,
  run({ companyId, shop, params }) {
    if (!shop) throw new Error('Chọn gian hàng');
    if (shop.status !== 'active') throw new Error('Gian hàng không ở trạng thái đang kết nối');
    const key = params.sku?.trim().toLowerCase();
    const remote = (channel.remoteSkus[shop.id] ?? []).find((r) => !key || r.sellerSku.toLowerCase() === key);
    const listing = remote ? channel.listings.find((l) => l.shopId === shop.id && l.externalSkuId === remote.externalSkuId) : undefined;
    if (key && !remote) throw new Error(`Gian hàng không có SKU ${params.sku}`);
    const at = db.now();
    const variantId = listing?.variantId ?? '';
    const variant = variantId ? variantLabel(companyId, variantId) : null;
    const o: MockOrder = {
      id: rid('ord'),
      companyId,
      code: sales.nextOrderCode(companyId),
      source: 'marketplace',
      shopId: shop.id,
      customerId: null,
      status: 'unpaid',
      flags: variantId ? [] : ['unmapped_sku'],
      outcome: null,
      rawMarketplaceStatus: 'UNPAID',
      shipBy: new Date(Date.parse(at) + 48 * 3600_000).toISOString(),
      paymentMethod: null,
      shippingAddress: { name: 'Khách sàn', phone: '0900000000', address: 'Địa chỉ trên sàn' },
      shippingFee: 0,
      note: '',
      cancelReason: null,
      lines: [
        {
          id: `${rid('orl')}-0`,
          variantId,
          sku: variant?.sku ?? '',
          productName: remote?.title ?? 'Sản phẩm sàn',
          quantity: 1,
          unitPrice: (variantId ? ensureStandard(companyId).prices[variantId] : null) ?? remote?.price ?? 0,
          externalSku: variantId ? undefined : (remote?.sellerSku ?? params.sku ?? ''),
        },
      ],
      history: [{ from: null, to: 'unpaid', at, by: null, source: 'marketplace' }],
      createdAt: at,
      createdBy: null,
      version: 1,
    };
    sales.orders.push(o);
    const total = o.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, o.shippingFee);
    emitRealtime(companyId, 'sales.order_created', { orderId: o.id, code: o.code, source: o.source, total });
    // Dòng chưa ghép SKU: chưa lập kiện, chờ ghép
    if (!variantId) return `${o.code}: SKU ${o.lines[0]!.externalSku} chưa ghép`;
    const p = newPackage(o, [{ variantId, quantity: 1 }], false, at);
    placePackage(p, at);
    return `${o.code}: kiện ${p.code} ${p.status === 'reserved' ? 'đã giữ hàng' : 'thiếu hàng'}`;
  },
});

registerMarketplaceEvent({
  type: 'order.paid',
  label: 'Khách trả tiền',
  description: 'Đơn sàn chưa thanh toán sang Đang xử lý (READY_TO_SHIP); kiện đã giữ vào hàng đợi đóng gói.',
  group: 'Đơn bán',
  needsShop: false,
  param: { key: 'code', label: 'Mã đơn', placeholder: 'DH-001025' },
  run({ companyId, params }) {
    const o = findOrderByCode(companyId, params.code);
    if (o.source !== 'marketplace') throw new Error('Chỉ đơn sàn');
    if (o.status !== 'unpaid') throw new Error('Đơn không ở Chưa thanh toán');
    payOrder(o, db.now(), 'marketplace');
    o.rawMarketplaceStatus = 'READY_TO_SHIP';
    return `${o.code} sang Đang xử lý`;
  },
});

const PLATFORM_STATUSES: Record<string, { to: PackageStatus; raw: string }> = {
  in_transit: { to: 'in_transit', raw: 'SHIPPED' },
  delivered: { to: 'delivered', raw: 'TO_CONFIRM_RECEIVE' },
  delivery_failed: { to: 'delivery_failed', raw: 'SHIPPED' },
  returning: { to: 'returning', raw: 'TO_RETURN' },
};

registerMarketplaceEvent({
  type: 'package.shipping_update',
  label: 'Cập nhật vận chuyển',
  description:
    'Sàn đẩy trạng thái kiện: in_transit, delivered, delivery_failed, returning. Nhảy bước trên đường chính thì áp và bù tồn một lần; không áp được thì kiện gắn cờ Cần xử lý.',
  group: 'Đơn bán',
  needsShop: false,
  param: { key: 'target', label: 'Mã kiện và trạng thái', placeholder: 'KH-000005 delivered' },
  run({ companyId, params }) {
    const [code, status] = (params.target ?? '').trim().split(/\s+/);
    const next = PLATFORM_STATUSES[status ?? ''];
    if (!code || !next) throw new Error('Nhập mã kiện và một trong: ' + Object.keys(PLATFORM_STATUSES).join(', '));
    const p = fulfillment.packages.find((x) => x.companyId === companyId && x.code === code.toUpperCase());
    if (!p) throw new Error(`Không có kiện ${code}`);
    const o = orderOf(p);
    if (o.source !== 'marketplace') throw new Error('Chỉ kiện của đơn sàn');
    const at = db.now();
    const from = p.status;
    const kind = platformUpdate(from, next.to);
    if (kind === 'invalid') {
      p.needsAttention = true;
      p.flagNote = `Sàn báo ${next.to} khi kiện đang ${from}`;
      p.version += 1;
      return `${p.code}: không áp được, gắn cờ Cần xử lý`;
    }
    if (kind === 'direct') {
      const t = packageMachine.transitions.find(
        (x) => x.to === next.to && (typeof x.from === 'string' ? [x.from] : x.from).includes(from),
      )!;
      const ok = packageMachine.check(from, t.action, { record: recordOf(p, o, { byPlatform: true }), reason: 'Sàn báo' });
      if (!ok.ok) throw new Error(`Không áp được: ${ok.code}`);
    }
    // Nhảy bước: hàng rời kho chỉ trừ một lần
    if (stockEffect(from, next.to) === 'leave') leaveStock(p, at, null);
    movePackage(p, next.to, at, null, { source: 'marketplace', reason: kind === 'jump' ? `Sàn báo nhảy từ ${from}` : null });
    if (next.to === 'delivered') p.deliveredAt = at;
    o.rawMarketplaceStatus = next.raw;
    settleOrder(o, at);
    return `${p.code}: ${from} → ${next.to}${kind === 'jump' ? ' (nhảy bước, đã bù tồn)' : ''}`;
  },
});

registerMarketplaceEvent({
  type: 'order.platform_cancelled',
  label: 'Sàn huỷ đơn',
  description:
    'Chưa kiện nào rời kho: huỷ như người bán huỷ (kiện đã đóng gói chờ mở). Đã có kiện rời kho: đơn mang cờ Sàn đã huỷ, kiện chạy tiếp tới khi dừng.',
  group: 'Đơn bán',
  needsShop: false,
  param: { key: 'code', label: 'Mã đơn', placeholder: 'DH-001012' },
  run({ companyId, params }) {
    const o = findOrderByCode(companyId, params.code);
    if (o.source !== 'marketplace') throw new Error('Chỉ đơn sàn');
    if (o.status === 'cancelled' || o.status === 'completed') throw new Error('Đơn đã đóng');
    const at = db.now();
    o.rawMarketplaceStatus = 'CANCELLED';
    if (packagesOf(o).some((p) => isHandedOver(p.status))) {
      if (!o.flags.includes('platform_cancelled')) o.flags.push('platform_cancelled');
      o.version += 1;
      return `${o.code}: gắn cờ Sàn đã huỷ, kiện đã rời kho chạy tiếp`;
    }
    const pending = startCancel(o, 'Sàn huỷ đơn', at, null, 'marketplace');
    return pending ? `${o.code}: Đang huỷ, ${pending} kiện chờ mở` : `${o.code}: đã huỷ`;
  },
});

registerMarketplaceEvent({
  type: 'order.complete_job',
  label: 'Chạy job hoàn tất đơn',
  description: 'Job hằng giờ: đơn có mọi kiện đã dừng, hết hạn trả hàng, không còn yêu cầu trả, COD đã xác nhận thì hoàn tất.',
  group: 'Đơn bán',
  needsShop: false,
  run({ companyId }) {
    const now = Date.now();
    const done = sales.orders.filter((o) => o.companyId === companyId && o.status === 'processing' && tryComplete(o, now));
    return done.length ? `Hoàn tất ${done.map((o) => o.code).join(', ')}` : 'Không có đơn đủ điều kiện hoàn tất';
  },
});
