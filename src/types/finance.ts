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

// ---------- Sổ tiền (sơ đồ D4.1, FE#76, Documents/21 mục 21.1) ----------

/** `cogs` là giá vốn, không phải tiền; `withdrawal` là rút từ ví sàn về ngân hàng */
export type LedgerKind =
  | 'revenue'
  | 'subsidy'
  | 'fee_fixed'
  | 'fee_txn'
  | 'fee_optional'
  | 'tax_withheld'
  | 'return_fee'
  | 'compensation'
  | 'refund'
  | 'penalty'
  | 'ads'
  | 'withdrawal'
  | 'supplier_refund'
  | 'adjustment'
  | 'cogs';

/** Dòng sổ không sửa tại chỗ: dòng ước tính bị thay bằng dòng thực tế khi sàn quyết toán */
export interface LedgerLine {
  id: string;
  /** SO-000001 */
  code: string;
  at: string;
  kind: LedgerKind;
  /** Âm là tiền ra */
  amount: number;
  estimated: boolean;
  replaced: boolean;
  shopId: string | null;
  shopName: string | null;
  orderId: string | null;
  orderCode: string | null;
  packageId: string | null;
  /** Phiên bản cấu hình phí, thuế dùng để ước tính (CH-000001) */
  configVersion: string | null;
  /** Mã giao dịch quyết toán của sàn */
  txnId: string | null;
  ref: DocRef | null;
  note: string | null;
  bankMatched: boolean;
}

export type LedgerFilter = 'all' | 'estimated' | 'actual' | 'replaced';

export interface LedgerTotals {
  /** Phải thu sàn: dòng ước tính còn hiệu lực của gian hàng */
  receivable: number;
  /** Số dư shop trên ví sàn theo quyết toán */
  platformBalance: number;
  withdrawn: number;
  /** Tiền sẽ ra: đề nghị nhập đã duyệt chưa nhận đủ */
  committedPurchase: number;
}

export interface LedgerResponse {
  items: LedgerLine[];
  total: number;
  page: number;
  pageSize: number;
  totals: LedgerTotals;
}

/** Tiền của một đơn, chỉ tính phần đã giao. Không có `inventory.cost.view` thì `cogs`, `gross` là null */
export interface OrderProfit {
  /** Thực nhận: doanh thu trừ phí, thuế, hoàn, chưa trừ quảng cáo */
  net: number;
  /** Quảng cáo gắn với đơn, số âm */
  ads: number;
  cogs: number | null;
  gross: number | null;
  /** Còn dòng ước tính chưa được quyết toán */
  estimated: boolean;
  /** Thuế khấu trừ thực tế trừ thuế ước tính; null khi chưa quyết toán hoặc khớp */
  taxMismatch: number | null;
  lines: LedgerLine[];
}

export interface OrderProfitRow extends Omit<OrderProfit, 'lines'> {
  order: OrderRef;
  shopName: string | null;
}

export interface OrderProfitList {
  items: OrderProfitRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TaxWarning {
  /** Mốc doanh thu năm: 500 triệu, 3 tỷ */
  milestone: number;
  ytdRevenue: number;
  over: boolean;
}

export interface TaxWarningList {
  year: number;
  items: TaxWarning[];
}


// D4.4, Documents/21 §21.4.
export type ConfigKind = 'fee' | 'tax_regime' | 'tax_rules' | 'mismatch_threshold' | 'min_margin';
export type ConfigStatus = 'draft' | 'pending_approval' | 'scheduled' | 'active' | 'expired' | 'rejected' | 'cancelled';
export type ConfigAction = 'submit' | 'approve' | 'request_changes' | 'reject' | 'cancel' | 'activate' | 'expire';
export interface FinanceConfigSummary {
  id: string; kind: ConfigKind; shopId: string | null; payload: Record<string, unknown>;
  effectiveFrom: string | null; effectiveTo: string | null; supersedesId: string | null;
  isCorrection: boolean; retroactiveFrom: string | null; status: ConfigStatus; statusReason: string | null;
  createdBy: UserRef | null; approvedBy: UserRef | null; selfApproved: boolean; createdAt: string; version: number;
  dryRun: { at: string; rows: { shopId: string; shopName: string | null; feePct: number | null; taxPct: number | null;
    listingsRepriced: number | null; belowFloor: number | null }[]; profit30: { now: number; next: number } } | null;
}
export interface FinanceConfig extends FinanceConfigSummary {
  statusHistory: import('@/lib/stateMachine').StatusChange<ConfigStatus>[];
}
export interface CreateFinanceConfig {
  kind: ConfigKind; shopId?: string; payload: Record<string, unknown>; effectiveFrom: string;
  supersedesId?: string; isCorrection?: boolean; retroactiveFrom?: string;
}
