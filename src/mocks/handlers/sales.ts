import { http, HttpResponse, delay } from 'msw';
import { db } from '../db';
import { PERMISSIONS } from '@/utils/permissions';
import * as sales from '../salesData';
import * as payment from '../paymentData';
import * as fulfillment from '../fulfillmentData';
import { openRequestsOf } from '../returnsData';
import type {
  Customer,
  CustomerChannel,
  CustomerSummary,
  CreateOrderInput,
  Order,
  OrderFlag,
  OrderSummary,
  OrderVariantOption,
  ShippingAddress,
  StatusChangeSource,
  UserRef,
} from '@/types/sales';
import { API, LATENCY, checkTransition, pageParams, paginate, problem, requireCompany } from './utils';
import { versionConflict, writeCompanyLog } from './identity';
import { fileUrl, findOwned, rid } from './catalog';
import { ensureStandard, sellableVariants } from './pricing';
import { isQty, stockLevelOf, variantLabel } from './inventory';
import { availableOf as stockAvailable } from '../engine/stock';
import type { StatusChange } from '@/lib/stateMachine';
import { newPackage, placePackage, toPackageSummary } from './fulfillment';
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

// ---------- Bán hàng: khách hàng, đơn (UC-SF-01, 02; đơn theo sơ đồ D1, FE#59) ----------

export const PHONE_RE = /^0\d{9}$/;
export const MAX_LINE_QTY = 9999;
export const MAX_ORDER_LINES = 100;

/** Ngày theo giờ Việt Nam (C6) */
export const vnDate = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);

export const userRef = (accountId: string | null): UserRef | null => {
  const a = accountId ? db.accounts.find((x) => x.id === accountId) : undefined;
  return a ? { id: a.id, name: a.fullName } : null;
};

/** Khả dụng = tồn thực − đang giữ − tạm khoá (sơ đồ B2) */
export const availableOf = (companyId: string, variantId: string) => stockAvailable(stockLevelOf(companyId, variantId));

export function customerStats(c: sales.MockCustomer) {
  const own = sales.orders.filter((o) => o.customerId === c.id);
  const lastOrderAt = own.reduce<string | null>((max, o) => (!max || o.createdAt > max ? o.createdAt : max), null);
  return {
    orderCount: own.length,
    totalSpent: own.filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + sales.totalOf(o), 0),
    lastOrderAt,
  };
}

export function toCustomerSummary(c: sales.MockCustomer): CustomerSummary {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    channels: c.channels,
    ...customerStats(c),
    createdAt: c.createdAt,
  };
}

export const toCustomer = (c: sales.MockCustomer): Customer => ({
  ...toCustomerSummary(c),
  address: c.address,
  note: c.note,
  identities: c.identities,
  version: c.version,
});

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
  const shop = o.shopId ? db.shops.find((s) => s.id === o.shopId) : undefined;
  if (open && shop && (shop.status === 'needs_reauth' || shop.status === 'disconnected')) flags.add('shop_disconnected');
  return [...flags];
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
    display: {
      stage: stageOf({ status: o.status, source: o.source, paymentMethod: o.paymentMethod, flags: o.flags, packages: statuses }),
      delivered: live.filter((s) => s === 'delivered').length,
      packages: live.length,
    },
    flags: flagsOf(o, Date.now()),
    outcome: o.outcome,
    rawMarketplaceStatus: o.rawMarketplaceStatus,
    paymentMethod: o.paymentMethod,
    shipBy: o.shipBy,
    total: sales.totalOf(o),
    lineCount: o.lines.length,
    createdAt: o.createdAt,
    createdBy: userRef(o.createdBy),
    version: o.version,
  };
}

export function toOrder(o: sales.MockOrder): Order {
  const own = packagesOf(o);
  const last = lastDeliveredAt(o);
  const allStopped = own.length > 0 && own.every((p) => isStopped(p.status));
  return {
    ...toOrderSummary(o),
    shippingAddress: o.shippingAddress,
    subtotal: sales.subtotalOf(o),
    shippingFee: o.shippingFee,
    note: o.note,
    cancelReason: o.cancelReason,
    invoiceNumber: o.invoiceNumber,
    lines: o.lines.map((l) => ({
      id: l.id,
      variantId: l.variantId,
      sku: l.sku,
      productName: l.productName,
      attributesLabel: variantLabel(o.companyId, l.variantId).attributesLabel,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.quantity * l.unitPrice,
      available: l.variantId ? availableOf(o.companyId, l.variantId) : 0,
      externalSku: l.externalSku ?? null,
    })),
    packages: own.map(toPackageSummary),
    returnWindowEndsAt: last ? new Date(Date.parse(last) + RETURN_WINDOW_DAYS * 24 * 3600_000).toISOString() : null,
    completionBlocker: o.status === 'processing' && allStopped ? blockerOf(o, Date.now()) : null,
    statusHistory: o.history.map((h) => toStatusChange(h, o.source)),
  };
}

