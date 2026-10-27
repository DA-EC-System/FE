import { http, HttpResponse, delay } from 'msw';
import { db } from '../db';
import { formatCurrency } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissions';
import * as sales from '../salesData';
import * as payment from '../paymentData';
import type { PaymentTransaction, PaymentTransactionDetail } from '@/types/payment';
import * as finance from '../financeData';
import type { CodOrder, CodStatus, DocRef, Invoice, InvoiceSummary, OrderRef, OrderRefPhone, PaymentVoucher, Receipt, RefundItem, RefundListStatus, UnmatchedReceipt, UnpaidOrder, VoucherPurpose } from '@/types/finance';
import { API, CompanyActor, LATENCY, pageParams, paginate, problem, requireCompany } from './utils';
import { versionConflict, writeCompanyLog } from './identity';
import { findOwned, rid } from './catalog';
import { variantLabel } from './inventory';
import { userRef, vnDate } from './sales';
import { toOrderPayment } from './payment';

// ---------- Tài chính: chứng từ, phiếu chi, COD, hoàn tiền, khoản thu chưa khớp (UC-PF-03..07; commerio-backend#27) ----------

export const MAX_NOTE = 500;
export const MAX_COD_BATCH = 100;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Danh sách tài chính của BE: trang 1–100, mặc định 20 */
export function financePage(url: URL) {
  const { page, pageSize } = pageParams(url);
  return { page, pageSize: Math.min(100, pageSize) };
}

export function listFilter(url: URL) {
  const q = (url.searchParams.get('search') ?? '').trim().toLowerCase();
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  return {
    matches: (...fields: (string | null | undefined)[]) => !q || fields.some((f) => f?.toLowerCase().includes(q)),
    /** `day` là yyyy-mm-dd theo giờ VN */
    inRange: (day: string) => (!from || day >= from) && (!to || day <= to),
    param: (name: string) => url.searchParams.get(name),
  };
}

export const findOrder = (orderId: string | null) => (orderId ? sales.orders.find((o) => o.id === orderId) : undefined);
export const customerOf = (o: sales.MockOrder) =>
  o.customerId ? sales.customers.find((c) => c.id === o.customerId) : undefined;

export function orderRef(orderId: string | null): OrderRef | null {
  const o = findOrder(orderId);
  return o ? { id: o.id, code: o.code, customerName: customerOf(o)?.name ?? null } : null;
}

export function orderRefPhone(orderId: string | null): OrderRefPhone | null {
  const o = findOrder(orderId);
  if (!o) return null;
  const c = customerOf(o);
  return { id: o.id, code: o.code, customerName: c?.name ?? null, customerPhone: c?.phone ?? null };
}

export const docRef = (d: { id: string; number: string } | undefined): DocRef | null =>
  d ? { id: d.id, number: d.number } : null;

export function toInvoiceSummary(inv: finance.MockInvoice): InvoiceSummary {
  const o = findOrder(inv.orderId);
  return {
    id: inv.id,
    number: inv.number,
    order: orderRef(inv.orderId),
    status: inv.status,
    issuedAt: inv.issuedAt,
    total: o ? sales.totalOf(o) : 0,
    reversalOf: null,
    reversedBy: null,
    version: inv.version,
  };
}

export function toInvoice(inv: finance.MockInvoice): Invoice {
  const summary = toInvoiceSummary(inv);
  const lines = (findOrder(inv.orderId)?.lines ?? []).map((l) => ({
    variantId: l.variantId,
    sku: l.sku,
    productName: l.productName,
    attributesLabel: variantLabel(inv.companyId, l.variantId).attributesLabel,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    lineTotal: l.quantity * l.unitPrice,
  }));
  return {
    ...summary,
    lines,
    shippingFee: summary.total - lines.reduce((sum, l) => sum + l.lineTotal, 0),
    reversalReason: null,
  };
}

export const toReceipt = (r: finance.MockReceipt): Receipt => ({
  id: r.id,
  number: r.number,
  source: r.source,
  order: orderRef(r.orderId),
  amount: r.amount,
  status: r.status,
  postedAt: r.postedAt,
  gateway: r.gateway,
  paymentTransactionId: r.paymentTransactionId,
  settlementLineId: r.settlementLineId,
  unmatchedReceiptId: r.unmatchedReceiptId,
  reversalOf: null,
  reversedBy: null,
  reversalReason: null,
  version: r.version,
});

