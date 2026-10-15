/**
 * Kho của công ty đang chọn (UC-IN-01..03, commerio-backend#16).
 * ERD inventory.*: mỗi công ty một kho (QT-13); stock_levels là số tổng, stock_moves là sổ cái (D6, D7).
 * Khả dụng = tồn thực − đang giữ (QT-14). Giá vốn bình quân gia quyền (QT-15) chỉ trả về
 * khi người gọi có quyền xem giá vốn; không có quyền thì các trường giá vốn là null.
 */

export interface StockLevel {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  /** Giá trị thuộc tính nối bằng " / ", vd "Đỏ / M" */
  attributesLabel: string;
  category: { id: string; name: string };
  onHand: number;
  reserved: number;
  available: number;
  /** inventory.reorder_rules.min_qty; null là chưa đặt ngưỡng */
  minQty: number | null;
  /** Khả dụng dưới ngưỡng (QT-16) */
  belowMin: boolean;
  /** Version của quy tắc ngưỡng, 0 khi chưa có */
  reorderVersion: number;
  /** null khi không có quyền xem giá vốn */
  avgCost: number | null;
  /** onHand × avgCost; null khi không có quyền */
  stockValue: number | null;
}

export interface StockListParams {
  page?: number;
  pageSize?: number;
  /** Tên sản phẩm hoặc SKU */
  search?: string;
  categoryId?: string;
  /** Chỉ biến thể có khả dụng dưới ngưỡng */
  belowMin?: boolean;
}

export interface StockSummary {
  variantCount: number;
  belowMinCount: number;
  /** Tổng giá trị tồn; null khi không có quyền xem giá vốn */
  totalValue: number | null;
}

export interface StockListResult {
  items: StockLevel[];
  total: number;
  page: number;
  pageSize: number;
  summary: StockSummary;
}

/** Một dòng sổ inventory.stock_moves, kèm số chứng từ để đọc */
export interface StockMove {
  id: string;
  /** Dương là nhập, âm là xuất */
  qtyChange: number;
  /** Tồn thực sau biến động */
  onHandAfter: number;
  document: { id: string; number: string; type: StockDocType; kind: StockDocKind };
  /** null khi không có quyền xem giá vốn */
  unitCost: number | null;
  doneAt: string;
  doneBy: string;
}

export interface StockDetail {
  level: StockLevel;
  /** Mới nhất trước */
  moves: StockMove[];
}

export interface ReorderRuleInput {
  /** null: bỏ ngưỡng */
  minQty: number | null;
  version: number;
}

// ---------- Phiếu nhập, phiếu xuất ----------

export type StockDocType = 'receipt' | 'issue';
/**
 * Phiếu nhập: receipt_kind của ERD (purchase: nhận hàng theo đơn mua UC-PU-05;
 * manual: nhập tay; delivery_return: nhập hoàn UC-IN-03).
 * Phiếu xuất: order (xuất theo đơn UC-SF-08) hoặc manual (xuất huỷ, điều chỉnh — cần chốt với BE).
 */
export type StockDocKind = 'purchase' | 'manual' | 'delivery_return' | 'order';
/** doc_status của ERD */
export type StockDocStatus = 'draft' | 'done' | 'cancelled';

export interface StockDocLine {
  variantId: string;
  sku: string;
  productName: string;
  attributesLabel: string;
  quantity: number;
  /**
   * Phiếu nhập: giá nhập người lập nhập vào. Phiếu xuất và nhập hoàn: giá vốn bình quân lúc ghi sổ.
   * null khi chưa ghi sổ (phiếu xuất) hoặc người xem không có quyền.
   */
  unitCost: number | null;
}

export interface StockDocSummary {
  id: string;
  number: string;
  type: StockDocType;
  kind: StockDocKind;
  status: StockDocStatus;
  note: string;
  /** Mã đơn bán hoặc đơn mua liên quan */
  reference: string | null;
  lineCount: number;
  totalQty: number;
  createdBy: string;
  createdAt: string;
  postedBy: string | null;
  postedAt: string | null;
  version: number;
}

export interface StockDoc extends StockDocSummary {
  lines: StockDocLine[];
}

export interface StockDocListParams {
  page?: number;
  pageSize?: number;
  type?: StockDocType;
  status?: StockDocStatus;
  /** Số phiếu hoặc ghi chú */
  search?: string;
}

export interface StockDocLineInput {
  variantId: string;
  quantity: number;
  /** Chỉ phiếu nhập tay */
  unitCost?: number;
}

export interface StockDocCreateInput {
  type: StockDocType;
  note: string;
  lines: StockDocLineInput[];
}

export interface StockDocUpdateInput {
  note: string;
  lines: StockDocLineInput[];
  version: number;
}

// ---------- Nhập hoàn (UC-IN-03) ----------

export interface ReturnOrderLine {
  variantId: string;
  sku: string;
  productName: string;
  attributesLabel: string;
  /** Số đã xuất cho đơn */
  quantity: number;
}

/** Đơn giao không thành công, hàng quay về kho */
export interface ReturnOrder {
  orderId: string;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  shipmentCode: string;
  failedReason: string;
  failedAt: string;
  lines: ReturnOrderLine[];
  /** Phiếu nhập hoàn đã lập; null là chưa xử lý */
  receipt: { id: string; number: string } | null;
}

export interface ReturnReceiptInput {
  orderId: string;
  /** Số thực nhận theo từng biến thể của đơn */
  lines: { variantId: string; quantity: number }[];
  /** Bắt buộc khi số thực nhận khác số đã xuất */
  note: string;
}
