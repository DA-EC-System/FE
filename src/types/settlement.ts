/**
 * Settlement types — đối soát tiền sàn: bảng kê và dòng đối soát (UC-PF-10).
 * Hợp đồng theo Documents/21 mục 12.6, 12.8, BE ở commerio-backend#30 (PR #69).
 */

import type { DocRef, OrderRef } from './finance';

export interface SettlementShop {
  id: string;
  shopName: string | null;
  platform: string | null;
}

export interface SettlementStatement {
  id: string;
  shop: SettlementShop;
  externalStatementId: string;
  statementTime: string;
  settlementAmount: number;
  /** Giữ nguyên chữ của sàn: PAID, PROCESSING, FAILED… */
  paymentStatus: string;
  lineCount: number;
  matchedCount: number;
  discrepancyCount: number;
  refundTaggedCount: number;
  /** Tổng phiếu thu đã sinh từ bảng kê */
  receiptTotal: number;
}

export type SettlementLineKind = 'order' | 'adjustment' | 'reserve';
export type MatchStatus = 'matched' | 'discrepancy' | 'refund_tagged';
export type DiscrepancyReason = 'order_not_found' | 'revenue_mismatch' | 'formula_mismatch';

/** Dương là sàn thu phí, âm là sàn hoàn phí */
export interface SettlementFees {
  commission: number;
  transactionFee: number;
  infrastructureFee: number;
  affiliate: number;
  campaign: number;
  tax: number;
  other: number;
}

export interface SettlementLine {
  id: string;
  statementId: string;
  kind: SettlementLineKind;
  externalTransactionId: string;
  externalOrderId: string | null;
  order: OrderRef | null;
  revenue: number;
  fees: SettlementFees;
  feeTotal: number;
  shippingCost: number;
  /** Dương là sàn trả thêm */
  adjustment: number;
  settlement: number;
  orderTotal: number | null;
  matchStatus: MatchStatus;
  discrepancyReason: DiscrepancyReason | null;
  receipt: DocRef | null;
  /** Dòng đủ điều kiện sinh phiếu thu nhưng bảng kê chưa PAID */
  receiptPending: boolean;
}


// D4.2–D4.3, Documents/21 §21.2–21.3; schema BE payment-schemas.ts.
export type SettlementStatus = 'none' | 'pending' | 'settled' | 'mismatch' | 'resolved';
export interface OrderPayment {
  orderId: string;
  orderCode: string | null;
  shopId: string | null;
  status: SettlementStatus;
  estimatedTotal: number;
  settledTotal: number | null;
  diff: number | null;
  threshold: { abs: number; pct: number; resolveLimit: number };
  needsCeoApproval: boolean;
  ceoApproval: { by: import('./sales').UserRef | null; at: string } | null;
  resolved: { by: import('./sales').UserRef | null; at: string | null; reason: string | null } | null;
  feeConfigAuthor: import('./sales').UserRef | null;
  version: number;
}
export interface OrderPaymentDetail extends OrderPayment {
  statusHistory: import('@/lib/stateMachine').StatusChange<SettlementStatus>[];
  lines: SettlementLedgerLine[];
}
export interface OrderPaymentPage extends importPage<OrderPayment> {
  counts: Record<SettlementStatus, number>;
}
type importPage<T> = import('@/api/types').PageResult<T>;
export interface SettlementRun {
  id: string; shopId: string; source: 'api' | 'file'; fileId: string | null;
  from: string; to: string; status: 'running' | 'done' | 'failed';
  lineCount: number; duplicates: number; walletDiff: number | null; error: string | null;
  createdBy: string | null; createdAt: string;
}
/** Dòng theo API sổ chỉ thêm, độc lập với giao diện sổ cũ của FE#76. */
export interface SettlementLedgerLine {
  id: string;
  kind: 'revenue' | 'platform_subsidy' | 'shipping_income' | 'shipping_cost' | 'fee_fixed' | 'fee_transaction'
    | 'fee_service' | 'fee_optional' | 'withholding_tax' | 'customer_refund' | 'return_fee' | 'lost_compensation'
    | 'penalty' | 'cogs' | 'cogs_reversal' | 'ads' | 'opex' | 'supplier_payment' | 'supplier_refund'
    | 'cod_collected' | 'withdrawal' | 'adjustment';
  amount: number; estimated: boolean; replacesId: string | null; replacedBy: string | null;
  occurredOn: string; shopId: string | null; orderId: string | null; orderCode: string | null;
  packageId: string | null; returnRequestId: string | null; configVersionId: string | null;
  txnId: string | null; source: { type: string; id: string } | null; reason: string | null; createdAt: string;
  bankMatch: { bankRef: string; by: import('./sales').UserRef; at: string } | null;
}