export function toVoucher(v: finance.MockVoucher): PaymentVoucher {
  const um = finance.unmatched.find((u) => u.id === v.unmatchedReceiptId);
  return {
    id: v.id,
    number: v.number,
    purpose: v.purpose,
    order: orderRef(v.orderId),
    unmatchedReceipt: um ? { id: um.id, amount: um.amount, transferContent: um.transferContent } : null,
    supplierInvoiceId: null,
    amount: v.amount,
    paidOn: v.paidOn,
    note: v.note,
    status: v.status,
    createdBy: userRef(v.createdBy),
    createdAt: v.createdAt,
    postedBy: userRef(v.postedBy),
    postedAt: v.postedAt,
    reversalOf: null,
    reversedBy: null,
    reversalReason: null,
    version: v.version,
  };
}

export function toUnmatched(u: finance.MockUnmatched): UnmatchedReceipt {
  return {
    id: u.id,
    receivedAt: u.receivedAt,
    amount: u.amount,
    transferContent: u.transferContent,
    gateway: u.gateway,
    reason: u.reason,
    status: u.status,
    suggestedOrder: orderRef(u.suggestedOrderId),
    assignedOrder: orderRef(u.assignedOrderId),
    receipt: docRef(finance.receipts.find((r) => r.unmatchedReceiptId === u.id)),
    voucher: docRef(postedVoucherOf({ unmatchedReceiptId: u.id })),
    version: u.version,
  };
}

/** Chỉ phiếu đã ghi sổ mới chặn chi lần hai; phiếu nháp thì không */
export function postedVoucherOf(source: { orderId?: string; unmatchedReceiptId?: string }) {
  return finance.vouchers.find(
    (v) =>
      v.status === 'posted' &&
      ((source.orderId && v.purpose === 'customer_refund' && v.orderId === source.orderId) ||
        (source.unmatchedReceiptId && v.unmatchedReceiptId === source.unmatchedReceiptId)),
  );
}

/** Số đã thu của đơn: tổng phiếu thu ghi sổ, chưa có thì lấy tổng đơn */
export function paidAmountOf(o: sales.MockOrder) {
  const own = finance.receipts.filter((r) => r.orderId === o.id && r.status === 'posted');
  return own.length ? own.reduce((sum, r) => sum + r.amount, 0) : sales.totalOf(o);
}

export function toRefundItem(row: payment.MockOrderPayment): RefundItem {
  const o = findOrder(row.orderId);
  const paidReceipt = finance.receipts.find((r) => r.orderId === row.orderId && r.status === 'posted');
  return {
    order: orderRefPhone(row.orderId),
    paidAmount: o ? paidAmountOf(o) : 0,
    paidVia: paidReceipt?.source === 'unmatched_assignment' ? 'unmatched_assignment' : (paidReceipt?.gateway ?? null),
    paidAt: row.paidAt,
    cancelledAt: row.refundStatus === 'pending_refund' ? (row.refundRequestedAt ?? null) : null,
    refundStatus: row.refundStatus as RefundListStatus,
    voucher: docRef(postedVoucherOf({ orderId: row.orderId })),
  };
}

export function toCodOrder(row: payment.MockOrderPayment): CodOrder {
  const o = findOrder(row.orderId);
  return {
    order: orderRefPhone(row.orderId),
    amount: o ? sales.totalOf(o) : 0,
    deliveredAt: row.deliveredAt ?? null,
    status: row.status as CodStatus,
    receipt: docRef(finance.receipts.find((r) => r.orderId === row.orderId && r.source === 'cod')),
  };
}

export function toTransaction(t: payment.MockTransaction): PaymentTransaction {
  const o = findOrder(t.orderId);
  return {
    id: t.id,
    gateway: t.gateway,
    gatewayTxnId: t.gatewayTxnId,
    paymentCode: t.paymentCode,
    order: o ? { id: o.id, code: o.code, customerName: customerOf(o)?.name ?? null } : null,
    amount: t.amount,
    source: t.source,
    status: t.status,
    occurredAt: t.occurredAt,
    receipt: docRef(finance.receipts.find((r) => r.paymentTransactionId === t.id)),
    unmatchedReceiptId: finance.unmatched.find((u) => u.paymentTransactionId === t.id)?.id ?? null,
  };
}

