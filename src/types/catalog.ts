/**
 * Catalog của công ty đang chọn (UC-CP-01, UC-CP-02; commerio-backend#13, #14).
 * ERD catalog.*: quy tắc SKU nằm trong danh mục (D14, D25); SKU thuộc biến thể (QT-11).
 * Mọi API lấy công ty từ token; không truyền companyId.
 */

export interface Category {
  id: string;
  name: string;
  /** Vd "AO-{SEQ:4}-{VAL}", xem utils/sku.ts */
  skuPattern: string;
  /** Số thứ tự sẽ dùng cho SKU kế tiếp */
  skuNextSeq: number;
  productCount: number;
  version: number;
  updatedAt: string;
}

export interface CategoryInput {
  name: string;
  skuPattern: string;
}

export interface AttributeValue {
  id: string;
  value: string;
  /** Mã dùng trong {VAL} của SKU (D27, docs/21 V21), vd "DEN" */
  code: string;
  /** Đã có biến thể dùng: không xoá được */
  inUse: boolean;
}

export interface Attribute {
  id: string;
  name: string;
  values: AttributeValue[];
  productCount: number;
  version: number;
}

export interface AttributeInput {
  name: string;
  /**
   * Có id: giá trị cũ (đổi chữ); không có id: giá trị mới. Giá trị cũ vắng mặt là bị xoá.
   * `code` bỏ trống thì BE sinh từ `value` (bảng 9.2); trùng trong thuộc tính thì 422
   * `errors["values.<i>.code"]`
   */
  values: { id?: string; value: string; code?: string }[];
}

/** `archived`: mọi SKU đã lưu trữ */
export type ProductStatus = 'active' | 'archived';

/** Trạng thái kinh doanh của SKU (sơ đồ Sản phẩm B1, FE#57). SKU mới luôn là `selling` */
export type VariantBusinessStatus = 'selling' | 'paused' | 'discontinued' | 'archived';

export type VariantBusinessAction = 'pause' | 'unpause' | 'discontinue' | 'reactivate' | 'archive' | 'restore';

/** Độ hoàn thiện (tính): thiếu ảnh, mô tả hoặc giá chuẩn thì Chờ hoàn thiện */
export type VariantReadiness = 'incomplete' | 'ready';

/** Hiện diện trên sàn (tính từ listing): live đang bán, pending chờ sàn, error có lỗi, not_listed chưa đăng */
export type VariantPresence = 'live' | 'pending' | 'error' | 'not_listed';

/** Nhãn chính của SKU: Lưu trữ → Ngừng nhập → Tạm ngừng → hiện diện trên sàn */
export type VariantMainLabel = 'archived' | 'discontinued' | 'paused' | 'live' | 'pending' | 'not_listed';

export interface ProductImage {
  id: string;
  fileId: string;
  url: string;
  /** 0 là ảnh đại diện */
  position: number;
}

export interface VariantAttribute {
  attributeId: string;
  attributeName: string;
  valueId: string;
  value: string;
}

/** Phần còn thiếu theo Documents/21 §17.1; name, category, image tính ở cha, còn lại theo SKU */
export type VariantMissing = 'name' | 'category' | 'image' | 'price' | 'minQty' | 'weight' | 'dimensions';

export const MISSING_LABELS: Record<VariantMissing, string> = {
  name: 'tên',
  category: 'danh mục',
  image: 'ảnh',
  price: 'giá chuẩn',
  minQty: 'ngưỡng tồn',
  weight: 'khối lượng',
  dimensions: 'kích thước gói',
};

export interface ProductVariant {
  id: string;
  sku: string;
  attributes: VariantAttribute[];
  /** Có giá trị khi `businessStatus = archived` */
  archivedAt: string | null;
  businessStatus: VariantBusinessStatus;
  readiness: VariantReadiness;
  /** Phần còn thiếu khi Chờ hoàn thiện (§17.1) */
  missing: VariantMissing[];
  /** Giá chuẩn là cột của SKU (D9); null là chưa đặt */
  standardPrice: number | null;
  /** Ngưỡng tồn đặt ở §15 (quyền inventory.reorder.manage), ở đây chỉ để xem */
  minQty: number | null;
  weightG: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  /** Version của SKU, gửi kèm PATCH §17.2 */
  version: number;
  presence: VariantPresence;
  /** Số listing trên sàn, kể cả listing đang ẩn do tạm ngừng */
  listingCount: number;
  /** Lý do chưa lưu trữ được (tồn, đang về, chờ xử lý, chứng từ mở); rỗng là lưu trữ được */
  archiveBlockers: string[];
}