export const orderEntity = (o: sales.MockOrder) => ({ type: 'sales.orders', id: o.id, label: o.code });
export const orderSnapshot = (o: sales.MockOrder) => ({
  code: o.code,
  status: o.status,
  paymentMethod: o.paymentMethod,
  total: sales.totalOf(o),
});

export function validateAddress(a: Partial<ShippingAddress> | undefined, prefix: string, errors: Record<string, string>) {
  if (!a?.name?.trim()) errors[`${prefix}.name`] = 'Nhập tên người nhận';
  if (!a?.phone?.trim()) errors[`${prefix}.phone`] = 'Nhập số điện thoại';
  else if (!PHONE_RE.test(a.phone.trim())) errors[`${prefix}.phone`] = 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0';
  if (!a?.address?.trim()) errors[`${prefix}.address`] = 'Nhập địa chỉ giao';
}

export const salesHandlers = [
  http.get(`${API}/sales/customers`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.customerView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const channel = url.searchParams.get('channel');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const items = sales.customers
      .filter((c) => c.companyId === guard.value.companyId)
      .map(toCustomerSummary)
      .filter(
        (c) =>
          (!search ||
            c.name.toLowerCase().includes(search) ||
            c.phone.includes(search) ||
            c.email.toLowerCase().includes(search)) &&
          (!channel || c.channels.includes(channel as CustomerChannel)) &&
          (!from || (c.lastOrderAt !== null && vnDate(c.lastOrderAt) >= from)) &&
          (!to || (c.lastOrderAt !== null && vnDate(c.lastOrderAt) <= to)),
      )
      .sort((a, b) => (b.lastOrderAt ?? b.createdAt).localeCompare(a.lastOrderAt ?? a.createdAt));
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.get(`${API}/sales/customers/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.customerView);
    if (!guard.ok) return guard.response;
    const found = findOwned(sales.customers, params.id, guard.value.companyId, 'khách hàng');
    if (!found.ok) return found.response;
    return HttpResponse.json(toCustomer(found.value));
  }),

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

  http.get(`${API}/sales/order-variants`, async ({ request }) => {
    await delay(150);
    const guard = requireCompany(request, PERMISSIONS.orderCreate);
    if (!guard.ok) return guard.response;
    const { companyId } = guard.value;
    const url = new URL(request.url);
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? '20')));
    const prices = ensureStandard(companyId).prices;
    const items: OrderVariantOption[] = sellableVariants(companyId)
      .filter(
        ({ product, variant }) =>
          !search || product.name.toLowerCase().includes(search) || variant.sku.toLowerCase().includes(search),
      )
      .slice(0, limit)
      .map(({ product, variant }) => ({
        variantId: variant.id,
        productName: product.name,
        sku: variant.sku,
        attributesLabel: variantLabel(companyId, variant.id).attributesLabel,
        thumbnailUrl: product.imageFileIds[0] ? fileUrl(product.imageFileIds[0]) : null,
        price: prices[variant.id] ?? null,
        available: availableOf(companyId, variant.id),
      }));
    return HttpResponse.json(items);
  }),

  http.post(`${API}/sales/orders`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.orderCreate);
    if (!guard.ok) return guard.response;
    const { companyId } = guard.value;
    const body = (await request.json()) as Partial<CreateOrderInput>;
    const errors: Record<string, string> = {};
    let priceMissing = false;

    const customerInput = body.customer;
    const existingId = customerInput && 'id' in customerInput ? customerInput.id : null;
    if (!customerInput) errors.customer = 'Chọn khách hàng';
    else if (!existingId && 'name' in customerInput) {
      if (!customerInput.name?.trim()) errors['customer.name'] = 'Nhập tên khách';
      if (!customerInput.phone?.trim()) errors['customer.phone'] = 'Nhập số điện thoại';
      else if (!PHONE_RE.test(customerInput.phone.trim()))
        errors['customer.phone'] = 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0';
    }
    validateAddress(body.shippingAddress, 'shippingAddress', errors);

    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (lines.length === 0) errors.lines = 'Thêm ít nhất một sản phẩm';
    if (lines.length > MAX_ORDER_LINES) errors.lines = `Tối đa ${MAX_ORDER_LINES} dòng`;
    const sellable = new Map(sellableVariants(companyId).map((x) => [x.variant.id, x]));
    const prices = ensureStandard(companyId).prices;
    const seen = new Set<string>();
    lines.forEach((l, i) => {
      if (!isQty(l.quantity, 1, MAX_LINE_QTY)) errors[`lines.${i}.quantity`] = `Số lượng từ 1 đến ${MAX_LINE_QTY}`;
      if (seen.has(l.variantId)) errors[`lines.${i}.variantId`] = 'Sản phẩm bị lặp';
      else if (!sellable.has(l.variantId)) errors[`lines.${i}.variantId`] = 'Sản phẩm không còn bán';
      else if (prices[l.variantId] == null) {
        errors[`lines.${i}.variantId`] = 'Sản phẩm chưa có giá bán';
        priceMissing = true;
      }
      seen.add(l.variantId);
    });
    const fee = body.shippingFee;
    if (typeof fee !== 'number' || !Number.isInteger(fee) || fee < 0) errors.shippingFee = 'Phí giao là số nguyên không âm';
    if (body.paymentMethod !== 'prepaid' && body.paymentMethod !== 'cod') errors.paymentMethod = 'Chọn cách thanh toán';
    if (body.selfDelivery !== undefined && typeof body.selfDelivery !== 'boolean') errors.selfDelivery = 'Chọn cách giao';

    if (Object.keys(errors).length > 0) {
      return problem(422, 'Dữ liệu không hợp lệ', { errors, ...(priceMissing ? { code: 'price_missing' } : {}) });
    }
    let customer: sales.MockCustomer | undefined;
    if (existingId) {
      const found = findOwned(sales.customers, existingId, companyId, 'khách hàng');
      if (!found.ok) return found.response;
      customer = found.value;
    }

    const at = db.now();
    const actorId = guard.value.account.id;
    if (!customer) {
      const input = customerInput as { name: string; phone: string; email?: string; address?: string };
      customer = {
        id: rid('cus'),
        companyId,
        name: input.name.trim(),
        phone: input.phone.trim(),
        email: input.email?.trim() ?? '',
        address: input.address?.trim() ?? '',
        note: '',
        channels: ['manual'],
        identities: [],
        createdAt: at,
        version: 1,
      };
      sales.customers.push(customer);
    } else if (!customer.channels.includes('manual')) {
      customer.channels.push('manual');
    }

    const order: sales.MockOrder = {
      id: rid('ord'),
      companyId,
      code: sales.nextOrderCode(companyId),
      source: 'manual',
      shopId: null,
      customerId: customer.id,
      status: 'unpaid',
      flags: [],
      outcome: null,
      rawMarketplaceStatus: null,
      shipBy: null,
      paymentMethod: body.paymentMethod!,
      shippingAddress: {
        name: body.shippingAddress!.name.trim(),
        phone: body.shippingAddress!.phone.trim(),
        address: body.shippingAddress!.address.trim(),
      },
      shippingFee: fee as number,
      note: body.note?.trim() ?? '',
      cancelReason: null,
      invoiceNumber: null,
      // Giá lấy từ bảng giá chuẩn lúc tạo rồi ghi cứng vào dòng; FE không gửi giá
      lines: lines.map((l, i) => {
        const { product, variant } = sellable.get(l.variantId)!;
        return {
          id: `${rid('orl')}-${i}`,
          variantId: l.variantId,
          sku: variant.sku,
          productName: product.name,
          quantity: l.quantity,
          unitPrice: prices[l.variantId] as number,
        };
      }),
      history: [{ from: null, to: 'unpaid', at, by: actorId }],
      createdAt: at,
      createdBy: actorId,
      version: 1,
    };
    sales.orders.push(order);
    // Một kiện mặc định, giữ hàng ngay nếu đủ (đơn chưa thanh toán bị lấy lại trước)
    placePackage(
      newPackage(order, order.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })), body.selfDelivery === true, at),
      at,
    );
    // Trả trước: chờ khách trả (mã thanh toán, chuyển khoản); COD tạo dòng khi xác nhận
    if (order.paymentMethod === 'prepaid') {
      payment.orderPayments.push({
        companyId,
        orderId: order.id,
        method: 'prepaid',
        status: 'unpaid',
        refundStatus: 'none',
        paidAt: null,
      });
    }
    writeCompanyLog(guard.value, 'create', orderEntity(order), null, orderSnapshot(order));
    return HttpResponse.json(toOrder(order), { status: 201 });
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