export const voucherEntity = (v: finance.MockVoucher) => ({ type: 'finance.payment_vouchers', id: v.id, label: v.number });
export const voucherSnapshot = (v: finance.MockVoucher) => ({
  purpose: v.purpose,
  amount: v.amount,
  paidOn: v.paidOn,
  note: v.note,
  status: v.status,
});

export function pushReceipt(
  actor: CompanyActor,
  fields: Pick<finance.MockReceipt, 'source' | 'orderId' | 'amount'> & Partial<finance.MockReceipt>,
) {
  const r: finance.MockReceipt = {
    id: rid('rct'),
    companyId: actor.companyId,
    number: finance.nextFinanceNumber(actor.companyId, 'receipt'),
    status: 'posted',
    postedAt: db.now(),
    gateway: null,
    paymentTransactionId: null,
    settlementLineId: null,
    unmatchedReceiptId: null,
    version: 1,
    ...fields,
  };
  finance.receipts.push(r);
  writeCompanyLog(actor, 'create', { type: 'finance.receipts', id: r.id, label: r.number }, null, {
    source: r.source,
    amount: r.amount,
  });
  return r;
}

/** Lỗi kiểm ngày chi, ghi chú dùng chung cho phiếu chi, hoàn tiền, hoàn khoản thu */
export function validatePaidOn(body: { paidOn?: string; note?: string }, errors: Record<string, string>) {
  if (!body.paidOn || !DATE_RE.test(body.paidOn) || Number.isNaN(Date.parse(body.paidOn))) {
    errors.paidOn = 'Chọn ngày chi';
  }
  if ((body.note ?? '').length > MAX_NOTE) errors.note = `Ghi chú tối đa ${MAX_NOTE} ký tự`;
}

export const alreadyProcessed = (v: finance.MockVoucher) =>
  problem(409, 'Chứng từ gốc đã được xử lý', {
    code: 'already_processed',
    detail: `Chứng từ gốc đã có phiếu chi ghi sổ ${v.number}`,
  });

export const notPendingRefund = () =>
  problem(409, 'Trạng thái thanh toán đã đổi', {
    code: 'payment_state_changed',
    detail: 'Đơn không ở trạng thái chờ hoàn tiền',
  });

export const unmatchedProcessed = () =>
  problem(409, 'Khoản thu đã được xử lý', { code: 'already_processed', detail: 'Khoản thu đã được gán hoặc hoàn lại' });

/**
 * Kiểm chứng từ gốc của phiếu chi: còn chờ hoàn, chưa có phiếu ghi sổ, số tiền bằng số phải chi (T19).
 * Trả về phản hồi lỗi, hoặc null nếu hợp lệ.
 */
export function checkVoucherSource(
  companyId: string,
  v: Pick<finance.MockVoucher, 'purpose' | 'orderId' | 'unmatchedReceiptId' | 'amount'>,
  errors: Record<string, string>,
): Response | null {
  if (v.purpose === 'customer_refund') {
    const o = findOrder(v.orderId);
    const row = payment.orderPayments.find((p) => p.orderId === v.orderId);
    if (!o || o.companyId !== companyId) {
      errors.orderId = 'Chọn chứng từ gốc';
      return null;
    }
    const posted = postedVoucherOf({ orderId: o.id });
    if (posted) return alreadyProcessed(posted);
    if (row?.refundStatus !== 'pending_refund') return notPendingRefund();
    const due = paidAmountOf(o);
    if (v.amount !== due) errors.amount = `Số tiền phải bằng số đã thu ${formatCurrency(due)}`;
  } else {
    const um = finance.unmatched.find((u) => u.id === v.unmatchedReceiptId && u.companyId === companyId);
    if (!um) {
      errors.unmatchedReceiptId = 'Chọn chứng từ gốc';
      return null;
    }
    const posted = postedVoucherOf({ unmatchedReceiptId: um.id });
    if (posted) return alreadyProcessed(posted);
    if (um.status !== 'open') return unmatchedProcessed();
    if (v.amount !== um.amount) errors.amount = `Số tiền phải bằng số tiền khoản thu ${formatCurrency(um.amount)}`;
  }
  return null;
}