export interface ProductListItem {
  id: string;
  name: string;
  category: { id: string; name: string };
  /** Số SKU chưa lưu trữ */
  variantCount: number;
  /** Mọi SKU, kể cả đã lưu trữ */
  variantTotal: number;
  /** Số SKU theo nhãn chính, để suy nhãn cha ("Đang bán 4/6"); BE chưa trả khi chưa xong commerio-backend#204.
   * TODO: BE#204 merge thì đổi lại bắt buộc, xoá nhánh dự phòng ở businessStatus.tsx */
  labelCounts?: Record<VariantMainLabel, number>;
  incompleteCount?: number;
  errorCount?: number;
  thumbnailUrl: string | null;
  status: ProductStatus;
  updatedAt: string;
  version: number;
}

export interface ProductDetail extends ProductListItem {
  description: string;
  images: ProductImage[];
  variants: ProductVariant[];
}

export interface ProductListParams {
  page?: number;
  pageSize?: number;
  /** Tên sản phẩm hoặc SKU */
  search?: string;
  categoryId?: string;
  status?: ProductStatus;
  /** Có ít nhất một SKU ở trạng thái này */
  businessStatus?: Exclude<VariantBusinessStatus, 'archived'>;
}

export interface ProductCreateInput {
  name: string;
  categoryId: string;
  description: string;
  /** Theo thứ tự hiển thị, phần tử đầu là ảnh đại diện */
  imageFileIds: string[];
  /** Mỗi biến thể một tổ hợp giá trị; sản phẩm không có thuộc tính thì một biến thể rỗng */
  variants: { attributeValueIds: string[] }[];
}

export interface ProductUpdateInput {
  name: string;
  description: string;
  imageFileIds: string[];
  version: number;
}

/** Đổi trạng thái kinh doanh. Bỏ `variantIds` là áp cho mọi SKU con của sản phẩm */
export interface BusinessStatusInput {
  action: VariantBusinessAction;
  variantIds?: string[];
}

export interface BusinessStatusResult {
  product: ProductDetail;
  /** SKU đã đổi */
  applied: string[];
  /** SKU bỏ qua: không ở trạng thái làm được thao tác này, hoặc bị chặn lưu trữ */
  skipped: { variantId: string; sku: string; code: string; reasons: string[] }[];
}

/** Vé tải lên module files (presigned URL, commerio-backend#14) */
export interface UploadTicket {
  fileId: string;
  uploadUrl: string;
  /** Header bắt buộc khi PUT lên uploadUrl, vd Content-Type */
  headers: Record<string, string>;
}

// ---------- Sửa hàng loạt SKU (FE#155, BE#242; hợp đồng đề xuất cho Documents/21 §17) ----------

/** Các ô sửa được trong bảng sửa hàng loạt */
export type BulkField = 'standardPrice' | 'minQty' | 'weightG' | 'lengthMm' | 'widthMm' | 'heightMm';

/** BE tính gợi ý, không tự ghi. `basis` nói vì sao ra số này để người dùng kiểm */
export interface BulkSuggestion {
  value: number;
  basis: string;
}

export interface BulkEditRow {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  /** "Trắng / L"; rỗng khi sản phẩm một SKU */
  attributesLabel: string;
  categoryName: string;
  version: number;
  /** Version của ngưỡng tồn (§15), null khi SKU chưa đặt ngưỡng */
  reorderVersion: number | null;
  current: Record<BulkField, number | null>;
  /** Đề nghị nhập gần nhất có SKU này; `lastCost` null khi không có quyền xem giá vốn */
  source: { purchaseRequestNumber: string; supplierName: string; lastCost: number | null } | null;
  suggestions: Partial<Record<BulkField, BulkSuggestion>>;
}

export interface BulkEditParams {
  page: number;
  pageSize: number;
  search?: string;
  categoryId?: string;
  /** Chỉ SKU còn trống ít nhất một ô */
  incomplete?: boolean;
}

/** Một dòng gửi lưu: chỉ các ô người dùng đã sửa hoặc đã nhận gợi ý; null là xoá giá trị */
export type BulkSaveRow = {
  variantId: string;
  version: number;
  reorderVersion?: number | null;
} & Partial<Record<BulkField, number | null>>;

export interface BulkSaveResult {
  saved: { variantId: string; version: number }[];
  /** Dòng lỗi không làm hỏng dòng khác; `errors` theo tên ô */
  failed: { variantId: string; code: string; message: string; errors?: Partial<Record<BulkField, string>> }[];
}

/** PATCH /catalog/products/:id/variants/:variantId (§17.2). Bỏ trường là giữ nguyên, null là xoá */
export interface VariantUpdateInput {
  version: number;
  standardPrice?: number | null;
  weightG?: number | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
}
