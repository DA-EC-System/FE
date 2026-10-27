/**
 * Kho của công ty đang chọn (UC-IN-01..03, commerio-backend#16; sơ đồ Tồn kho B2, Phiếu kho B3, FE#56).
 * ERD inventory.*: mỗi công ty một kho (QT-13); stock_levels là số tổng, stock_moves là sổ cái (D6, D7).
 * Tồn thực = khả dụng + đang giữ + tạm khoá; chờ xử lý không thuộc tồn thực. Giá vốn bình quân gia
 * quyền (QT-15) chỉ trả về khi người gọi có quyền xem giá vốn; không có quyền thì là null.
 */

import type { StatusChange } from '@/lib/stateMachine';

export interface StockLevel {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  /** Giá trị thuộc tính nối bằng " / ", vd "Đỏ / M" */
  attributesLabel: string;
  category: { id: string; name: string };
  onHand: number;
  /** Cho kiện chưa bàn giao */
  reserved: number;
  /** Phiếu giảm đang chờ duyệt */
  locked: number;
  /** max(0, tồn thực − đang giữ − tạm khoá); số đẩy lên sàn */
  available: number;
  /** Còn chờ của đề nghị nhập */
  incoming: number;
  /** Hàng lỗi, hoàn, trả chưa kiểm; không bán được */
  quarantine: number;
  /** Hàng các kiện Thiếu hàng cần − khả dụng */
  shortage: number;
  /** inventory.reorder_rules.min_qty; null là chưa đặt ngưỡng */
  minQty: number | null;
  state: StockState;
  /** Khả dụng + đang về − đang thiếu ≤ ngưỡng: gợi ý nhập lại (QT-16) */
  belowMin: boolean;
  /** Vỡ bất biến (bàn giao bắt buộc, kiểm kê CEO duyệt) */
  negative: boolean;
  /** Số trên sàn khác khả dụng sau lần đẩy gần nhất */
  drift: boolean;
  /** Version của quy tắc ngưỡng, 0 khi chưa có */
  reorderVersion: number;
  /** null khi không có quyền xem giá vốn */
  avgCost: number | null;
  /** onHand × avgCost; null khi không có quyền */
  stockValue: number | null;
}

/** Còn hàng, Sắp hết, Hết hàng: suy ra từ khả dụng và ngưỡng, không lưu */
export type StockState = 'in_stock' | 'low' | 'out';

export interface StockListParams {
  page?: number;
  pageSize?: number;
  /** Tên sản phẩm hoặc SKU */
  search?: string;
  categoryId?: string;
  /** Chỉ biến thể cần nhập lại */
  belowMin?: boolean;
  /** Chỉ biến thể có hàng chờ xử lý */
  quarantine?: boolean;
}

