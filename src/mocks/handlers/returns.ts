import { http, HttpResponse, delay } from 'msw';
import { db } from '../db';
import * as catalog from '../catalogData';
import * as inventory from '../inventoryData';
import * as sales from '../salesData';
import * as fulfillment from '../fulfillmentData';
import * as returns from '../returnsData';
import type { MockReturnLine, MockReturnRequest, MockUnmatchedParcel } from '../returnsData';
import type { MockOrder, MockPackage } from '../salesData';
import { PERMISSIONS } from '@/utils/permissions';
import type { PackageStatus } from '@/types/fulfillment';
import type { StatusChangeSource } from '@/types/sales';
import type {
  ReceiveResult,
  ReturnAction,
  ReturnCloseResult,
  PlatformHistoryList,
  ReturnListResponse,
  ReturnReason,
  ReturnReasonList,
  ReturnRequest,
  ReturnRequestSummary,
  ReturnStatus,
  ReturnableLine,
  UnmatchedParcel,
} from '@/types/returns';
import { isRefunded, returnMachine } from '@/lib/machines/returns';
import { API, LATENCY, checkTransition, pageParams, paginate, problem, requireCompany, type CompanyActor } from './utils';
import { versionConflict, writeCompanyLog } from './identity';
import { findOwned, rid } from './catalog';
import { createReturnInspection, registerInspectionPosted, stockLevelOf, variantLabel } from './inventory';
import { packagesOf, toStatusChange, tryComplete, userRef } from './sales';
import { MAX_REASON, deliverForReturn } from './fulfillment';
import { registerMarketplaceEvent } from '../engine/marketplace';
import { DAY, HOUR, dueState, registerTaskSource } from '../engine/tasks';

// ---------- Yêu cầu trả hàng (sơ đồ D3, FE#60): nhận yêu cầu, xử lý, quét nhận, đóng khi kiểm hàng về ghi sổ ----------

const P = PERMISSIONS;
const MAX_LINES = 100;

/** Kiện sàn đã rời kho nhưng chưa giao: sàn báo yêu cầu trả thì nhảy sang Đã giao */
const JUMPABLE: readonly PackageStatus[] = ['awaiting_pickup', 'in_transit', 'delivery_failed'];

const orderOfRequest = (r: MockReturnRequest) => sales.orders.find((o) => o.id === r.orderId)!;
const returnEntity = (r: MockReturnRequest) => ({ type: 'sales.returns', id: r.id, label: r.code });
const returnSnapshot = (r: MockReturnRequest) => ({ code: r.code, status: r.status, closeResult: r.closeResult });
const totalQty = (r: MockReturnRequest) => r.lines.reduce((s, l) => s + l.quantity, 0);
const refundOf = (r: MockReturnRequest) => r.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

function customerName(o: MockOrder) {
  const c = o.customerId ? sales.customers.find((x) => x.id === o.customerId) : undefined;
  return c?.name ?? o.shippingAddress?.name ?? null;
}

function toSummary(r: MockReturnRequest): ReturnRequestSummary {
  const o = orderOfRequest(r);
  const shop = o.shopId ? db.shops.find((s) => s.id === o.shopId) : undefined;
  return {
    id: r.id,
    code: r.code,
    order: { id: o.id, code: o.code },
    source: r.source,
    shopId: o.shopId,
    shopName: shop?.shopName ?? null,
    customerName: customerName(o),
    status: r.status,
    closeResult: r.closeResult,
    rawMarketplaceStatus: r.rawMarketplaceStatus,
    totalQty: totalQty(r),
    refundAmount: refundOf(r),
    createdAt: r.createdAt,
    version: r.version,
  };
}

function toRequest(r: MockReturnRequest, canCost: boolean): ReturnRequest {
  const doc = r.inspectionId ? inventory.docs.find((d) => d.id === r.inspectionId) : undefined;
  const resellCost =
    r.resellQty === null
      ? null
      : r.lines.reduce((sum, l) => {
          const resell = doc?.lines.filter((x) => x.variantId === l.variantId).reduce((s, x) => s + (x.resell ?? 0), 0) ?? 0;
          return sum + Math.min(resell, l.quantity) * l.unitCost;
        }, 0);
  return {
    ...toSummary(r),
    reason: r.reason,
    lines: r.lines.map((l) => ({
      variantId: l.variantId,
      ...variantLabel(r.companyId, l.variantId),
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      packageId: l.packageId,
      packageCode: fulfillment.packages.find((p) => p.id === l.packageId)?.code ?? '',
    })),
    returnTrackingCode: r.returnTrackingCode,
    inspection: doc ? { type: 'stock_document', id: doc.id, number: doc.number } : null,
    receivedAt: r.receivedAt,
    receivedBy: userRef(r.receivedBy),
    money: {
      refundAmount: refundOf(r),
      refunded: isRefunded(r.status, r.closeResult),
      resellQty: r.resellQty,
      resellCost: canCost ? resellCost : null,
    },
    statusHistory: r.history.map((h) => toStatusChange(h, r.source === 'marketplace' ? 'marketplace' : 'manual')),
    platform: platformOf(r),
    rejectReason: reasonRef(r.rejectReasonId),
    attachments: r.attachmentIds.flatMap((id) => {
      const f = catalog.files.find((x) => x.id === id);
      return f?.url ? [{ fileId: f.id, name: f.fileName, url: f.url, contentType: f.contentType }] : [];
    }),
  };
}

