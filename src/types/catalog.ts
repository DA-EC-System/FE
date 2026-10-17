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

export type ProductStatus = 'active' | 'archived';

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

export interface ProductVariant {
  id: string;
  sku: string;
  attributes: VariantAttribute[];
  archivedAt: string | null;
}

export interface ProductListItem {
  id: string;
  name: string;
  category: { id: string; name: string };
  /** Số biến thể đang bán */
  variantCount: number;
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

/** Vé tải lên module files (presigned URL, commerio-backend#14) */
export interface UploadTicket {
  fileId: string;
  uploadUrl: string;
  /** Header bắt buộc khi PUT lên uploadUrl, vd Content-Type */
  headers: Record<string, string>;
}