export interface StockSummary {
  variantCount: number;
  belowMinCount: number;
  quarantineCount: number;
  negativeCount: number;
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
  /** Tồn thực hoặc chờ xử lý */
  area: StockArea;
  /** Số của khu vực sau biến động */
  onHandAfter: number;
  /** Chứng từ gốc */
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

// ---------- Phiếu kho ----------

/**
 * receipt, issue: phiếu nhập, xuất của mô hình cũ (nhận hàng, xuất theo đơn); chỉ xem, sẽ thay bằng
 * phiếu nhận (FE#17) và kiện (FE#59). Bốn loại theo sơ đồ Phiếu kho: kiểm kê, xuất huỷ,
 * chuyển chờ xử lý, kiểm hàng về.
 */
export type StockDocType =
  | 'receipt'
  | 'issue'
  | 'stocktake'
  | 'write_off'
  | 'to_quarantine'
  | 'return_inspection';
/** Loại phiếu người dùng lập tay */
export type ManualStockDocType = 'stocktake' | 'write_off' | 'to_quarantine';
/** Lập tay, hay hệ thống sinh (nhận hàng, xuất theo đơn, kiểm hàng về, xuất huỷ sau kiểm) */
export type StockDocKind = 'manual' | 'purchase' | 'order' | 'auto';
/** Nháp → chờ duyệt → ghi sổ / từ chối; nháp huỷ được */
export type StockDocStatus = 'draft' | 'pending' | 'posted' | 'rejected' | 'cancelled';
/** Khu vực đếm của kiểm kê, nguồn của xuất huỷ */
export type StockArea = 'stock' | 'quarantine';
/** Từ chối xuất huỷ hàng ở chờ xử lý: kho chọn nhập lại tồn hoặc trả NCC */
export type RejectDecision = 'restock' | 'supplier_return';
export type StockDocAction = 'submit' | 'approve' | 'reject' | 'post' | 'cancel';

export interface StockDocLine {
  variantId: string;
  sku: string;
  productName: string;
  attributesLabel: string;
  /**
   * Phiếu nhập, xuất, xuất huỷ, chuyển chờ xử lý: số lượng. Kiểm kê: Δ = số đếm − tồn sổ.
   * Kiểm hàng về: số quét.
   */
  quantity: number;
  /** Kiểm kê: tồn sổ lúc đếm, số đếm */
  bookQty?: number;
  counted?: number;
  /** Kiểm hàng về: số dự kiến (0 là sai mẫu), chia bán lại + hỏng + trả NCC = số quét */
  expected?: number;
  resell?: number;
  damaged?: number;
  toSupplier?: number;
  /** Phiếu giảm đang chờ duyệt: số đang tạm khoá */
  locked?: number;
  /** Giá vốn lúc ghi sổ (giá nhập với phiếu nhận); null khi chưa ghi sổ hoặc không có quyền */
  unitCost: number | null;
}

export interface DocRef {
  type: 'order' | 'package' | 'return_request' | 'stock_document' | 'goods_receipt' | 'supplier_return';
  id: string;
  number: string;
}

export interface StockDocSummary {
  id: string;
  number: string;
  type: StockDocType;
  kind: StockDocKind;
  status: StockDocStatus;
  /** Kiểm kê, xuất huỷ */
  area: StockArea | null;
  note: string;
  /** Chứng từ gốc: đơn, kiện, yêu cầu trả, phiếu kiểm hàng về */
  source: DocRef | null;
  /** Kiểm hàng về có phần thiếu: khiếu nại ĐVVC hoặc sàn */
  claimFlag: boolean;
  lineCount: number;
  totalQty: number;
  createdBy: string;
  createdById: string;
  createdAt: string;
  postedBy: string | null;
  postedAt: string | null;
  version: number;
}

export interface StockDoc extends StockDocSummary {
  lines: StockDocLine[];
  statusHistory: StatusChange<StockDocStatus>[];
  /** Phiếu sinh tiếp sau ghi sổ (xuất huỷ phần hỏng...) */
  followUps: DocRef[];
  /** Xuất huỷ hàng chờ xử lý bị từ chối: null là kho chưa chọn */
  rejectDecision: RejectDecision | null;
  needsDecision: boolean;
}

export interface StockDocListParams {
  page?: number;
  pageSize?: number;
  type?: StockDocType;
  status?: StockDocStatus;
  /** Số phiếu, chứng từ gốc hoặc ghi chú */
  search?: string;
}

export interface StockDocLineInput {
  variantId: string;
  /** Xuất huỷ, chuyển chờ xử lý */
  quantity?: number;
  /** Kiểm kê */
  counted?: number;
  /** Kiểm hàng về */
  scanned?: number;
  resell?: number;
  damaged?: number;
  toSupplier?: number;
}

export interface StockDocCreateInput {
  type: ManualStockDocType;
  area?: StockArea;
  note: string;
  lines: StockDocLineInput[];
}

export interface StockDocUpdateInput {
  area?: StockArea;
  note: string;
  lines: StockDocLineInput[];
  version: number;
}