// ---------- Đơn ngược phía sàn (§20.1, Lazada reverse order) ----------

/** Lý do từ chối của sàn (GetReverseOrderReasonList); lý do có requiresImage bắt buộc ảnh */
const REJECT_REASONS: ReturnReason[] = [
  { id: '101', label: 'Hàng khách gửi về không đúng sản phẩm', requiresImage: true },
  { id: '102', label: 'Hàng bị khách làm hỏng', requiresImage: true },
  { id: '103', label: 'Khách đã dùng sản phẩm', requiresImage: true },
  { id: '104', label: 'Quá hạn trả hàng', requiresImage: false },
];

function reasonRef(id: string | null) {
  const x = id ? REJECT_REASONS.find((y) => y.id === id) : undefined;
  return x ? { id: x.id, label: x.label } : null;
}

/** reverse_status, ofc_status gốc của sàn theo từng bước */
const PLATFORM: Partial<Record<ReturnAction | 'request', [string, string | null, string]>> = {
  request: ['REQUEST_INITIATE', null, 'Khách tạo yêu cầu trả'],
  accept: ['RETURN_PENDING', 'SELLER_AGREE_RETURN', 'Người bán đồng ý trả (agreeReturn)'],
  reject: ['REQUEST_REJECT', 'SELLER_REFUSE_RETURN', 'Người bán từ chối (refuseReturn)'],
  refund_only: ['REFUND_SUCCESS', 'SELLER_AGREE_REFUND', 'Hoàn tiền, khách giữ hàng (agreeRefund)'],
  platform_reopen: ['RETURN_PENDING', 'CS_APPROVE_RETURN', 'Sàn xử cho khách: trả hàng'],
  platform_refund: ['REFUND_SUCCESS', 'CS_APPROVE_REFUND', 'Sàn xử cho khách: hoàn tiền'],
  receive: ['RETURN_PENDING', 'SELLER_RECEIVE_ITEM', 'Kho đã nhận hàng, đã báo sàn (confirmDelivery)'],
  no_show: ['CANCEL_SUCCESS', 'BUYER_NOT_RETURN', 'Khách không gửi hàng'],
  close: ['REFUND_SUCCESS', 'SELLER_CONFIRM_RECEIVE', 'Kiểm hàng về xong, sàn hoàn tiền khách'],
  buyer_cancel: ['CANCEL_SUCCESS', 'BUYER_CANCEL', 'Khách rút yêu cầu'],
};

function platformStep(r: MockReturnRequest, key: ReturnAction | 'request', at: string) {
  const step = PLATFORM[key];
  if (r.source !== 'marketplace' || !step) return;
  const [reverseStatus, ofcStatus, note] = step;
  r.platformSteps.push({ at, reverseStatus, ofcStatus, note });
  // Người bán từ chối thì khách khiếu nại lên sàn; sàn xử xong thì hết khiếu nại
  r.disputeInProgress = key === 'reject';
}

function platformOf(r: MockReturnRequest): ReturnRequest['platform'] {
  const last = r.platformSteps.at(-1);
  if (r.source !== 'marketplace' || !last) return null;
  return {
    reverseStatus: last.reverseStatus,
    ofcStatus: last.ofcStatus,
    disputeInProgress: r.disputeInProgress,
    returnTo: 'warehouse',
  };
}

function toParcel(x: MockUnmatchedParcel): UnmatchedParcel {
  const r = x.returnRequestId ? returns.requests.find((q) => q.id === x.returnRequestId) : undefined;
  return {
    id: x.id,
    code: x.code,
    note: x.note,
    status: x.status,
    receivedAt: x.receivedAt,
    receivedBy: userRef(x.receivedBy),
    returnRequest: r ? { id: r.id, code: r.code } : null,
    resolvedAt: x.resolvedAt,
    resolvedBy: userRef(x.resolvedBy),
    resolution: x.resolution,
    version: x.version,
  };
}

const canCost = (actor: CompanyActor) => actor.permissions.includes(P.costView);

