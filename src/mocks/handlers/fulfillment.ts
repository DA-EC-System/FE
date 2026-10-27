import { http, HttpResponse, delay } from 'msw';
import { db } from '../db';
import * as inventory from '../inventoryData';
import type { MockStockDoc } from '../inventoryData';
import { PERMISSIONS } from '@/utils/permissions';
import * as sales from '../salesData';
import * as payment from '../paymentData';
import type { OrderStatus } from '@/types/sales';
import * as fulfillment from '../fulfillmentData';
import type { Batch, BatchIssueResult, BatchSummary, DeliveryStatus, FulfillmentOrder, IssueOrderResult } from '@/types/fulfillment';
import { buildPickList } from '@/features/fulfillment/pickList';
import * as finance from '../financeData';
import { API, CompanyActor, LATENCY, pageParams, paginate, problem, requireCompany } from './utils';
import { versionConflict, writeCompanyLog } from './identity';
import { findOwned, rid } from './catalog';
import { createReturnInspection, nextDocNumber, stockDocEntity, stockDocSnapshot, stockLevelOf, variantLabel } from './inventory';
import { orderEntity, orderSnapshot, toOrder, toOrderSummary, userRef } from './sales';
import { toOrderPayment } from './payment';

// ---------- Giao vận: huỷ đơn, lô nhặt, xuất kho, cập nhật giao (UC-SF-06 đến 09; đề xuất commerio-backend#25) ----------

export const CANCELLABLE: OrderStatus[] = ['pending_confirmation', 'confirmed', 'picking', 'packing'];
export const FULFILLMENT_TABS: OrderStatus[] = ['confirmed', 'picking', 'packing', 'issued'];
export const MAX_BATCH_ORDERS = 50;
export const MAX_REASON = 500;

export const batchOf = (orderId: string) => fulfillment.batches.find((b) => b.orderIds.includes(orderId));

export function releaseReserved(o: sales.MockOrder) {
  for (const l of o.lines) {
    const level = stockLevelOf(o.companyId, l.variantId);
    // Seed giữ hàng không khớp từng đơn nên không để âm
    level.reserved = Math.max(0, level.reserved - l.quantity);
  }
}

export function pushHistory(o: sales.MockOrder, to: OrderStatus, at: string, by: string, reason: string | null = null) {
  o.history.push({ from: o.status, to, at, by, reason });
  o.status = to;
  o.version += 1;
}

export function toFulfillmentOrder(o: sales.MockOrder): FulfillmentOrder {
  const summary = toOrderSummary(o);
  const batch = batchOf(o.id);
  return {
    id: o.id,
    code: o.code,
    source: o.source,
    shop: summary.shop,
    customerName: summary.customer?.name ?? null,
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.source === 'marketplace' ? null : toOrderPayment(o).status,
    batch: batch ? { id: batch.id, code: batch.code } : null,
    lineCount: o.lines.length,
    totalQty: o.lines.reduce((sum, l) => sum + l.quantity, 0),
    createdAt: o.createdAt,
    confirmedAt: o.history.find((h) => h.to === 'confirmed')?.at ?? null,
    version: o.version,
    lines: o.lines.map((l) => ({
      variantId: l.variantId,
      sku: l.sku,
      productName: l.productName,
      attributesLabel: variantLabel(o.companyId, l.variantId).attributesLabel,
      quantity: l.quantity,
    })),
  };
}

export const batchOrders = (b: fulfillment.MockBatch) =>
  b.orderIds.map((id) => sales.orders.find((o) => o.id === id)).filter((o): o is sales.MockOrder => Boolean(o));

export function toBatchSummary(b: fulfillment.MockBatch): BatchSummary {
  const own = batchOrders(b);
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    orderCount: own.length,
    totalQty: own.reduce((sum, o) => sum + o.lines.reduce((s, l) => s + l.quantity, 0), 0),
    createdAt: b.createdAt,
    createdBy: userRef(b.createdBy),
    version: b.version,
  };
}