/** Ghi sổ xong: đơn sang đã hoàn, hoặc khoản thu sang đã hoàn lại */
export function settleVoucherSource(v: finance.MockVoucher) {
  if (v.purpose === 'customer_refund') {
    const row = payment.orderPayments.find((p) => p.orderId === v.orderId);
    if (row) row.refundStatus = 'refunded';
  } else {
    const um = finance.unmatched.find((u) => u.id === v.unmatchedReceiptId);
    if (um) {
      um.status = 'refunded';
      um.version += 1;
    }
  }
}

export function newVoucher(
  actor: CompanyActor,
  fields: Pick<finance.MockVoucher, 'purpose' | 'orderId' | 'unmatchedReceiptId' | 'amount' | 'paidOn' | 'note'>,
  posted: boolean,
): finance.MockVoucher {
  const at = db.now();
  const by = actor.account.id;
  const v: finance.MockVoucher = {
    id: rid('pv'),
    companyId: actor.companyId,
    number: finance.nextFinanceNumber(actor.companyId, 'voucher'),
    ...fields,
    status: posted ? 'posted' : 'draft',
    createdBy: by,
    createdAt: at,
    postedBy: posted ? by : null,
    postedAt: posted ? at : null,
    version: 1,
  };
  finance.vouchers.push(v);
  if (posted) settleVoucherSource(v);
  writeCompanyLog(actor, 'create', voucherEntity(v), null, voucherSnapshot(v));
  return v;
}

export function ownVoucher(id: unknown, companyId: string) {
  return findOwned(finance.vouchers, id, companyId, 'phiếu chi');
}

export function draftGuard(v: finance.MockVoucher, version: unknown): Response | null {
  if (version !== undefined && version !== null && Number(version) !== v.version) {
    return versionConflict(toVoucher(v), 'Phiếu chi vừa được người khác cập nhật.');
  }
  if (v.status !== 'draft') {
    return problem(409, 'Phiếu chi không còn là nháp', {
      code: 'not_draft',
      detail: 'Chỉ sửa, xoá, ghi sổ được phiếu chi nháp',
      current: toVoucher(v),
    });
  }
  return null;
}

export const invalid = (errors: Record<string, string>) => problem(422, 'Dữ liệu không hợp lệ', { errors });

export const byDesc = <T>(key: (x: T) => string | null | undefined) => (a: T, b: T) =>
  (key(b) ?? '').localeCompare(key(a) ?? '');