function move(
  r: MockReturnRequest,
  to: ReturnStatus,
  at: string,
  by: string | null,
  opts: { source?: StatusChangeSource; reason?: string | null; closeResult?: ReturnCloseResult } = {},
) {
  r.history.push({ from: r.status, to, at, by, source: opts.source ?? (by ? 'user' : 'system'), reason: opts.reason ?? null });
  r.status = to;
  if (opts.closeResult) r.closeResult = opts.closeResult;
  r.version += 1;
  // Yêu cầu dừng: đơn hết bị chặn thì hoàn tất
  tryComplete(orderOfRequest(r), Date.parse(at));
}

/** Trạng thái gốc trên sàn theo thao tác (Shopee Returns API) */
const RAW: Partial<Record<ReturnAction, string>> = {
  accept: 'ACCEPTED',
  reject: 'SELLER_DISPUTE',
  refund_only: 'REFUND_PAID',
  platform_reopen: 'ACCEPTED',
  platform_refund: 'REFUND_PAID',
  receive: 'RETURNED',
  no_show: 'CLOSED',
  close: 'CLOSED',
  buyer_cancel: 'CANCELLED',
};

/** Nhận hàng: lập phiếu kiểm hàng về (sơ đồ B3), kho chia bán lại, hỏng, trả NCC; ghi sổ thì đóng yêu cầu */
function receive(r: MockReturnRequest, at: string, by: string, reason: string | null = null) {
  const o = orderOfRequest(r);
  const grouped = new Map<string, number>();
  for (const l of r.lines) grouped.set(l.variantId, (grouped.get(l.variantId) ?? 0) + l.quantity);
  const doc = createReturnInspection(
    r.companyId,
    { type: 'return_request', id: r.id, number: r.code },
    [...grouped].map(([variantId, quantity]) => ({ variantId, quantity })),
    `Hàng trả ${r.code}, đơn ${o.code}`,
    at,
    o.id,
  );
  r.inspectionId = doc.id;
  r.receivedAt = at;
  r.receivedBy = by;
  if (r.source === 'marketplace') r.rawMarketplaceStatus = RAW.receive!;
  platformStep(r, 'receive', at);
  move(r, 'received', at, by, { reason });
}

registerInspectionPosted((doc, at) => {
  if (doc.source?.type !== 'return_request') return;
  const r = returns.requests.find((x) => x.id === doc.source!.id);
  if (!r || r.status !== 'received') return;
  r.resellQty = doc.lines.reduce((s, l) => s + (l.resell ?? 0), 0);
  if (r.source === 'marketplace') r.rawMarketplaceStatus = RAW.close!;
  platformStep(r, 'close', at);
  move(r, 'closed', at, null, { closeResult: 'inspected', reason: `Kiểm hàng về ${doc.number} đã ghi sổ` });
});

// ---------- Số còn trả được ----------

/** Số của biến thể trong kiện đã nằm ở yêu cầu khác (bị từ chối, khách rút thì không tính) */
function claimed(p: MockPackage, variantId: string) {
  return returns.requests
    .filter((r) => r.orderId === p.orderId && r.status !== 'rejected' && r.closeResult !== 'buyer_cancelled')
    .flatMap((r) => r.lines)
    .filter((l) => l.packageId === p.id && l.variantId === variantId)
    .reduce((s, l) => s + l.quantity, 0);
}

interface Slot {
  p: MockPackage;
  variantId: string;
  delivered: number;
  free: number;
}

function slotsOf(o: MockOrder, statuses: readonly PackageStatus[]): Slot[] {
  return packagesOf(o)
    .filter((p) => statuses.includes(p.status))
    .flatMap((p) =>
      p.lines.map((l) => ({ p, variantId: l.variantId, delivered: l.quantity, free: Math.max(0, l.quantity - claimed(p, l.variantId)) })),
    );
}

const unitPriceOf = (o: MockOrder, variantId: string) => o.lines.find((l) => l.variantId === variantId)?.unitPrice ?? 0;

/** Chia số trả theo kiện; thiếu thì trả số tối đa trả được */
function allocate(o: MockOrder, wanted: { variantId: string; quantity: number }[], slots: Slot[]) {
  const lines: MockReturnLine[] = [];
  const short: { index: number; max: number }[] = [];
  wanted.forEach((w, index) => {
    const own = slots.filter((s) => s.variantId === w.variantId);
    const max = own.reduce((s, x) => s + x.free, 0);
    if (w.quantity > max) return short.push({ index, max });
    let left = w.quantity;
    for (const s of own) {
      const take = Math.min(left, s.free);
      if (!take) continue;
      lines.push({
        variantId: w.variantId,
        quantity: take,
        packageId: s.p.id,
        unitPrice: unitPriceOf(o, w.variantId),
        unitCost: stockLevelOf(o.companyId, w.variantId).avgCost,
      });
      s.free -= take;
      left -= take;
    }
  });
  return { lines, short };
}

