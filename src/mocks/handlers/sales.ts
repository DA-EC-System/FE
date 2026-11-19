import { payments as orderSettlements } from '../financeLifecycleData';
import { http, HttpResponse, delay } from 'msw';
import { db } from '../db';
import { PERMISSIONS } from '@/utils/permissions';
import * as sales from '../salesData';
import * as payment from '../paymentData';
import * as fulfillment from '../fulfillmentData';
import { openRequestsOf } from '../returnsData';
import type {
  LineCancelInitiator,
  Order,
  OrderFlag,
  OrderSummary,
  StatusChangeSource,
  UserRef,
} from '@/types/sales';
import { API, LATENCY, checkTransition, pageParams, paginate, problem, requireCompany } from './utils';
import { versionConflict, writeCompanyLog } from './identity';
import { fileUrl, findOwned } from './catalog';
import { findVariant, stockLevelOf, variantLabel } from './inventory';
import { availableOf as stockAvailable } from '../engine/stock';
import type { StatusChange } from '@/lib/stateMachine';
import { toPackageSummary } from './fulfillment';
import {
  RETURN_WINDOW_DAYS,
  completionBlocker,
  isDueSoon,
  isStopped,
  orderMachine,
  outcomeOf,
  stageOf,
  type OrderRecord,
} from '@/lib/machines/order';

// ---------- Bán hàng: đơn (UC-SF-01, 02; đơn theo sơ đồ D1, FE#59) ----------

/** Ngày theo giờ Việt Nam (C6) */
export const vnDate = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);

export const userRef = (accountId: string | null): UserRef | null => {
  const a = accountId ? db.accounts.find((x) => x.id === accountId) : undefined;
  return a ? { id: a.id, name: a.fullName } : null;
};

/** Khả dụng = tồn thực − đang giữ − tạm khoá (sơ đồ B2) */
export const availableOf = (companyId: string, variantId: string) => stockAvailable(stockLevelOf(companyId, variantId));

export const packagesOf = (o: sales.MockOrder) => fulfillment.packages.filter((p) => p.orderId === o.id);

export const orderRecord = (o: sales.MockOrder): OrderRecord => ({
  source: o.source,
  paymentMethod: o.paymentMethod,
  packages: packagesOf(o).map((p) => p.status),
});

export function toStatusChange<S extends string>(h: sales.MockStatusChange<S>, source: sales.MockOrder['source']): StatusChange<S> {
  return {
    at: h.at,
    from: h.from,
    to: h.to,
    by: userRef(h.by),
    source: h.source ?? (h.by ? 'user' : source === 'marketplace' ? 'marketplace' : 'system'),
    reason: h.reason ?? null,
  };
}

export function pushOrderHistory(
  o: sales.MockOrder,
  to: sales.MockOrder['status'],
  at: string,
  by: string | null,
  source?: StatusChangeSource,
  reason: string | null = null,
) {
  o.history.push({ from: o.status, to, at, by, source: source ?? (by ? 'user' : 'system'), reason });
  o.status = to;
  o.version += 1;
}

/** Khách trả tiền (cổng thanh toán, gán khoản thu, sàn báo): đơn chưa thanh toán sang Đang xử lý */
export function payOrder(o: sales.MockOrder, at: string, source: StatusChangeSource = 'system') {
  if (!orderMachine.check(o.status, 'pay').ok) return;
  pushOrderHistory(o, 'processing', at, null, source);
}

/** Đơn đang huỷ đã mở hết kiện đóng gói, hoặc huỷ ngay: chuyển Đã huỷ, hoàn tiền nếu đã trả */
export function finishCancel(o: sales.MockOrder, at: string, by: string | null = null, source?: StatusChangeSource) {
  o.flags = o.flags.filter((f) => f !== 'cancelling');
  pushOrderHistory(o, 'cancelled', at, by, source, o.cancelReason);
  for (const link of payment.links) {
    if (link.orderId === o.id && link.status === 'active') link.status = 'cancelled';
  }
  const row = payment.orderPayments.find((p) => p.orderId === o.id);
  if (row?.status === 'paid') {
    row.refundStatus = 'pending_refund';
    row.refundRequestedAt = at;
  }
}

/** Đơn COD của người bán (tạo tay, hộp thư) đã giao mà kế toán chưa xác nhận tiền */
/** Số hoá đơn tối đa (§19.3) */
const MAX_INVOICE = 50;

