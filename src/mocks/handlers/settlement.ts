import { http, HttpResponse, delay } from 'msw';
import { db } from '../db';
import { PERMISSIONS } from '@/utils/permissions';
import * as sales from '../salesData';
import * as finance from '../financeData';
import * as settlement from '../settlementData';
import type { SettlementFees, SettlementLine, SettlementStatement } from '@/types/settlement';
import { API, CompanyActor, Guard, LATENCY, enabledModulesOf, paginate, problem, requireCompany } from './utils';
import { findOwned } from './catalog';
import { vnDate } from './sales';
import { byDesc, docRef, financePage, findOrder, invalid, listFilter, orderRef } from './finance';

// ---------- Đối soát tiền sàn (UC-PF-10; commerio-backend#30) ----------

/** Đối soát cần thêm phân hệ Kênh bán (BE `settlement-routes.ts`) */
export function requireSettlement(request: Request, permission: string = PERMISSIONS.financeView): Guard<CompanyActor> {
  const guard = requireCompany(request, permission);
  if (!guard.ok) return guard;
  if (!enabledModulesOf(guard.value.companyId).includes('channel')) {
    return { ok: false, response: problem(403, 'Phân hệ Kênh bán đang tắt', { code: 'module_disabled' }) };
  }
  return guard;
}

export const statementOf = (id: string) => settlement.statements.find((s) => s.id === id)!;
export const settlementReceiptOf = (lineId: string) =>
  finance.receipts.find((r) => r.settlementLineId === lineId && r.status === 'posted');
export const settlementFeeTotal = (fees: SettlementFees) => Object.values(fees).reduce((a, b) => a + b, 0);

export function statementView(s: settlement.MockStatement): SettlementStatement {
  const lines = settlement.settlementLines.filter((l) => l.statementId === s.id);
  const count = (status: SettlementLine['matchStatus']) => lines.filter((l) => l.matchStatus === status).length;
  const shop = db.shops.find((x) => x.id === s.shopId);
  return {
    id: s.id,
    shop: { id: s.shopId, shopName: shop?.shopName ?? null, platform: shop?.platform ?? null },
    externalStatementId: s.externalStatementId,
    statementTime: s.statementTime,
    settlementAmount: lines.reduce((a, l) => a + l.settlement, 0),
    paymentStatus: s.paymentStatus,
    lineCount: lines.length,
    matchedCount: count('matched'),
    discrepancyCount: count('discrepancy'),
    refundTaggedCount: count('refund_tagged'),
    receiptTotal: lines.reduce((a, l) => a + (settlementReceiptOf(l.id)?.amount ?? 0), 0),
  };
}

export function settlementLineView(l: settlement.MockSettlementLine): SettlementLine {
  const order = findOrder(l.orderId);
  const receipt = settlementReceiptOf(l.id);
  return {
    id: l.id,
    statementId: l.statementId,
    kind: l.kind,
    externalTransactionId: l.externalTransactionId,
    externalOrderId: l.externalOrderId,
    order: orderRef(l.orderId),
    revenue: l.revenue,
    fees: { ...l.fees },
    feeTotal: settlementFeeTotal(l.fees),
    shippingCost: l.shippingCost,
    adjustment: l.adjustment,
    settlement: l.settlement,
    orderTotal: order ? sales.totalOf(order) : null,
    matchStatus: l.matchStatus,
    discrepancyReason: l.discrepancyReason,
    receipt: docRef(receipt),
    // `needsReceipt` của BE khi bảng kê đã PAID, mà bảng kê chưa PAID
    receiptPending:
      !receipt &&
      statementOf(l.statementId).paymentStatus !== 'PAID' &&
      l.matchStatus !== 'discrepancy' &&
      l.settlement > 0,
  };
}

/** Lần chạy đối soát giả: còn chạy thì trả 409 `run_in_progress` */
export let settlementRunUntil = 0;
export const SETTLEMENT_RUN_MS = 4000;

export const settlementHandlers = [
  http.get(`${API}/finance/settlements`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireSettlement(request);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const f = listFilter(url);
    const shopId = f.param('shopId');
    const paymentStatus = f.param('paymentStatus');
    const items = settlement.statements
      .filter(
        (s) =>
          s.companyId === guard.value.companyId &&
          (!shopId || s.shopId === shopId) &&
          (!paymentStatus || s.paymentStatus === paymentStatus) &&
          f.inRange(vnDate(s.statementTime)),
      )
      .sort(byDesc((s) => s.statementTime))
      .map(statementView);
    const { page, pageSize } = financePage(url);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.get(`${API}/finance/settlements/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireSettlement(request);
    if (!guard.ok) return guard.response;
    const found = findOwned(settlement.statements, params.id, guard.value.companyId, 'bảng kê');
    if (!found.ok) return found.response;
    return HttpResponse.json(statementView(found.value));
  }),

  http.get(`${API}/finance/settlement-lines`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireSettlement(request);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const f = listFilter(url);
    const statementId = f.param('statementId');
    const matchStatus = f.param('matchStatus');
    const shopId = f.param('shopId');
    const orderId = f.param('orderId');
    const items = settlement.settlementLines
      .filter((l) => {
        const s = statementOf(l.statementId);
        return (
          l.companyId === guard.value.companyId &&
          (!statementId || l.statementId === statementId) &&
          (!matchStatus || l.matchStatus === matchStatus) &&
          (!shopId || s.shopId === shopId) &&
          (!orderId || l.orderId === orderId) &&
          f.inRange(vnDate(s.statementTime))
        );
      })
      .sort(
        (a, b) =>
          statementOf(b.statementId).statementTime.localeCompare(statementOf(a.statementId).statementTime) ||
          a.createdAt.localeCompare(b.createdAt) ||
          a.id.localeCompare(b.id),
      )
      .map(settlementLineView);
    const { page, pageSize } = financePage(url);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  // BE chưa có (#30 phần 2): FE chỉ hiện nút với mock hoặc khi bật VITE_SETTLEMENT_RUN
  http.post(`${API}/finance/settlements/run`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireSettlement(request, PERMISSIONS.voucherCreate);
    if (!guard.ok) return guard.response;
    const body = (await request.json().catch(() => ({}))) as { shopId?: string };
    if (
      body.shopId &&
      !db.shops.some((s) => s.id === body.shopId && s.companyId === guard.value.companyId)
    ) {
      return invalid({ shopId: 'Không tìm thấy gian hàng' });
    }
    if (Date.now() < settlementRunUntil) {
      return problem(409, 'Lần đối soát trước chưa chạy xong', { code: 'run_in_progress' });
    }
    settlementRunUntil = Date.now() + SETTLEMENT_RUN_MS;
    return new HttpResponse(null, { status: 202 });
  }),
];