function newRequest(
  o: MockOrder,
  lines: MockReturnLine[],
  reason: string,
  at: string,
  by: string | null,
): MockReturnRequest {
  const marketplace = o.source === 'marketplace';
  const r: MockReturnRequest = {
    id: rid('rr'),
    companyId: o.companyId,
    code: returns.nextReturnCode(o.companyId),
    orderId: o.id,
    source: marketplace ? 'marketplace' : 'manual',
    status: 'requested',
    closeResult: null,
    reason,
    rawMarketplaceStatus: marketplace ? 'REQUESTED' : null,
    returnTrackingCode: marketplace ? `RT${Date.parse(at).toString().slice(-8)}` : null,
    lines,
    inspectionId: null,
    receivedAt: null,
    receivedBy: null,
    resellQty: null,
    history: [{ from: null, to: 'requested', at, by, source: marketplace ? 'marketplace' : 'user' }],
    rejectReasonId: null,
    attachmentIds: [],
    platformSteps: [],
    disputeInProgress: false,
    createdAt: at,
    createdBy: by,
    version: 1,
  };
  platformStep(r, 'request', at);
  returns.requests.push(r);
  o.version += 1;
  return r;
}

/** Mã quét khớp yêu cầu: mã yêu cầu, mã vận đơn chiều về, hoặc mã đơn có đúng một yêu cầu chờ hàng về */
function matchCode(companyId: string, code: string) {
  const own = returns.requests.filter((r) => r.companyId === companyId);
  const direct = own.find((r) => r.code === code || r.returnTrackingCode?.toUpperCase() === code);
  if (direct) return direct;
  const o = sales.orders.find((x) => x.companyId === companyId && x.code.toUpperCase() === code);
  const waiting = o ? own.filter((r) => r.orderId === o.id && r.status === 'awaiting_return') : [];
  return waiting.length === 1 ? waiting[0] : undefined;
}

const reasonOf = (body: Record<string, unknown>, key = 'reason') =>
  typeof body[key] === 'string' ? (body[key] as string).trim() : '';
const tooLong = (field: string) => problem(422, 'Dữ liệu không hợp lệ', { errors: { [field]: `Tối đa ${MAX_REASON} ký tự` } });

/** Đường dẫn thao tác → thao tác của bảng chuyển */
const ACTIONS: Record<string, ReturnAction> = {
  accept: 'accept',
  reject: 'reject',
  'refund-only': 'refund_only',
  'platform-reopen': 'platform_reopen',
  'platform-refund': 'platform_refund',
  'no-show': 'no_show',
};

