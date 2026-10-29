import type { StatusChange } from '@/lib/stateMachine';
import type { DocRef } from './inventory';

/** purchasing.suppliers */
export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  note: string;
  active: boolean;
  version: number;
  createdAt: string;
}

export interface SupplierInput {
  name: string;
  phone: string;
  email: string;
  address: string;
  note: string;
  active: boolean;
  version?: number;
}

/** Kỳ báo cáo theo ngày ghi sổ phiếu nhận, yyyy-mm-dd giờ VN, tính cả hai đầu */
export interface SupplierReportParams {
  from?: string;
  to?: string;
}

/** Báo cáo theo NCC (sơ đồ A2): số phiếu từng giao thiếu, tỉ lệ hàng lỗi */
export interface SupplierReport {
  supplierId: string;
  supplierName: string;
  receiptCount: number;
  shortReceiptCount: number;
  /** Tổng số nhận đạt + lỗi giữ lại + trả tại chỗ */
  deliveredQty: number;
  defectQty: number;
  /** defectQty / deliveredQty, null khi chưa nhận gì */
  defectRate: number | null;
}

// ---------- Đề nghị nhập (sơ đồ A1) ----------

export type PurchaseRequestStatus =
  | 'draft'
  | 'pending_approval'
  | 'changes_requested'
  | 'approved'
  | 'rejected'
  | 'ordered'
  | 'partially_received'
  | 'received'
  | 'closed_short'
  | 'cancelled';

export type PurchaseRequestAction =
  | 'submit'
  | 'withdraw'
  | 'resubmit'
  | 'approve'
  | 'request_changes'
  | 'reject'
  | 'order'
  | 'receive_partial'
  | 'receive_all'
  | 'close_short'
  | 'cancel';

/** Dòng sản phẩm mới: chưa có SKU, duyệt xong mới sinh */
export interface NewProductInput {
  name: string;
  categoryId: string;
}

export interface PurchaseRequestLine {
  id: string;
  /** null khi là sản phẩm mới chưa duyệt */
  variantId: string | null;
  sku: string | null;
  productName: string;
  attributesLabel: string;
  newProduct: (NewProductInput & { categoryName: string }) | null;
  quantity: number;
  /** Giá nhập dự kiến, chốt khi duyệt; null khi người xem không có quyền xem giá */
  unitCost: number | null;
  /** CEO loại dòng khi duyệt */
  excluded: boolean;
  received: number;
  /** Lỗi giữ lại: đã trừ còn chờ, nằm ở chờ xử lý */
  defective: number;
  closedShort: number;
  /** Còn chờ = đặt − nhận − lỗi giữ − đóng thiếu */
  outstanding: number;
}

export interface PurchaseRequestLineInput {
  variantId?: string | null;
  newProduct?: NewProductInput | null;
  quantity: number;
  unitCost: number;
}

export interface PurchaseRequestSummary {
  id: string;
  number: string;
  status: PurchaseRequestStatus;
  supplier: { id: string; name: string };
  note: string;
  lineCount: number;
  totalQty: number;
  totalCost: number | null;
  outstanding: number;
  /** Suy ra: còn phiếu nhận ở trạng thái giao thiếu */
  supplierShort: boolean;
  createdBy: string;
  createdById: string;
  createdAt: string;
  version: number;
}

export interface PurchaseRequest extends PurchaseRequestSummary {
  lines: PurchaseRequestLine[];
  receipts: (DocRef & { status: GoodsReceiptStatus })[];
  /** Phiếu trả NCC bù hàng sinh ra đề nghị này */
  sourceReturn: DocRef | null;
  /** Còn phiếu nhận đang kiểm: chặn đóng thiếu */
  countingReceipts: number;
  statusHistory: StatusChange<PurchaseRequestStatus>[];
}

export interface PurchaseRequestInput {
  supplierId: string;
  note: string;
  lines: PurchaseRequestLineInput[];
  /** Lập từ phiếu trả NCC bù hàng */
  sourceReturnId?: string | null;
  version?: number;
}

/** Thêm một dòng từ gợi ý nhập lại: vào đề nghị nháp có sẵn, hoặc lập nháp mới với NCC */
export interface AddRequestLineInput {
  requestId: string | null;
  supplierId: string | null;
  variantId: string;
  quantity: number;
}

export interface PurchaseRequestListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: PurchaseRequestStatus;
  supplierId?: string;
}

// ---------- Phiếu nhận (sơ đồ A2) ----------

export type GoodsReceiptStatus = 'counting' | 'matched' | 'short' | 'resolved' | 'cancelled';
export type GoodsReceiptAction = 'post' | 'post_short' | 'auto_resolve' | 'cancel';