export function toBatch(b: fulfillment.MockBatch): Batch {
  const own = batchOrders(b).map((o) => ({ ...toFulfillmentOrder(o), statusHistory: toOrder(o).statusHistory }));
  return { ...toBatchSummary(b), pickList: buildPickList(own), orders: own };
}

/** Lô hoàn tất khi không còn đơn nào chờ xuất */
export function settleBatch(b: fulfillment.MockBatch) {
  if (b.status !== 'done' && batchOrders(b).every((o) => o.status !== 'picking' && o.status !== 'packing')) {
    b.status = 'done';
    b.version += 1;
  }
}

/** Lỗi khi xuất một đơn; null là xuất được */
export function issueBlocker(o: sales.MockOrder): { code: string; title: string; detail: string } | null {
  if (o.status !== 'packing') {
    return { code: 'invalid_transition', title: 'Đơn không ở bước đóng gói', detail: 'Đơn không còn chờ xuất kho.' };
  }
  if (o.paymentMethod === 'prepaid' && toOrderPayment(o).status !== 'paid') {
    return {
      code: 'payment_required',
      title: 'Đơn chưa thanh toán',
      detail: 'Đơn trả trước chưa thanh toán đủ, chưa xuất được.',
    };
  }
  return null;
}

/** Lập và ghi sổ phiếu xuất theo đơn, nhả số đang giữ */
export function issueOrder(actor: CompanyActor, o: sales.MockOrder) {
  const at = db.now();
  const by = actor.account.id;
  const before = orderSnapshot(o);
  const doc: MockStockDoc = {
    id: rid('sd'),
    companyId: o.companyId,
    number: nextDocNumber(o.companyId, 'issue'),
    type: 'issue',
    kind: 'order',
    status: 'posted',
    area: null,
    note: '',
    orderId: o.id,
    source: { type: 'order', id: o.id, number: o.code },
    claimFlag: false,
    lines: o.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitCost: null })),
    createdBy: by,
    createdAt: at,
    postedBy: by,
    postedAt: at,
    version: 1,
    statusHistory: [{ at, from: null, to: 'posted', by: { id: by, name: actor.account.fullName }, source: 'system' }],
    followUps: [],
    rejectDecision: null,
  };
  inventory.applyDoc(doc, at, by);
  inventory.docs.push(doc);
  releaseReserved(o);
  pushHistory(o, 'issued', at, by);
  finance.invoices.push({
    id: rid('inv'),
    companyId: o.companyId,
    number: finance.nextFinanceNumber(o.companyId, 'invoice'),
    orderId: o.id,
    status: 'posted',
    issuedAt: at,
    version: 1,
  });
  writeCompanyLog(actor, 'create', stockDocEntity(doc), null, stockDocSnapshot(doc));
  writeCompanyLog(actor, 'update', orderEntity(o), before, orderSnapshot(o));
  const batch = batchOf(o.id);
  if (batch) settleBatch(batch);
  return { id: doc.id, number: doc.number };
}