const codUnconfirmed = (o: sales.MockOrder, delivered: boolean) =>
  o.source !== 'marketplace' &&
  o.paymentMethod === 'cod' &&
  delivered &&
  payment.orderPayments.find((p) => p.orderId === o.id)?.status !== 'cod_collected';

const lastDeliveredAt = (o: sales.MockOrder) =>
  packagesOf(o).reduce<string | null>((max, p) => (p.deliveredAt && (!max || p.deliveredAt > max) ? p.deliveredAt : max), null);

function blockerOf(o: sales.MockOrder, now: number) {
  const own = packagesOf(o);
  const statuses = own.map((p) => p.status);
  return completionBlocker({
    packages: statuses,
    lastDeliveredAt: lastDeliveredAt(o),
    openReturnRequests: openRequestsOf(o.id),
    codUnconfirmed: codUnconfirmed(o, statuses.includes('delivered')),
    now,
  });
}

/** Job hoàn tất (và sau mỗi lần kiện dừng, kế toán xác nhận COD): đủ điều kiện thì hoàn tất; trả về đã hoàn tất hay chưa */
export function tryComplete(o: sales.MockOrder, now: number) {
  if (o.status !== 'processing' || o.flags.includes('cancelling') || blockerOf(o, now)) return false;
  o.outcome = outcomeOf(packagesOf(o).map((p) => p.status));
  o.flags = o.flags.filter((f) => f !== 'platform_cancelled');
  pushOrderHistory(o, 'completed', new Date(now).toISOString(), null, 'system');
  return true;
}

/** Cờ lưu cộng cờ suy ra lúc đọc */
function flagsOf(o: sales.MockOrder, now: number): OrderFlag[] {
  const flags = new Set(o.flags);
  const own = packagesOf(o);
  const open = o.status === 'unpaid' || o.status === 'processing';
  if (open && own.some((p) => p.needsAttention)) flags.add('needs_attention');
  // Đơn đã hoàn tất vẫn nhận yêu cầu trả: chỉ mang cờ
  if (openRequestsOf(o.id) > 0) flags.add('return_requested');
  if (open && isDueSoon(o.shipBy, own.map((p) => p.status), now)) flags.add('due_soon');
  return [...flags];
}

/** Ảnh, thuộc tính của dòng: sàn trả thì dùng, không thì lấy của biến thể đã ghép (BE#260 bước 3) */
function lineMedia(o: sales.MockOrder, l: sales.MockOrderLine) {
  const found = l.variantId ? findVariant(l.variantId) : null;
  const image = found?.product.imageFileIds[0];
  return {
    thumbnailUrl: l.thumbnailUrl ?? (image ? fileUrl(image) : null),
    attributesLabel: l.attributesLabel ?? (l.variantId ? variantLabel(o.companyId, l.variantId).attributesLabel : ''),
  };
}

/** Trường dòng lấy từ sàn; đơn tạo tay thì null hết */
function platformLine(x: sales.MockPlatformLine | undefined) {
  return {
    externalSkuId: x?.externalSkuId ?? null,
    externalShopSku: x?.externalShopSku ?? null,
    externalProductId: x?.externalProductId ?? null,
    paidPrice: x?.paidPrice ?? null,
    taxAmount: x?.taxAmount ?? null,
    cancelReason: x?.cancelReason ?? null,
    cancelReasonDetail: x?.cancelReasonDetail ?? null,
    cancelInitiator: x?.cancelInitiator ?? null,
    cancelKind: x?.cancelKind ?? null,
    reverseOrderId: x?.reverseOrderId ?? null,
    returnStatus: x?.returnStatus ?? null,
  };
}