export const returnHandlers = [
  http.get(`${API}/returns`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, P.returnView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    const q = (key: string) => url.searchParams.get(key);
    const search = q('search')?.trim().toLowerCase() ?? '';
    const own = returns.requests.filter((r) => r.companyId === guard.value.companyId).map(toSummary);
    const base = own.filter(
      (r) =>
        (!search ||
          r.code.toLowerCase().includes(search) ||
          r.order.code.toLowerCase().includes(search) ||
          Boolean(r.customerName?.toLowerCase().includes(search))) &&
        (!q('source') || r.source === q('source')) &&
        (!q('orderId') || r.order.id === q('orderId')),
    );
    const counts = Object.fromEntries(
      (['requested', 'awaiting_return', 'received', 'closed', 'rejected', 'refund_only'] as ReturnStatus[]).map((s) => [
        s,
        base.filter((r) => r.status === s).length,
      ]),
    ) as ReturnListResponse['counts'];
    counts.unmatched = returns.unmatchedParcels.filter((x) => x.companyId === guard.value.companyId && x.status === 'open').length;
    const items = base.filter((r) => !q('status') || r.status === q('status')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return HttpResponse.json<ReturnListResponse>({ ...paginate(items, page, pageSize), counts });
  }),

  http.get(`${API}/returns/unmatched`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, P.returnView);
    if (!guard.ok) return guard.response;
    const status = new URL(request.url).searchParams.get('status');
    const items = returns.unmatchedParcels
      .filter((x) => x.companyId === guard.value.companyId && (!status || x.status === status))
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      .map(toParcel);
    return HttpResponse.json(items);
  }),

  http.get(`${API}/returns/returnable`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, P.returnProcess);
    if (!guard.ok) return guard.response;
    const found = findOwned(sales.orders, new URL(request.url).searchParams.get('orderId'), guard.value.companyId, 'đơn');
    if (!found.ok) return found.response;
    const o = found.value;
    const byVariant = new Map<string, ReturnableLine>();
    for (const s of slotsOf(o, ['delivered'])) {
      const row = byVariant.get(s.variantId) ?? {
        variantId: s.variantId,
        ...variantLabel(o.companyId, s.variantId),
        unitPrice: unitPriceOf(o, s.variantId),
        delivered: 0,
        returnable: 0,
      };
      row.delivered += s.delivered;
      row.returnable += s.free;
      byVariant.set(s.variantId, row);
    }
    return HttpResponse.json([...byVariant.values()]);
  }),

  http.get(`${API}/returns/:id/reasons`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, P.returnProcess);
    if (!guard.ok) return guard.response;
    const found = findOwned(returns.requests, params.id, guard.value.companyId, 'yêu cầu trả');
    if (!found.ok) return found.response;
    if (found.value.source !== 'marketplace') return problem(422, 'Chỉ yêu cầu từ sàn', { code: 'not_marketplace' });
    const action = new URL(request.url).searchParams.get('action');
    if (action !== 'reject' && action !== 'refuse-refund') {
      return problem(422, 'Dữ liệu không hợp lệ', { errors: { action: 'action là reject hoặc refuse-refund' } });
    }
    return HttpResponse.json<ReturnReasonList>({ items: REJECT_REASONS });
  }),

  http.get(`${API}/returns/:id/platform-history`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, P.returnView);
    if (!guard.ok) return guard.response;
    const found = findOwned(returns.requests, params.id, guard.value.companyId, 'yêu cầu trả');
    if (!found.ok) return found.response;
    if (found.value.source !== 'marketplace') return problem(422, 'Chỉ yêu cầu từ sàn', { code: 'not_marketplace' });
    return HttpResponse.json<PlatformHistoryList>({ items: [...found.value.platformSteps].reverse() });
  }),

  http.get(`${API}/returns/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, P.returnView);
    if (!guard.ok) return guard.response;
    const found = findOwned(returns.requests, params.id, guard.value.companyId, 'yêu cầu trả');
    if (!found.ok) return found.response;
    return HttpResponse.json(toRequest(found.value, canCost(guard.value)));
  }),

  // Sale lập yêu cầu cho đơn tạo tay, hộp thư (khách nhắn); đơn sàn do sàn đẩy về
  http.post(`${API}/returns`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, P.returnProcess);
    if (!guard.ok) return guard.response;
    const body = ((await request.json().catch(() => ({}))) ?? {}) as {
      orderId?: string;
      reason?: string;
      lines?: { variantId?: string; quantity?: number }[];
    };
    const found = findOwned(sales.orders, body.orderId, guard.value.companyId, 'đơn');
    if (!found.ok) return found.response;
    const o = found.value;
    if (o.source === 'marketplace') {
      return problem(422, 'Yêu cầu trả của đơn sàn do sàn đẩy về', { code: 'marketplace_return' });
    }
    const errors: Record<string, string> = {};
    const reason = body.reason?.trim() ?? '';
    if (!reason) errors.reason = 'Nhập lý do trả';
    else if (reason.length > MAX_REASON) errors.reason = `Tối đa ${MAX_REASON} ký tự`;
    const wanted = (body.lines ?? []).filter((l) => (l.quantity ?? 0) !== 0);
    if (!wanted.length) errors.lines = 'Chọn ít nhất một dòng trả';
    if (wanted.length > MAX_LINES) errors.lines = `Tối đa ${MAX_LINES} dòng`;
    wanted.forEach((l, i) => {
      if (!Number.isInteger(l.quantity) || (l.quantity ?? 0) < 1) errors[`lines.${i}.quantity`] = 'Số lượng là số nguyên dương';
    });
    if (Object.keys(errors).length) return problem(422, 'Dữ liệu không hợp lệ', { errors });
    const { lines, short } = allocate(
      o,
      wanted.map((l) => ({ variantId: String(l.variantId), quantity: l.quantity! })),
      slotsOf(o, ['delivered']),
    );
    if (short.length) {
      return problem(422, 'Vượt số trả được', {
        code: 'return_exceeds_delivered',
        errors: Object.fromEntries(short.map((s) => [`lines.${s.index}.quantity`, `Còn trả được ${s.max}`])),
      });
    }
    const r = newRequest(o, lines, reason, db.now(), guard.value.account.id);
    writeCompanyLog(guard.value, 'create', returnEntity(r), null, returnSnapshot(r));
    return HttpResponse.json(toRequest(r, canCost(guard.value)), { status: 201 });
  }),

  // Kho quét mã trên kiện hàng trả về: khớp thì nhận, không khớp thì vào khu chờ xử lý
  http.post(`${API}/returns/receive`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, P.fulfillmentProcess);
    if (!guard.ok) return guard.response;
    const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    const code = reasonOf(body, 'code').toUpperCase();
    const note = reasonOf(body, 'note');
    if (!code) return problem(422, 'Dữ liệu không hợp lệ', { errors: { code: 'Quét hoặc nhập mã' } });
    if (note.length > MAX_REASON) return tooLong('note');
    const actor = guard.value;
    const at = db.now();
    const r = matchCode(actor.companyId, code);
    if (r) {
      const next = checkTransition(returnMachine, r.status, 'receive', actor, { source: r.source });
      if (!next.ok) {
        return problem(409, 'Yêu cầu không chờ hàng về', {
          code: 'return_not_awaiting',
          errors: { code: `${r.code} không ở trạng thái Chờ hàng về` },
        });
      }
      const before = returnSnapshot(r);
      receive(r, at, actor.account.id, note || null);
      writeCompanyLog(actor, 'update', returnEntity(r), before, returnSnapshot(r));
      return HttpResponse.json<ReceiveResult>({ kind: 'matched', request: toRequest(r, canCost(actor)) });
    }
    const parcel: MockUnmatchedParcel = {
      id: rid('rp'),
      companyId: actor.companyId,
      code,
      note,
      status: 'open',
      receivedAt: at,
      receivedBy: actor.account.id,
      returnRequestId: null,
      resolvedAt: null,
      resolvedBy: null,
      resolution: null,
      version: 1,
    };
    returns.unmatchedParcels.push(parcel);
    writeCompanyLog(actor, 'create', { type: 'sales.return_parcels', id: parcel.id, label: code }, null, { code, status: 'open' });
    return HttpResponse.json<ReceiveResult>({ kind: 'unmatched', parcel: toParcel(parcel) });
  }),

  // Gắn kiện lạ vào yêu cầu chờ hàng về: yêu cầu sang Đã nhận
  http.post(`${API}/returns/unmatched/:id/attach`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, P.fulfillmentProcess);
    if (!guard.ok) return guard.response;
    const found = findOwned(returns.unmatchedParcels, params.id, guard.value.companyId, 'kiện hàng trả');
    if (!found.ok) return found.response;
    const x = found.value;
    const body = ((await request.json().catch(() => ({}))) ?? {}) as { version?: number; returnRequestId?: string };
    if (body.version !== x.version) return versionConflict(toParcel(x), 'Kiện vừa được người khác xử lý.');
    if (x.status !== 'open') return problem(409, 'Kiện đã xử lý', { code: 'parcel_resolved' });
    const target = returns.requests.find((r) => r.id === body.returnRequestId && r.companyId === x.companyId);
    if (!target) return problem(422, 'Dữ liệu không hợp lệ', { errors: { returnRequestId: 'Chọn yêu cầu trả' } });
    const actor = guard.value;
    const next = checkTransition(returnMachine, target.status, 'receive', actor, { source: target.source });
    if (!next.ok) {
      return problem(409, 'Yêu cầu không chờ hàng về', {
        code: 'return_not_awaiting',
        errors: { returnRequestId: `${target.code} không ở trạng thái Chờ hàng về` },
      });
    }
    const at = db.now();
    const before = returnSnapshot(target);
    receive(target, at, actor.account.id, `Gắn kiện không khớp ${x.code}`);
    x.status = 'attached';
    x.returnRequestId = target.id;
    x.resolvedAt = at;
    x.resolvedBy = actor.account.id;
    x.version += 1;
    writeCompanyLog(actor, 'update', returnEntity(target), before, returnSnapshot(target));
    return HttpResponse.json(toParcel(x));
  }),

  // Kiện lạ không thuộc yêu cầu nào: ghi cách xử lý (trả lại ĐVVC, nhập kho qua phiếu kiểm...)
  http.post(`${API}/returns/unmatched/:id/dismiss`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, P.fulfillmentProcess);
    if (!guard.ok) return guard.response;
    const found = findOwned(returns.unmatchedParcels, params.id, guard.value.companyId, 'kiện hàng trả');
    if (!found.ok) return found.response;
    const x = found.value;
    const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    if (body.version !== x.version) return versionConflict(toParcel(x), 'Kiện vừa được người khác xử lý.');
    if (x.status !== 'open') return problem(409, 'Kiện đã xử lý', { code: 'parcel_resolved' });
    const reason = reasonOf(body);
    if (!reason) return problem(422, 'Dữ liệu không hợp lệ', { errors: { reason: 'Nhập cách xử lý' } });
    if (reason.length > MAX_REASON) return tooLong('reason');
    x.status = 'dismissed';
    x.resolution = reason;
    x.resolvedAt = db.now();
    x.resolvedBy = guard.value.account.id;
    x.version += 1;
    writeCompanyLog(guard.value, 'update', { type: 'sales.return_parcels', id: x.id, label: x.code }, { status: 'open' }, { status: 'dismissed' });
    return HttpResponse.json(toParcel(x));
  }),

  http.post(`${API}/returns/:id/:action`, async ({ params, request }) => {
    await delay(LATENCY);
    const action = ACTIONS[String(params.action)];
    if (!action) return problem(404, 'Không có thao tác này', { code: 'not_found' });
    const guard = requireCompany(request, P.returnView);
    if (!guard.ok) return guard.response;
    const found = findOwned(returns.requests, params.id, guard.value.companyId, 'yêu cầu trả');
    if (!found.ok) return found.response;
    const r = found.value;
    const actor = guard.value;
    const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    if (body.version !== r.version) return versionConflict(toRequest(r, canCost(actor)), 'Yêu cầu vừa được người khác cập nhật.');
    let reason = reasonOf(body);
    if (reason.length > MAX_REASON) return tooLong('reason');
    let rejected: { reasonId: string; attachmentIds: string[] } | null = null;
    if (action === 'reject' && r.source === 'marketplace') {
      const picked = REJECT_REASONS.find((x) => x.id === body.reasonId);
      const comment = reasonOf(body, 'comment');
      const ids = Array.isArray(body.attachmentIds) ? body.attachmentIds.filter((x): x is string => typeof x === 'string') : [];
      const errors: Record<string, string> = {};
      if (!picked) errors.reasonId = 'Chọn lý do từ chối';
      if (comment.length > MAX_REASON) errors.comment = `Tối đa ${MAX_REASON} ký tự`;
      if (ids.length > 10) errors.attachmentIds = 'Tối đa 10 tệp';
      else if (ids.some((id) => !catalog.files.some((f) => f.id === id && f.companyId === r.companyId && f.url))) {
        errors.attachmentIds = 'Có tệp chưa tải xong hoặc không thuộc công ty';
      } else if (picked?.requiresImage && !ids.length) errors.attachmentIds = 'Lý do này cần ảnh làm bằng chứng';
      if (Object.keys(errors).length) return problem(422, 'Dữ liệu không hợp lệ', { errors });
      reason = comment ? `${picked!.label}: ${comment}` : picked!.label;
      rejected = { reasonId: picked!.id, attachmentIds: ids };
    }
    const next = checkTransition(returnMachine, r.status, action, actor, { source: r.source }, reason || null);
    if (!next.ok) return next.response;
    const before = returnSnapshot(r);
    if (r.source === 'marketplace' && RAW[action]) r.rawMarketplaceStatus = RAW[action]!;
    if (rejected) {
      r.rejectReasonId = rejected.reasonId;
      r.attachmentIds = rejected.attachmentIds;
    }
    platformStep(r, action, db.now());
    move(r, next.value, db.now(), actor.account.id, {
      reason: reason || null,
      closeResult: action === 'no_show' ? 'no_show' : undefined,
    });
    writeCompanyLog(actor, 'update', returnEntity(r), before, returnSnapshot(r));
    return HttpResponse.json(toRequest(r, canCost(actor)));
  }),
];

// ---------- Sàn giả lập ----------

function findOrder(companyId: string, code: string | undefined) {
  const key = code?.trim().toUpperCase();
  if (!key) throw new Error('Nhập mã đơn');
  const o = sales.orders.find((x) => x.companyId === companyId && x.code.toUpperCase() === key);
  if (!o) throw new Error(`Không có đơn ${key}`);
  return o;
}

function findRequest(companyId: string, code: string | undefined) {
  const key = code?.trim().toUpperCase();
  if (!key) throw new Error('Nhập mã yêu cầu trả');
  const r = returns.requests.find((x) => x.companyId === companyId && x.code === key);
  if (!r) throw new Error(`Không có yêu cầu ${key}`);
  if (r.source !== 'marketplace') throw new Error('Chỉ yêu cầu từ sàn');
  return r;
}

registerMarketplaceEvent({
  type: 'return.requested',
  label: 'Khách yêu cầu trả',
  description:
    'Sàn đẩy yêu cầu trả (REQUESTED), luôn nhận kể cả đơn đã hoàn tất. Ghi SKU:số để trả một phần. Kiện đã rời kho mà chưa giao thì nhảy sang Đã giao, gắn cờ Cần xử lý.',
  group: 'Trả hàng',
  needsShop: false,
  param: { key: 'target', label: 'Mã đơn, SKU:số', placeholder: 'DH-001025 hoặc DH-001025 AO-TRANG-M:1' },
  run({ companyId, params }) {
    const [code, ...parts] = (params.target ?? '').trim().split(/\s+/);
    const o = findOrder(companyId, code);
    if (o.source !== 'marketplace') throw new Error('Chỉ đơn sàn');
    if (o.status === 'cancelled') throw new Error('Đơn đã huỷ');
    const at = db.now();
    const jumped = packagesOf(o).filter((p) => JUMPABLE.includes(p.status));
    for (const p of jumped) deliverForReturn(p, at);
    const slots = slotsOf(o, ['delivered']);
    if (!slots.length) throw new Error('Đơn chưa có kiện rời kho');
    const wanted = parts.length
      ? parts.map((part) => {
          const [sku, qty] = part.split(':');
          const line = o.lines.find((l) => l.sku.toUpperCase() === sku.toUpperCase());
          if (!line) throw new Error(`Đơn không có SKU ${sku}`);
          return { variantId: line.variantId, quantity: Number(qty ?? line.quantity) };
        })
      : [...new Set(slots.map((s) => s.variantId))].map((variantId) => ({
          variantId,
          quantity: slots.filter((s) => s.variantId === variantId).reduce((n, s) => n + s.free, 0),
        }));
    const { lines, short } = allocate(
      o,
      wanted.filter((w) => w.quantity > 0),
      slots,
    );
    if (short.length || !lines.length) throw new Error('Vượt số còn trả được');
    const r = newRequest(o, lines, 'Khách yêu cầu trả trên sàn', at, null);
    return `${r.code} cho ${o.code}${jumped.length ? `; ${jumped.map((p) => p.code).join(', ')} nhảy sang Đã giao` : ''}`;
  },
});

registerMarketplaceEvent({
  type: 'return.judged',
  label: 'Sàn xử cho khách',
  description: 'Người bán đã từ chối, sàn xử cho khách (JUDGING): return mở lại chờ hàng về, refund hoàn tiền khách giữ hàng.',
  group: 'Trả hàng',
  needsShop: false,
  param: { key: 'target', label: 'Mã yêu cầu và cách xử', placeholder: 'YCT-000003 return' },
  run({ companyId, params }) {
    const [code, how] = (params.target ?? '').trim().split(/\s+/);
    const r = findRequest(companyId, code);
    const action: ReturnAction = how === 'refund' ? 'platform_refund' : 'platform_reopen';
    if (how && how !== 'refund' && how !== 'return') throw new Error('Cách xử: return hoặc refund');
    const ok = returnMachine.check(r.status, action, { record: { source: r.source } });
    if (!ok.ok) throw new Error(`${r.code} không ở trạng thái Đã từ chối`);
    r.rawMarketplaceStatus = RAW[action]!;
    platformStep(r, action, db.now());
    move(r, ok.to, db.now(), null, { source: 'marketplace', reason: 'Sàn xử cho khách' });
    return `${r.code} → ${ok.to}`;
  },
});

registerMarketplaceEvent({
  type: 'return.buyer_cancelled',
  label: 'Khách rút yêu cầu trả',
  description: 'Khách huỷ yêu cầu trước khi gửi hàng (CANCELLED): yêu cầu đóng, đơn hết cờ Có yêu cầu trả.',
  group: 'Trả hàng',
  needsShop: false,
  param: { key: 'code', label: 'Mã yêu cầu', placeholder: 'YCT-000003' },
  run({ companyId, params }) {
    const r = findRequest(companyId, params.code);
    const ok = returnMachine.check(r.status, 'buyer_cancel', { record: { source: r.source } });
    if (!ok.ok) throw new Error(`${r.code} không rút được ở trạng thái hiện tại`);
    r.rawMarketplaceStatus = RAW.buyer_cancel!;
    platformStep(r, 'buyer_cancel', db.now());
    move(r, 'closed', db.now(), null, { source: 'marketplace', closeResult: 'buyer_cancelled', reason: 'Khách rút yêu cầu' });
    return `${r.code} đã đóng`;
  },
});

// ---------- Nhắc việc ----------

registerTaskSource({
  kind: 'return.requested',
  permission: P.returnProcess,
  collect: (companyId, now) =>
    returns.requests
      .filter((r) => r.companyId === companyId && r.status === 'requested')
      .map((r) => ({
        id: `return.requested:${r.id}`,
        kind: 'return.requested',
        group: 'Bán hàng',
        title: `Xử lý yêu cầu trả ${r.code}`,
        detail: `Đơn ${orderOfRequest(r).code}: chấp nhận, từ chối hoặc hoàn tiền.`,
        ...dueState(r.createdAt, 2 * DAY, now),
        ref: { type: 'return_request' as const, id: r.id },
      })),
});

registerTaskSource({
  kind: 'return.unmatched',
  permission: P.fulfillmentProcess,
  collect: (companyId, now) =>
    returns.unmatchedParcels
      .filter((x) => x.companyId === companyId && x.status === 'open')
      .map((x) => ({
        id: `return.unmatched:${x.id}`,
        kind: 'return.unmatched',
        group: 'Giao vận',
        title: `Kiện hàng trả không khớp ${x.code}`,
        detail: 'Đang ở khu chờ xử lý: gắn vào yêu cầu trả hoặc ghi cách xử lý.',
        ...dueState(x.receivedAt, 24 * HOUR, now),
        ref: { type: 'return_parcel' as const, id: x.id },
      })),
});