export const fulfillmentHandlers = [
  http.post(`${API}/sales/orders/:id/cancel`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.orderCancel);
    if (!guard.ok) return guard.response;
    const found = findOwned(sales.orders, params.id, guard.value.companyId, 'đơn hàng');
    if (!found.ok) return found.response;
    const order = found.value;
    const body = (await request.json()) as { version?: number; reason?: string };
    if (order.source === 'marketplace') {
      return problem(409, 'Đơn sàn huỷ trên sàn', {
        code: 'not_allowed_for_source',
        detail: 'Đơn sàn chỉ huỷ được trên sàn.',
        current: toOrder(order),
      });
    }
    const reason = body.reason?.trim() ?? '';
    if (!reason) return problem(422, 'Dữ liệu không hợp lệ', { errors: { reason: 'Nhập lý do huỷ' } });
    if (reason.length > MAX_REASON) {
      return problem(422, 'Dữ liệu không hợp lệ', { errors: { reason: `Lý do tối đa ${MAX_REASON} ký tự` } });
    }
    if (body.version !== order.version) return versionConflict(toOrder(order), 'Đơn vừa được người khác cập nhật.');
    if (!CANCELLABLE.includes(order.status)) {
      return problem(409, 'Đơn không huỷ được ở trạng thái này', { code: 'invalid_transition', current: toOrder(order) });
    }
    const before = orderSnapshot(order);
    if (order.status !== 'pending_confirmation') releaseReserved(order);
    const batch = batchOf(order.id);
    if (batch && batch.status !== 'done') {
      batch.orderIds = batch.orderIds.filter((id) => id !== order.id);
      batch.version += 1;
      if (batch.orderIds.length === 0) fulfillment.batches.splice(fulfillment.batches.indexOf(batch), 1);
      else settleBatch(batch);
    }
    for (const link of payment.links) {
      if (link.orderId === order.id && link.status === 'active') link.status = 'cancelled';
    }
    const row = payment.orderPayments.find((p) => p.orderId === order.id);
    if (row?.status === 'paid') {
      row.refundStatus = 'pending_refund';
      row.refundRequestedAt = db.now();
    }
    order.cancelReason = reason;
    order.isShortStock = false;
    pushHistory(order, 'cancelled', db.now(), guard.value.account.id, reason);
    writeCompanyLog(guard.value, 'update', orderEntity(order), before, orderSnapshot(order));
    return HttpResponse.json(toOrder(order));
  }),

  http.post(`${API}/fulfillment/orders/:id/delivery`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.deliveryUpdate);
    if (!guard.ok) return guard.response;
    const found = findOwned(sales.orders, params.id, guard.value.companyId, 'đơn hàng');
    if (!found.ok) return found.response;
    const order = found.value;
    const body = (await request.json()) as { version?: number; status?: DeliveryStatus; reason?: string };
    if (order.source === 'marketplace') {
      return problem(409, 'Trạng thái giao đơn sàn lấy từ sàn', {
        code: 'not_allowed_for_source',
        detail: 'Trạng thái giao của đơn sàn lấy từ sàn.',
        current: toOrder(order),
      });
    }
    const errors: Record<string, string> = {};
    const reason = body.reason?.trim() ?? '';
    if (!body.status || !['in_transit', 'delivered', 'delivery_failed'].includes(body.status)) {
      errors.status = 'Chọn trạng thái giao';
    }
    if (body.status === 'delivery_failed' && !reason) errors.reason = 'Nhập lý do giao không thành công';
    if (reason.length > MAX_REASON) errors.reason = `Lý do tối đa ${MAX_REASON} ký tự`;
    if (Object.keys(errors).length) return problem(422, 'Dữ liệu không hợp lệ', { errors });
    if (body.version !== order.version) return versionConflict(toOrder(order), 'Đơn vừa được người khác cập nhật.');
    const allowed: Partial<Record<OrderStatus, DeliveryStatus[]>> = {
      issued: ['in_transit', 'delivered', 'delivery_failed'],
      in_transit: ['delivered', 'delivery_failed'],
    };
    const next = body.status as DeliveryStatus;
    if (!allowed[order.status]?.includes(next)) {
      return problem(409, 'Đơn không chuyển được sang trạng thái này', {
        code: 'invalid_transition',
        current: toOrder(order),
      });
    }
    const at = db.now();
    const before = orderSnapshot(order);
    pushHistory(order, next, at, guard.value.account.id, next === 'delivery_failed' ? reason : null);
    const row = payment.orderPayments.find((p) => p.orderId === order.id);
    if (row?.method === 'cod' && next === 'delivered') row.deliveredAt = at;
    if (row?.method === 'cod' && next === 'delivery_failed') row.status = 'not_collected';
    if (next === 'delivery_failed') {
      // Hàng quay về kho: hệ thống lập phiếu kiểm hàng về (sơ đồ B3); kho quét rồi chia bán lại, hỏng, trả NCC
      createReturnInspection(
        order.companyId,
        { type: 'order', id: order.id, number: order.code },
        order.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        reason,
        at,
      );
    }
    writeCompanyLog(guard.value, 'update', orderEntity(order), before, orderSnapshot(order));
    return HttpResponse.json(toOrder(order));
  }),

  http.get(`${API}/fulfillment/orders`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.fulfillmentProcess);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    const q = (key: string) => url.searchParams.get(key);
    const status = (q('status') ?? 'confirmed') as OrderStatus;
    if (!FULFILLMENT_TABS.includes(status)) {
      return problem(422, 'Dữ liệu không hợp lệ', { errors: { status: 'Trạng thái không hợp lệ' } });
    }
    const search = q('search')?.trim().toLowerCase() ?? '';
    const items = sales.orders
      .filter(
        (o) =>
          o.companyId === guard.value.companyId &&
          o.status === status &&
          (!q('source') || o.source === q('source')) &&
          (!q('shopId') || o.shopId === q('shopId')),
      )
      .map(toFulfillmentOrder)
      .filter((o) => !search || o.code.toLowerCase().includes(search) || Boolean(o.customerName?.toLowerCase().includes(search)))
      // Đơn xác nhận sớm nhặt trước
      .sort((a, b) => (a.confirmedAt ?? a.createdAt).localeCompare(b.confirmedAt ?? b.createdAt));
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.post(`${API}/fulfillment/orders/:id/issue`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.fulfillmentProcess);
    if (!guard.ok) return guard.response;
    const found = findOwned(sales.orders, params.id, guard.value.companyId, 'đơn hàng');
    if (!found.ok) return found.response;
    const order = found.value;
    const body = (await request.json()) as { version?: number };
    if (body.version !== order.version) {
      return versionConflict(toFulfillmentOrder(order), 'Đơn vừa được người khác cập nhật.');
    }
    const blocker = issueBlocker(order);
    if (blocker) {
      return problem(409, blocker.title, { code: blocker.code, detail: blocker.detail, current: toFulfillmentOrder(order) });
    }
    const issue = issueOrder(guard.value, order);
    const result: IssueOrderResult = { order: toFulfillmentOrder(order), issue, invoice: null };
    return HttpResponse.json(result);
  }),

  http.get(`${API}/fulfillment/batches`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.fulfillmentProcess);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    const status = url.searchParams.get('status');
    const items = fulfillment.batches
      .filter((b) => b.companyId === guard.value.companyId && (!status || b.status === status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toBatchSummary);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.get(`${API}/fulfillment/batches/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.fulfillmentProcess);
    if (!guard.ok) return guard.response;
    const found = findOwned(fulfillment.batches, params.id, guard.value.companyId, 'lô nhặt hàng');
    if (!found.ok) return found.response;
    return HttpResponse.json(toBatch(found.value));
  }),

  http.post(`${API}/fulfillment/batches`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.fulfillmentProcess);
    if (!guard.ok) return guard.response;
    const { companyId } = guard.value;
    const body = (await request.json()) as { orders?: { id: string; version: number }[] };
    const refs = Array.isArray(body.orders) ? body.orders : [];
    if (refs.length === 0) return problem(422, 'Dữ liệu không hợp lệ', { errors: { orders: 'Chọn ít nhất một đơn' } });
    if (refs.length > MAX_BATCH_ORDERS) {
      return problem(422, 'Dữ liệu không hợp lệ', { errors: { orders: `Mỗi lô tối đa ${MAX_BATCH_ORDERS} đơn` } });
    }
    const picked: sales.MockOrder[] = [];
    const inBatch: string[] = [];
    const moved: string[] = [];
    const stale: string[] = [];
    for (const ref of refs) {
      const found = findOwned(sales.orders, ref.id, companyId, 'đơn hàng');
      if (!found.ok) return found.response;
      const o = found.value;
      if (batchOf(o.id)) inBatch.push(o.id);
      else if (o.status !== 'confirmed') moved.push(o.id);
      else if (o.version !== ref.version) stale.push(o.id);
      picked.push(o);
    }
    if (inBatch.length) {
      return problem(409, 'Có đơn đã nằm trong lô khác', { code: 'already_in_batch', orderIds: inBatch });
    }
    if (moved.length) {
      return problem(409, 'Có đơn không còn chờ nhặt', { code: 'invalid_transition', orderIds: moved });
    }
    if (stale.length) {
      return problem(409, 'Có đơn vừa được cập nhật', { code: 'version_conflict', orderIds: stale });
    }
    const at = db.now();
    const by = guard.value.account.id;
    const batch: fulfillment.MockBatch = {
      id: rid('bat'),
      companyId,
      code: fulfillment.nextBatchCode(companyId),
      status: 'picking',
      orderIds: picked.map((o) => o.id),
      createdAt: at,
      createdBy: by,
      version: 1,
    };
    fulfillment.batches.push(batch);
    for (const o of picked) {
      const before = orderSnapshot(o);
      pushHistory(o, 'picking', at, by);
      writeCompanyLog(guard.value, 'update', orderEntity(o), before, orderSnapshot(o));
    }
    writeCompanyLog(guard.value, 'create', { type: 'fulfillment.batches', id: batch.id, label: batch.code }, null, {
      code: batch.code,
      orders: picked.map((o) => o.code),
    });
    return HttpResponse.json(toBatch(batch), { status: 201 });
  }),

  http.post(`${API}/fulfillment/batches/:id/picked`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.fulfillmentProcess);
    if (!guard.ok) return guard.response;
    const found = findOwned(fulfillment.batches, params.id, guard.value.companyId, 'lô nhặt hàng');
    if (!found.ok) return found.response;
    const batch = found.value;
    const body = (await request.json()) as { version?: number };
    if (body.version !== batch.version) return versionConflict(toBatch(batch), 'Lô vừa được người khác cập nhật.');
    if (batch.status !== 'picking') {
      return problem(409, 'Lô không còn đang nhặt', { code: 'invalid_transition', current: toBatch(batch) });
    }
    const at = db.now();
    for (const o of batchOrders(batch).filter((x) => x.status === 'picking')) {
      const before = orderSnapshot(o);
      pushHistory(o, 'packing', at, guard.value.account.id);
      writeCompanyLog(guard.value, 'update', orderEntity(o), before, orderSnapshot(o));
    }
    batch.status = 'packed';
    batch.version += 1;
    return HttpResponse.json(toBatch(batch));
  }),

  http.post(`${API}/fulfillment/batches/:id/issue`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.fulfillmentProcess);
    if (!guard.ok) return guard.response;
    const found = findOwned(fulfillment.batches, params.id, guard.value.companyId, 'lô nhặt hàng');
    if (!found.ok) return found.response;
    const batch = found.value;
    const body = (await request.json()) as { version?: number };
    if (body.version !== batch.version) return versionConflict(toBatch(batch), 'Lô vừa được người khác cập nhật.');
    if (batch.status !== 'packed') {
      return problem(409, 'Lô chưa nhặt xong hoặc đã hoàn tất', { code: 'invalid_transition', current: toBatch(batch) });
    }
    // Từng đơn xuất riêng: đơn bị chặn không làm hỏng các đơn còn lại
    const result: BatchIssueResult = { issued: [], failed: [], batch: toBatchSummary(batch) };
    for (const o of batchOrders(batch).filter((x) => x.status === 'packing')) {
      const blocker = issueBlocker(o);
      if (blocker) result.failed.push({ orderId: o.id, code: blocker.code, detail: blocker.detail });
      else result.issued.push({ id: o.id, code: o.code, issue: issueOrder(guard.value, o) });
    }
    result.batch = toBatchSummary(batch);
    return HttpResponse.json(result);
  }),
];
