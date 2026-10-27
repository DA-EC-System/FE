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