export const financeHandlers = [
  http.get(`${API}/finance/invoices`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.financeView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const f = listFilter(url);
    const status = f.param('status');
    const items = finance.invoices
      .filter((inv) => inv.companyId === guard.value.companyId)
      .map(toInvoiceSummary)
      .filter(
        (inv) =>
          (!status || inv.status === status) &&
          f.inRange(vnDate(inv.issuedAt)) &&
          f.matches(inv.number, inv.order?.code, inv.order?.customerName),
      )
      .sort(byDesc((inv) => inv.issuedAt));
    const { page, pageSize } = financePage(url);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.get(`${API}/finance/invoices/:id`, async ({ params, request }) => {
    await delay(150);
    const guard = requireCompany(request, PERMISSIONS.financeView);
    if (!guard.ok) return guard.response;
    const found = findOwned(finance.invoices, params.id, guard.value.companyId, 'hoá đơn');
    if (!found.ok) return found.response;
    return HttpResponse.json(toInvoice(found.value));
  }),

  http.get(`${API}/finance/receipts`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.financeView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const f = listFilter(url);
    const [source, status, orderId] = [f.param('source'), f.param('status'), f.param('orderId')];
    const items = finance.receipts
      .filter((r) => r.companyId === guard.value.companyId)
      .map(toReceipt)
      .filter(
        (r) =>
          (!source || r.source === source) &&
          (!status || r.status === status) &&
          (!orderId || r.order?.id === orderId) &&
          f.inRange(vnDate(r.postedAt)) &&
          f.matches(r.number, r.order?.code),
      )
      .sort(byDesc((r) => r.postedAt));
    const { page, pageSize } = financePage(url);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.get(`${API}/finance/receipts/:id`, async ({ params, request }) => {
    await delay(150);
    const guard = requireCompany(request, PERMISSIONS.financeView);
    if (!guard.ok) return guard.response;
    const found = findOwned(finance.receipts, params.id, guard.value.companyId, 'phiếu thu');
    if (!found.ok) return found.response;
    return HttpResponse.json(toReceipt(found.value));
  }),

  http.get(`${API}/finance/payment-vouchers`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.financeView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const f = listFilter(url);
    const [purpose, status] = [f.param('purpose'), f.param('status')];
    const items = finance.vouchers
      .filter((v) => v.companyId === guard.value.companyId)
      .filter(
        (v) =>
          (!purpose || v.purpose === purpose) &&
          (!status || v.status === status) &&
          f.inRange(v.paidOn) &&
          f.matches(v.number, v.note, findOrder(v.orderId)?.code),
      )
      .sort(byDesc((v) => v.createdAt))
      .map(toVoucher);
    const { page, pageSize } = financePage(url);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.get(`${API}/finance/payment-vouchers/:id`, async ({ params, request }) => {
    await delay(150);
    const guard = requireCompany(request, PERMISSIONS.financeView);
    if (!guard.ok) return guard.response;
    const found = ownVoucher(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    return HttpResponse.json(toVoucher(found.value));
  }),

  http.post(`${API}/finance/payment-vouchers`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.voucherCreate);
    if (!guard.ok) return guard.response;
    const body = (await request.json()) as {
      purpose?: string;
      orderId?: string;
      unmatchedReceiptId?: string;
      amount?: number;
      paidOn?: string;
      note?: string;
    };
    const errors: Record<string, string> = {};
    if (body.purpose !== 'customer_refund' && body.purpose !== 'unmatched_refund') {
      errors.purpose = 'Chọn mục đích chi';
    }
    if (!Number.isInteger(body.amount) || (body.amount ?? 0) <= 0) errors.amount = 'Số tiền phải là số nguyên dương';
    validatePaidOn(body, errors);
    const fields = {
      purpose: body.purpose as VoucherPurpose,
      orderId: body.purpose === 'customer_refund' ? (body.orderId ?? null) : null,
      unmatchedReceiptId: body.purpose === 'unmatched_refund' ? (body.unmatchedReceiptId ?? null) : null,
      amount: body.amount ?? 0,
      paidOn: body.paidOn ?? '',
      note: body.note?.trim() ?? '',
    };
    if (!errors.purpose) {
      const conflict = checkVoucherSource(guard.value.companyId, fields, errors);
      if (conflict) return conflict;
    }
    if (Object.keys(errors).length) return invalid(errors);
    return HttpResponse.json(toVoucher(newVoucher(guard.value, fields, false)), { status: 201 });
  }),

  http.put(`${API}/finance/payment-vouchers/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.voucherCreate);
    if (!guard.ok) return guard.response;
    const found = ownVoucher(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    const v = found.value;
    const body = (await request.json()) as { amount?: number; paidOn?: string; note?: string; version?: number };
    const blocked = draftGuard(v, body.version ?? -1);
    if (blocked) return blocked;
    const errors: Record<string, string> = {};
    validatePaidOn(body, errors);
    const amount = body.amount ?? v.amount;
    const conflict = checkVoucherSource(guard.value.companyId, { ...v, amount }, errors);
    if (conflict) return conflict;
    if (Object.keys(errors).length) return invalid(errors);
    const before = voucherSnapshot(v);
    Object.assign(v, { amount, paidOn: body.paidOn!, note: body.note?.trim() ?? '', version: v.version + 1 });
    writeCompanyLog(guard.value, 'update', voucherEntity(v), before, voucherSnapshot(v));
    return HttpResponse.json(toVoucher(v));
  }),

  http.delete(`${API}/finance/payment-vouchers/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.voucherCreate);
    if (!guard.ok) return guard.response;
    const found = ownVoucher(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    const v = found.value;
    const blocked = draftGuard(v, new URL(request.url).searchParams.get('version') ?? -1);
    if (blocked) return blocked;
    finance.vouchers.splice(finance.vouchers.indexOf(v), 1);
    writeCompanyLog(guard.value, 'delete', voucherEntity(v), voucherSnapshot(v), null);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${API}/finance/payment-vouchers/:id/post`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.voucherCreate);
    if (!guard.ok) return guard.response;
    const found = ownVoucher(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    const v = found.value;
    const body = (await request.json()) as { version?: number };
    const blocked = draftGuard(v, body.version ?? -1);
    if (blocked) return blocked;
    const errors: Record<string, string> = {};
    const conflict = checkVoucherSource(guard.value.companyId, v, errors);
    if (conflict) return conflict;
    if (Object.keys(errors).length) return invalid(errors);
    const before = voucherSnapshot(v);
    Object.assign(v, { status: 'posted', postedBy: guard.value.account.id, postedAt: db.now(), version: v.version + 1 });
    settleVoucherSource(v);
    writeCompanyLog(guard.value, 'update', voucherEntity(v), before, voucherSnapshot(v));
    return HttpResponse.json(toVoucher(v));
  }),

  http.get(`${API}/finance/cod-orders`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.financeView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const f = listFilter(url);
    const status = f.param('status') ?? 'cod_pending';
    const items = payment.orderPayments
      .filter(
        (p) =>
          p.companyId === guard.value.companyId &&
          p.method === 'cod' &&
          p.status === status &&
          // Đơn COD chưa giao không hiện ở tab Chờ thu (#27 AC-25)
          (status !== 'cod_pending' || Boolean(p.deliveredAt)),
      )
      .sort((a, b) => {
        if (!a.deliveredAt !== !b.deliveredAt) return a.deliveredAt ? -1 : 1;
        return (b.deliveredAt ?? '').localeCompare(a.deliveredAt ?? '');
      })
      .map(toCodOrder)
      .filter(
        (c) =>
          (!c.deliveredAt ? !f.param('from') && !f.param('to') : f.inRange(vnDate(c.deliveredAt))) &&
          f.matches(c.order?.code, c.order?.customerName),
      );
    const { page, pageSize } = financePage(url);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.post(`${API}/finance/cod-confirmations`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.voucherCreate);
    if (!guard.ok) return guard.response;
    const body = (await request.json()) as { orderIds?: string[] };
    const ids = [...new Set(body.orderIds ?? [])];
    if (ids.length === 0) return invalid({ orderIds: 'Chọn ít nhất một đơn' });
    if (ids.length > MAX_COD_BATCH) return invalid({ orderIds: `Tối đa ${MAX_COD_BATCH} đơn mỗi lần` });
    const own = ids.map((id) => findOrder(id)).filter((o) => o?.companyId === guard.value.companyId);
    if (own.length !== ids.length) return invalid({ orderIds: 'Có đơn không thuộc công ty' });
    const rows = ids.map((id) => payment.orderPayments.find((p) => p.orderId === id));
    const changed = rows
      .map((row, i) => ({ row, order: own[i]! }))
      .filter(({ row }) => row?.method !== 'cod' || row.status !== 'cod_pending' || !row.deliveredAt)
      .map(({ row, order }) => ({ orderId: order.id, code: order.code, status: row?.status ?? 'unpaid' }));
    if (changed.length) {
      return problem(409, 'Trạng thái thanh toán đã đổi', {
        code: 'payment_state_changed',
        detail: 'Có đơn không còn chờ thu COD',
        orders: changed,
      });
    }
    const at = db.now();
    const result = rows.map((row, i) => {
      row!.status = 'cod_collected';
      row!.paidAt = at;
      const r = pushReceipt(guard.value, { source: 'cod', orderId: own[i]!.id, amount: sales.totalOf(own[i]!) });
      return { orderId: own[i]!.id, receipt: { id: r.id, number: r.number } };
    });
    return HttpResponse.json({ receipts: result }, { status: 201 });
  }),

  http.get(`${API}/finance/refunds`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.financeView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const f = listFilter(url);
    const status = f.param('status') ?? 'pending_refund';
    const items = payment.orderPayments
      .filter((p) => p.companyId === guard.value.companyId && p.refundStatus === status)
      .map(toRefundItem)
      .filter((r) => f.matches(r.order?.code, r.order?.customerName))
      .sort(byDesc((r) => r.cancelledAt ?? r.paidAt));
    const { page, pageSize } = financePage(url);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.post(`${API}/finance/refunds`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.voucherCreate);
    if (!guard.ok) return guard.response;
    const body = (await request.json()) as { orderId?: string; paidOn?: string; note?: string };
    const o = findOrder(body.orderId ?? null);
    if (!o || o.companyId !== guard.value.companyId) {
      return problem(404, 'Không tìm thấy đơn hàng', { code: 'not_found' });
    }
    const errors: Record<string, string> = {};
    validatePaidOn(body, errors);
    if (Object.keys(errors).length) return invalid(errors);
    const fields = {
      purpose: 'customer_refund' as const,
      orderId: o.id,
      unmatchedReceiptId: null,
      amount: paidAmountOf(o),
      paidOn: body.paidOn!,
      note: body.note?.trim() ?? '',
    };
    const conflict = checkVoucherSource(guard.value.companyId, fields, errors);
    if (conflict) return conflict;
    return HttpResponse.json(toVoucher(newVoucher(guard.value, fields, true)), { status: 201 });
  }),

  http.get(`${API}/finance/unmatched-receipts`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.financeView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const f = listFilter(url);
    const [status, reason] = [f.param('status') ?? 'open', f.param('reason')];
    const items = finance.unmatched
      .filter(
        (u) =>
          u.companyId === guard.value.companyId &&
          u.status === status &&
          (!reason || u.reason === reason) &&
          f.inRange(vnDate(u.receivedAt)) &&
          f.matches(u.transferContent),
      )
      .sort(byDesc((u) => u.receivedAt))
      .map(toUnmatched);
    const { page, pageSize } = financePage(url);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.post(`${API}/finance/unmatched-receipts/:id/assign`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.voucherCreate);
    if (!guard.ok) return guard.response;
    const found = findOwned(finance.unmatched, params.id, guard.value.companyId, 'khoản thu');
    if (!found.ok) return found.response;
    const um = found.value;
    const body = (await request.json()) as { orderId?: string; version?: number };
    if (body.version !== um.version) return versionConflict(toUnmatched(um), 'Khoản thu vừa được người khác xử lý.');
    if (um.status !== 'open') return unmatchedProcessed();
    const o = findOrder(body.orderId ?? null);
    if (!o || o.companyId !== guard.value.companyId) return invalid({ orderId: 'Chọn đơn hàng' });
    const row = payment.orderPayments.find((p) => p.orderId === o.id);
    if (o.status === 'cancelled' || o.source === 'marketplace' || row?.status !== 'unpaid') {
      return problem(409, 'Trạng thái thanh toán đã đổi', {
        code: 'payment_state_changed',
        detail: 'Đơn không còn chờ thanh toán',
        current: toOrderPayment(o),
      });
    }
    const total = sales.totalOf(o);
    if (total !== um.amount) {
      return problem(422, 'Số tiền không khớp', {
        code: 'amount_mismatch',
        errors: {
          orderId: `Tổng đơn ${formatCurrency(total)} khác số tiền khoản thu ${formatCurrency(um.amount)}`,
        },
      });
    }
    row.status = 'paid';
    row.paidAt = db.now();
    for (const link of payment.links) {
      if (link.orderId === o.id && link.status === 'active') link.status = 'cancelled';
    }
    um.status = 'assigned';
    um.assignedOrderId = o.id;
    um.version += 1;
    const r = pushReceipt(guard.value, {
      source: 'unmatched_assignment',
      orderId: o.id,
      amount: um.amount,
      gateway: um.gateway,
      paymentTransactionId: um.paymentTransactionId,
      unmatchedReceiptId: um.id,
    });
    return HttpResponse.json({ unmatchedReceipt: toUnmatched(um), receipt: toReceipt(r) });
  }),

  http.post(`${API}/finance/unmatched-receipts/:id/refund`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.voucherCreate);
    if (!guard.ok) return guard.response;
    const found = findOwned(finance.unmatched, params.id, guard.value.companyId, 'khoản thu');
    if (!found.ok) return found.response;
    const um = found.value;
    const body = (await request.json()) as { paidOn?: string; note?: string; version?: number };
    if (body.version !== um.version) return versionConflict(toUnmatched(um), 'Khoản thu vừa được người khác xử lý.');
    const errors: Record<string, string> = {};
    const fields = {
      purpose: 'unmatched_refund' as const,
      orderId: null,
      unmatchedReceiptId: um.id,
      amount: um.amount,
      paidOn: body.paidOn ?? '',
      note: body.note?.trim() ?? '',
    };
    const conflict = checkVoucherSource(guard.value.companyId, fields, errors);
    if (conflict) return conflict;
    validatePaidOn(body, errors);
    if (Object.keys(errors).length) return invalid(errors);
    return HttpResponse.json(toVoucher(newVoucher(guard.value, fields, true)), { status: 201 });
  }),

  // Đơn chưa thu cho hộp gán khoản: bỏ đơn huỷ, chỉ dòng order_payments đang `unpaid`
  http.get(`${API}/payment/orders`, async ({ request }) => {
    await delay(200);
    const guard = requireCompany(request, PERMISSIONS.voucherCreate);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const f = listFilter(url);
    const items: UnpaidOrder[] = payment.orderPayments
      .filter((p) => p.companyId === guard.value.companyId && p.status === 'unpaid')
      .map((p) => findOrder(p.orderId))
      .filter((o): o is sales.MockOrder => Boolean(o) && o!.status !== 'cancelled')
      .sort(byDesc((o) => o.createdAt))
      .map((o) => ({ order: orderRef(o.id)!, amount: sales.totalOf(o) }))
      .filter((u) => f.matches(u.order.code, u.order.customerName));
    const { page, pageSize } = financePage(url);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.get(`${API}/payment/transactions`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.transactionView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const f = listFilter(url);
    const [gateway, status] = [f.param('gateway'), f.param('status')];
    const items = payment.transactions
      .filter(
        (t) =>
          t.companyId === guard.value.companyId &&
          (!gateway || t.gateway === gateway) &&
          (!status || t.status === status) &&
          f.inRange(vnDate(t.occurredAt)),
      )
      .map(toTransaction)
      .filter((t) => f.matches(t.paymentCode, t.gatewayTxnId, t.order?.code))
      .sort(byDesc((t) => t.occurredAt));
    const { page, pageSize } = financePage(url);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.get(`${API}/payment/transactions/:id`, async ({ params, request }) => {
    await delay(150);
    const guard = requireCompany(request, PERMISSIONS.transactionView);
    if (!guard.ok) return guard.response;
    const found = findOwned(payment.transactions, params.id, guard.value.companyId, 'giao dịch');
    if (!found.ok) return found.response;
    const detail: PaymentTransactionDetail = { ...toTransaction(found.value), rawPayload: found.value.rawPayload };
    return HttpResponse.json(detail);
  }),
];


/** Webhook thành công (giả lập): ghi giao dịch cổng và phiếu thu nguồn cổng */
export function recordGatewayPayment(link: payment.MockPaymentLink) {
  const at = db.now();
  const txn: payment.MockTransaction = {
    id: rid('txn'),
    companyId: link.companyId,
    gateway: link.gateway,
    gatewayTxnId: `SBX-${Date.now().toString(36).toUpperCase()}`,
    paymentCode: link.paymentCode,
    orderId: link.orderId,
    amount: link.amount,
    source: link.gateway === 'vietqr' ? 'sepay' : 'webhook',
    status: 'succeeded',
    occurredAt: at,
    rawPayload: { paymentCode: link.paymentCode, amount: link.amount, simulated: true, sandbox: true },
  };
  payment.transactions.push(txn);
  finance.receipts.push({
    id: rid('rct'),
    companyId: link.companyId,
    number: finance.nextFinanceNumber(link.companyId, 'receipt'),
    source: 'gateway',
    orderId: link.orderId,
    amount: link.amount,
    status: 'posted',
    postedAt: at,
    gateway: link.gateway,
    paymentTransactionId: txn.id,
    settlementLineId: null,
    unmatchedReceiptId: null,
    version: 1,
  });
}
