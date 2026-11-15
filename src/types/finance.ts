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

// ---------- Sổ tiền (sơ đồ D4.1, FE#150, Documents/21 mục 21.1) ----------

/** Dòng sổ chỉ thêm (§21.1): dùng chung kiểu với đối soát; `cogs`, `cogs_reversal` không phải tiền mặt */
export type LedgerLine = import('./settlement').SettlementLedgerLine;
export type LedgerKind = LedgerLine['kind'];

export type LedgerFilter = 'all' | 'estimated' | 'actual' | 'replaced';

export interface LedgerTotals {
  /** Phải thu sàn: dòng ước tính còn hiệu lực của gian hàng */
  receivable: number;
  /** Số dư shop trên ví sàn theo quyết toán */
  platformBalance: number;
  withdrawn: number;
  /** Tiền sẽ ra: đề nghị nhập đã duyệt chưa nhận đủ; null khi BE chưa tính */
  committedPurchase: number | null;
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
  /** Thực nhận: doanh thu trừ phí, thuế, hoàn */
  net: number;
  /** Giá vốn, số âm */
  cogs: number | null;
  gross: number | null;
  /** Còn dòng ước tính chưa được quyết toán */
  estimated: boolean;
  /** Có kiện đã giao không có giá vốn (giao trước khi bắt đầu lấy đơn): `cogs`, `gross` thiếu phần đó */
  costMissing: boolean;
  lines: LedgerLine[];
}

/** Tổng trên toàn bộ kết quả lọc, không chỉ trang */
export interface ProfitTotals {
  net: number;
  cogs: number | null;
  gross: number | null;
}

export interface OrderProfitRow {
  orderId: string;
  code: string | null;
  shopId: string | null;
  /** Kiện đầu tiên giao xong */
  deliveredAt: string | null;
  net: number;
  cogs: number | null;
  gross: number | null;
  /** Lãi gộp / thực nhận (%); null khi thực nhận ≤ 0 hoặc thiếu quyền xem giá vốn */
  marginPct: number | null;
  estimated: boolean;
  costMissing: boolean;
  /** Dưới giá thấp nhất thực tế */
  belowFloor: boolean;
}

export interface OrderProfitList {
  items: OrderProfitRow[];
  totals: ProfitTotals;
  total: number;
  page: number;
  pageSize: number;
}

export interface SkuProfitRow {
  /** null: dòng hàng chưa ghép SKU, gộp một dòng */
  variantId: string | null;
  sku: string | null;
  productName: string | null;
  soldQty: number;
  net: number;
  cogs: number | null;
  gross: number | null;
  marginPct: number | null;
  costMissing: boolean;
}

export interface SkuProfitList {
  items: SkuProfitRow[];
  totals: ProfitTotals;
  total: number;
  page: number;
  pageSize: number;
  /** Số đơn bị loại vì có kiện giao mà thiếu dòng hàng */
  excludedOrders: number;
}

export interface TaxWarning {
  /** Mốc doanh thu năm: 500 triệu, 3 tỷ */
  milestone: number;
  ytdRevenue: number;
  over: boolean;
}

export interface TaxWarningList {
  regime: 'company' | 'household' | 'individual' | null;
  items: TaxWarning[];
}

// D4.4, Documents/21 §21.4.
export type ConfigKind = 'fee' | 'tax_regime' | 'tax_rules' | 'mismatch_threshold' | 'min_margin';
export type ConfigStatus = 'draft' | 'pending_approval' | 'scheduled' | 'active' | 'superseded' | 'rejected' | 'cancelled';
export type ConfigAction = 'submit' | 'approve' | 'request_changes' | 'reject' | 'cancel' | 'activate' | 'supersede';
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
