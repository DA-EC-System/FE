import { http, HttpResponse, delay } from 'msw';
import { db } from '../db';
import { PERMISSIONS } from '@/utils/permissions';
import * as sales from '../salesData';
import * as payment from '../paymentData';
import type { Customer, CustomerChannel, CustomerSummary, CreateOrderInput, Order, OrderSummary, OrderVariantOption, ShippingAddress, UserRef } from '@/types/sales';
import { API, LATENCY, pageParams, paginate, problem, requireCompany } from './utils';
import { versionConflict, writeCompanyLog } from './identity';
import { fileUrl, findOwned, rid } from './catalog';
import { ensureStandard, sellableVariants } from './pricing';
import { isQty, stockLevelOf, variantLabel } from './inventory';
import { availableOf as stockAvailable } from '../engine/stock';

// ---------- Bán hàng: khách hàng, đơn (UC-SF-01, 02, 04; hợp đồng đề xuất ở commerio-backend#24) ----------

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

export function toOrderSummary(o: sales.MockOrder): OrderSummary {
  const customer = o.customerId ? sales.customers.find((c) => c.id === o.customerId) : undefined;
  const shop = o.shopId ? db.shops.find((s) => s.id === o.shopId) : undefined;
  return {
    id: o.id,
    code: o.code,
    source: o.source,
    shop: shop ? { id: shop.id, shopName: shop.shopName, platform: shop.platform } : null,
    customer: customer ? { id: customer.id, name: customer.name, phone: customer.phone } : null,
    status: o.status,
    isShortStock: o.isShortStock,
    paymentMethod: o.paymentMethod,
    total: sales.totalOf(o),
    lineCount: o.lines.length,
    createdAt: o.createdAt,
    createdBy: userRef(o.createdBy),
    version: o.version,
  };
}

export function toOrder(o: sales.MockOrder): Order {
  return {
    ...toOrderSummary(o),
    shippingAddress: o.shippingAddress,
    subtotal: sales.subtotalOf(o),
    shippingFee: o.shippingFee,
    note: o.note,
    cancelReason: o.cancelReason,
    lines: o.lines.map((l) => ({
      id: l.id,
      variantId: l.variantId,
      sku: l.sku,
      productName: l.productName,
      attributesLabel: variantLabel(o.companyId, l.variantId).attributesLabel,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.quantity * l.unitPrice,
      available: availableOf(o.companyId, l.variantId),
    })),
    statusHistory: o.history.map((h) => ({
      from: h.from,
      to: h.to,
      at: h.at,
      by: userRef(h.by),
      source: h.source ?? (h.by ? 'user' : o.source === 'marketplace' ? 'marketplace' : 'system'),
      reason: h.reason ?? null,
    })),
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
          (!q('source') || o.source === q('source')) &&
          (!q('shopId') || o.shop?.id === q('shopId')) &&
          (!q('paymentMethod') || o.paymentMethod === q('paymentMethod')) &&
          (q('shortStock') !== 'true' || o.isShortStock) &&
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
      status: 'pending_confirmation',
      isShortStock: false,
      paymentMethod: body.paymentMethod!,
      shippingAddress: {
        name: body.shippingAddress!.name.trim(),
        phone: body.shippingAddress!.phone.trim(),
        address: body.shippingAddress!.address.trim(),
      },
      shippingFee: fee as number,
      note: body.note?.trim() ?? '',
      cancelReason: null,
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
      history: [{ from: null, to: 'pending_confirmation', at, by: actorId }],
      createdAt: at,
      createdBy: actorId,
      version: 1,
    };
    sales.orders.push(order);
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
    if (order.source === 'marketplace') {
      return problem(409, 'Đơn sàn tự xác nhận', {
        code: 'not_allowed_for_source',
        detail: 'Đơn sàn tự xác nhận khi giữ được hàng.',
      });
    }
    if (body.version !== order.version) return versionConflict(toOrder(order), 'Đơn vừa được người khác cập nhật.');
    if (order.status !== 'pending_confirmation') {
      return problem(409, 'Đơn không còn chờ xác nhận', { code: 'invalid_transition', current: toOrder(order) });
    }
    // Giữ hàng tất cả hoặc không dòng nào (UC-SF-04)
    const shortLines = order.lines
      .map((l) => ({ variantId: l.variantId, sku: l.sku, requested: l.quantity, available: availableOf(companyId, l.variantId) }))
      .filter((l) => l.available < l.requested);
    const before = orderSnapshot(order);
    if (shortLines.length > 0) {
      if (!order.isShortStock) {
        order.isShortStock = true;
        order.version += 1;
      }
      return problem(409, 'Không đủ hàng', {
        code: 'insufficient_stock',
        detail: 'Có sản phẩm không đủ tồn khả dụng.',
        shortLines,
        current: toOrder(order),
      });
    }
    const at = db.now();
    for (const l of order.lines) stockLevelOf(companyId, l.variantId).reserved += l.quantity;
    order.status = 'confirmed';
    order.isShortStock = false;
    order.version += 1;
    order.history.push({ from: 'pending_confirmation', to: 'confirmed', at, by: guard.value.account.id });
    // payment.initOrderPayment: payment tự tạo dòng nếu Sale đã tạo mã trước đó (A8)
    if (order.paymentMethod && !payment.orderPayments.some((p) => p.orderId === order.id)) {
      payment.orderPayments.push({
        companyId,
        orderId: order.id,
        method: order.paymentMethod,
        status: order.paymentMethod === 'cod' ? 'cod_pending' : 'unpaid',
        refundStatus: 'none',
        paidAt: null,
      });
    }
    writeCompanyLog(guard.value, 'update', orderEntity(order), before, orderSnapshot(order));
    return HttpResponse.json(toOrder(order));
  }),
];
