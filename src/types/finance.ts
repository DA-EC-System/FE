/**
 * Finance types — hoá đơn, phiếu thu, phiếu chi, COD, hoàn tiền, khoản thu chưa khớp (UC-PF-04..07).
 * Hợp đồng theo Documents/21 mục 12.5, 12.8, BE ở commerio-backend#27 (PR #66, #67).
 */

import type { UserRef } from './sales';
import type { Gateway } from './payment';

export interface OrderRef {
  id: string;
  code: string;
  customerName: string | null;
}

export interface OrderRefPhone extends OrderRef {
  customerPhone: string | null;
}

export interface DocRef {
  id: string;
  number: string;
}

export type DocStatus = 'posted' | 'reversed';
export type VoucherStatus = 'draft' | 'posted' | 'reversed';

export interface InvoiceSummary {
  id: string;
  number: string;
  order: OrderRef | null;
  status: DocStatus;
  issuedAt: string;
  total: number;
  reversalOf: DocRef | null;
  reversedBy: DocRef | null;
  version: number;
}

export interface InvoiceLine {
  variantId: string;
  sku: string;
  productName: string;
  attributesLabel: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Invoice extends InvoiceSummary {
  lines: InvoiceLine[];
  /** Tổng hoá đơn trừ tổng dòng hàng (lệch hợp đồng ở PR #66) */
  shippingFee: number;
  reversalReason: string | null;
}

export type ReceiptSource = 'gateway' | 'cod' | 'settlement' | 'unmatched_assignment';

export interface Receipt {
  id: string;
  number: string;
  source: ReceiptSource;
  order: OrderRef | null;
  amount: number;
  status: DocStatus;
  postedAt: string;
  gateway: Gateway | null;
  paymentTransactionId: string | null;
  settlementLineId: string | null;
  unmatchedReceiptId: string | null;
  reversalOf: DocRef | null;
  reversedBy: DocRef | null;
  reversalReason: string | null;
  version: number;
}

/** `supplier_payment` thuộc UC-PF-08, FE#12 không lập */
export type VoucherPurpose = 'supplier_payment' | 'customer_refund' | 'unmatched_refund';

export interface PaymentVoucher {
  id: string;
  number: string;
  purpose: VoucherPurpose;
  order: OrderRef | null;
  unmatchedReceipt: { id: string; amount: number; transferContent: string | null } | null;
  supplierInvoiceId: string | null;
  amount: number;
  /** yyyy-mm-dd */
  paidOn: string;
  note: string;
  status: VoucherStatus;
  createdBy: UserRef | null;
  createdAt: string;
  postedBy: UserRef | null;
  postedAt: string | null;
  reversalOf: DocRef | null;
  reversedBy: DocRef | null;
  reversalReason: string | null;
  version: number;
}

export type CodStatus = 'cod_pending' | 'cod_collected' | 'not_collected';

export interface CodOrder {
  order: OrderRefPhone | null;
  amount: number;
  /** `null` với đơn không thu chưa từng giao */
  deliveredAt: string | null;
  status: CodStatus;
  receipt: DocRef | null;
}

export type RefundListStatus = 'pending_refund' | 'refunded';

export interface RefundItem {
  order: OrderRefPhone | null;
  paidAmount: number;
  /** Mã cổng, hoặc `unmatched_assignment` khi đơn được trả qua gán khoản thu */
  paidVia: string | null;
  paidAt: string | null;
  /** `null` ở tab đã hoàn */
  cancelledAt: string | null;
  refundStatus: RefundListStatus;
  voucher: DocRef | null;
}

export interface CodConfirmationResult {
  receipts: { orderId: string; receipt: DocRef }[];
}

export type UnmatchedStatus = 'open' | 'assigned' | 'refunded';
export type UnmatchedReason = 'no_payment_code' | 'amount_mismatch' | 'order_cancelled';

export interface UnmatchedReceipt {
  id: string;
  receivedAt: string;
  amount: number;
  transferContent: string | null;
  gateway: Gateway | null;
  reason: UnmatchedReason;
  status: UnmatchedStatus;
  suggestedOrder: OrderRef | null;
  assignedOrder: OrderRef | null;
  receipt: DocRef | null;
  voucher: DocRef | null;
  version: number;
}

export interface AssignResult {
  unmatchedReceipt: UnmatchedReceipt;
  receipt: Receipt;
}

/** Đơn chưa thu cho hộp gán khoản (GET /payment/orders?status=unpaid) */
export interface UnpaidOrder {
  order: OrderRef;
  amount: number;
}

/** 409 `payment_state_changed` của xác nhận COD */
export interface CodConflictOrder {
  orderId: string;
  code: string;
  status: string;
}