/** Người giao đứng chờ kiểm, hoặc đã đi (kiểm trong 24 giờ) */
export type DeliveryMode = 'waiting' | 'left';

/** Kết quả giao thiếu */
export type ShortResolutionKind = 'follow_up' | 'close_short' | 'supplier_wrong';

export interface GoodsReceiptLine {
  /** Dòng đề nghị nhập */
  lineId: string;
  variantId: string;
  sku: string;
  productName: string;
  attributesLabel: string;
  /** Còn chờ của dòng đề nghị lúc này */
  outstanding: number;
  announced: number;
  accepted: number;
  defectKept: number;
  returnedOnSpot: number;
  /** Thiếu = báo giao − nhận − lỗi giữ − trả tại chỗ */
  short: number;
  reason: string;
}

export interface GoodsReceiptLineInput {
  lineId: string;
  announced: number;
  accepted: number;
  defectKept: number;
  returnedOnSpot: number;
  reason: string;
}

export interface ShortResolution {
  kind: ShortResolutionKind;
  /** Giao bù: số phiếu nhận bù */
  followUp: DocRef | null;
  note: string;
  by: string;
  at: string;
}

export interface Attachment {
  fileId: string;
  name: string;
  url: string;
  contentType: string;
}

export interface GoodsReceiptSummary {
  id: string;
  number: string;
  status: GoodsReceiptStatus;
  request: { id: string; number: string };
  supplier: { id: string; name: string };
  deliveryMode: DeliveryMode;
  note: string;
  totalAnnounced: number;
  shortQty: number;
  createdBy: string;
  createdById: string;
  createdAt: string;
  postedBy: string | null;
  postedAt: string | null;
  version: number;
}

export interface GoodsReceipt extends GoodsReceiptSummary {
  lines: GoodsReceiptLine[];
  attachments: Attachment[];
  /** Người lập đề nghị: người ghi sổ phải khác */
  requestCreatedById: string;
  shortResolution: ShortResolution | null;
  followUps: DocRef[];
  statusHistory: StatusChange<GoodsReceiptStatus>[];
}

export interface GoodsReceiptCreateInput {
  requestId: string;
  deliveryMode: DeliveryMode;
  note: string;
}

export interface GoodsReceiptUpdateInput {
  deliveryMode: DeliveryMode;
  note: string;
  attachmentIds: string[];
  lines: GoodsReceiptLineInput[];
  version: number;
}

export interface ShortResolutionInput {
  kind: ShortResolutionKind;
  followUpNumber?: string;
  note: string;
  version: number;
}

export interface GoodsReceiptListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: GoodsReceiptStatus;
  requestId?: string;
}

// ---------- Phiếu trả NCC (sơ đồ B4) ----------

export type SupplierReturnStatus =
  | 'draft'
  | 'pending_approval'
  | 'sent'
  | 'refunded'
  | 'replaced'
  | 'returned_to_us'
  | 'cancelled';

export type SupplierReturnAction =
  | 'submit'
  | 'send_back'
  | 'approve_send'
  | 'record_refund'
  | 'record_replaced'
  | 'record_rejected'
  | 'cancel';

/** CEO huỷ phiếu: hàng ở chờ xử lý nhập lại tồn hoặc lập phiếu xuất huỷ */
export type SupplierReturnCancelDecision = 'restock' | 'write_off';

export interface SupplierReturnLine {
  variantId: string;
  sku: string;
  productName: string;
  attributesLabel: string;
  quantity: number;
  /** Chờ xử lý hiện có của biến thể */
  quarantine: number;
  unitCost: number | null;
}

export interface SupplierReturnSummary {
  id: string;
  number: string;
  status: SupplierReturnStatus;
  supplier: { id: string; name: string } | null;
  source: DocRef | null;
  note: string;
  totalQty: number;
  createdBy: string;
  createdById: string;
  createdAt: string;
  sentAt: string | null;
  version: number;
}

export interface SupplierReturn extends SupplierReturnSummary {
  lines: SupplierReturnLine[];
  sentBy: string | null;
  sentById: string | null;
  refundAmount: number | null;
  replacementRequest: DocRef | null;
  cancelDecision: SupplierReturnCancelDecision | null;
  followUps: DocRef[];
  statusHistory: StatusChange<SupplierReturnStatus>[];
}

export interface SupplierReturnInput {
  supplierId: string | null;
  note: string;
  lines: { variantId: string; quantity: number }[];
  version?: number;
}

export interface SupplierReturnActionInput {
  version: number;
  reason?: string | null;
  refundAmount?: number;
  cancelDecision?: SupplierReturnCancelDecision;
}

export interface SupplierReturnListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: SupplierReturnStatus;
}