export function toOrderSummary(o: sales.MockOrder): OrderSummary {
  const customer = o.customerId ? sales.customers.find((c) => c.id === o.customerId) : undefined;
  const shop = o.shopId ? db.shops.find((s) => s.id === o.shopId) : undefined;
  const statuses = packagesOf(o).map((p) => p.status);
  const live = statuses.filter((s) => s !== 'cancelled');
  return {
    id: o.id,
    code: o.code,
    source: o.source,
    shop: shop ? { id: shop.id, shopName: shop.shopName, platform: shop.platform } : null,
    customer: customer ? { id: customer.id, name: customer.name, phone: customer.phone } : null,
    status: o.status,
    paymentStatus: orderSettlements.find((p) => p.orderId === o.id)?.status ?? 'none',
    display: {
      stage: stageOf({ status: o.status, source: o.source, paymentMethod: o.paymentMethod, flags: o.flags, packages: statuses }),
      delivered: live.filter((s) => s === 'delivered').length,
      packages: live.length,
    },
    flags: [...new Set([...flagsOf(o, Date.now()), ...(orderSettlements.find((p) => p.orderId === o.id)?.status === 'mismatch' ? ['payment_mismatch' as const] : [])])],
    outcome: o.outcome,
    rawMarketplaceStatus: o.rawMarketplaceStatus,
    paymentMethod: o.paymentMethod,
    platformPaymentMethod: o.platform?.paymentMethod ?? null,
    shipBy: o.shipBy,
    total: sales.totalOf(o),
    lineCount: o.lines.length,
    totalQty: o.lines.reduce((n, l) => n + l.quantity, 0),
    externalOrderId: o.externalOrderId,
    recipientName: customer ? null : o.shippingAddress.name || null,
    itemsPreview: o.lines[0]
      ? { productName: o.lines[0].productName, quantity: o.lines[0].quantity, ...lineMedia(o, o.lines[0]) }
      : null,
    createdAt: o.createdAt,
    createdBy: userRef(o.createdBy),
    version: o.version,
  };
}

/** Người huỷ món của đơn như BE#417: người không trùng của dòng đã huỷ, thứ tự buyer, seller, platform. Mock không có
 * `cancelledQty` nên coi dòng đã huỷ là dòng `cancelKind = cancellation` hay mọi dòng của đơn đã huỷ. */
function cancelInitiatorsOf(o: sales.MockOrder): LineCancelInitiator[] {
  const seen = new Set(
    o.lines
      .map((l) => o.platform?.lines?.[l.id])
      .filter((x) => x?.cancelInitiator && (o.status === 'cancelled' || x.cancelKind === 'cancellation'))
      .map((x) => x!.cancelInitiator!),
  );
  return (['buyer', 'seller', 'platform'] as const).filter((c) => seen.has(c));
}

export function toOrder(o: sales.MockOrder): Order {
  const own = packagesOf(o);
  const last = lastDeliveredAt(o);
  const allStopped = own.length > 0 && own.every((p) => isStopped(p.status));
  return {
    ...toOrderSummary(o),
    shippingAddress: { ward: null, postCode: null, ...o.shippingAddress, ...o.platform?.address },
    subtotal: sales.subtotalOf(o),
    shippingFee: o.shippingFee,
    shippingFeeOriginal: o.platform?.shippingFeeOriginal ?? null,
    shippingFeeDiscountSeller: o.platform?.shippingFeeDiscountSeller ?? null,
    shippingFeeDiscountPlatform: o.platform?.shippingFeeDiscountPlatform ?? null,
    note: o.note,
    buyerNote: o.buyerNote,
    cancelReason: o.cancelReason,
    cancelInitiators: cancelInitiatorsOf(o),
    invoiceNumber: o.invoiceNumber,
    lines: o.lines.map((l) => ({
      id: l.id,
      variantId: l.variantId,
      untracked: !l.variantId && Boolean(l.untracked),
      sku: l.sku,
      productName: l.productName,
      ...lineMedia(o, l),
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.quantity * l.unitPrice,
      available: l.variantId ? availableOf(o.companyId, l.variantId) : 0,
      externalSku: l.externalSku ?? null,
      ...platformLine(o.platform?.lines?.[l.id]),
    })),
    packages: own.map(toPackageSummary),
    returnWindowEndsAt: last ? new Date(Date.parse(last) + RETURN_WINDOW_DAYS * 24 * 3600_000).toISOString() : null,
    completionBlocker: o.status === 'processing' && allStopped ? blockerOf(o, Date.now()) : null,
    statusHistory: o.history.map((h) => toStatusChange(h, o.source)),
  };
}

export const orderEntity = (o: sales.MockOrder) => ({ type: 'order.orders', id: o.id, label: o.code });
export const orderSnapshot = (o: sales.MockOrder) => ({
  code: o.code,
  status: o.status,
  paymentMethod: o.paymentMethod,
  total: sales.totalOf(o),
});

export const salesHandlers = [
  http.get(`${API}/sales/orders`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.orderView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    const q = (key: string) => url.searchParams.get(key);
    const search = q('search')?.trim().toLowerCase() ?? '';
    const items = sales.orders
      .filter((o) => o.companyId === guard.value.companyId)
      .map(toOrderSummary)
      .filter(
        (o) =>
          (!search ||
            o.code.toLowerCase().includes(search) ||
            Boolean(o.externalOrderId?.includes(search)) ||
            Boolean(o.customer?.name.toLowerCase().includes(search)) ||
            Boolean(o.customer?.phone.includes(search))) &&
          (!q('status') || o.status === q('status')) &&
          (!q('stage') || o.display.stage === q('stage')) &&
          (!q('flag') || o.flags.includes(q('flag') as OrderFlag)) &&
          (!q('source') || o.source === q('source')) &&
          (!q('shopId') || o.shop?.id === q('shopId')) &&
          (!q('paymentMethod') || o.paymentMethod === q('paymentMethod')) &&
          (!q('customerId') || o.customer?.id === q('customerId')) &&
          (!q('from') || vnDate(o.createdAt) >= q('from')!) &&
          (!q('to') || vnDate(o.createdAt) <= q('to')!),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.get(`${API}/sales/orders/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.orderView);
    if (!guard.ok) return guard.response;
    const found = findOwned(sales.orders, params.id, guard.value.companyId, 'đơn hàng');
    if (!found.ok) return found.response;
    return HttpResponse.json(toOrder(found.value));
  }),

  http.post(`${API}/sales/orders/:id/confirm`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.orderCreate);
    if (!guard.ok) return guard.response;
    const { companyId } = guard.value;
    const found = findOwned(sales.orders, params.id, companyId, 'đơn hàng');
    if (!found.ok) return found.response;
    const order = found.value;
    const body = (await request.json()) as { version?: number };
    if (body.version !== order.version) return versionConflict(toOrder(order), 'Đơn vừa được người khác cập nhật.');
    // Chỉ đơn COD của người bán; trả trước sang Đang xử lý khi khách trả. Thiếu hàng vẫn xác nhận được, kiện chờ hàng
    const next = checkTransition(orderMachine, order.status, 'confirm', guard.value, orderRecord(order));
    if (!next.ok) return next.response;
    const before = orderSnapshot(order);
    pushOrderHistory(order, next.value, db.now(), guard.value.account.id);
    if (!payment.orderPayments.some((p) => p.orderId === order.id)) {
      payment.orderPayments.push({
        companyId,
        orderId: order.id,
        method: 'cod',
        status: 'cod_pending',
        refundStatus: 'none',
        paidAt: null,
      });
    }
    writeCompanyLog(guard.value, 'update', orderEntity(order), before, orderSnapshot(order));
    return HttpResponse.json(toOrder(order));
  }),

  // Số hoá đơn (§19.3); đơn sàn BE gửi lên sàn (Lazada SetInvoiceNumber)
  http.put(`${API}/sales/orders/:id/invoice-number`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.orderCreate);
    if (!guard.ok) return guard.response;
    const found = findOwned(sales.orders, params.id, guard.value.companyId, 'đơn hàng');
    if (!found.ok) return found.response;
    const order = found.value;
    const body = (await request.json()) as { version?: number; invoiceNumber?: string };
    const invoiceNumber = body.invoiceNumber?.trim() ?? '';
    if (!invoiceNumber || invoiceNumber.length > MAX_INVOICE) {
      return problem(422, 'Dữ liệu không hợp lệ', {
        errors: { invoiceNumber: invoiceNumber ? `Tối đa ${MAX_INVOICE} ký tự` : 'Nhập số hoá đơn' },
      });
    }
    if (body.version !== order.version) return versionConflict(toOrder(order), 'Đơn vừa được người khác cập nhật.');
    if (order.status === 'cancelled') {
      return problem(409, 'Đơn đã huỷ', { code: 'invalid_transition', current: toOrder(order) });
    }
    const before = { ...orderSnapshot(order), invoiceNumber: order.invoiceNumber };
    order.invoiceNumber = invoiceNumber;
    order.version += 1;
    writeCompanyLog(guard.value, 'update', orderEntity(order), before, { ...orderSnapshot(order), invoiceNumber });
    return HttpResponse.json<Order>(toOrder(order));
  }),
];
