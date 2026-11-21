/**
 * Catalog của công ty đang chọn (UC-CP-01, UC-CP-02; commerio-backend#13, #14).
 * Nhóm hàng phân loại nội bộ, một cấp; mẫu SKU ở cài đặt công ty (Documents/21 §5, FE#350); SKU thuộc biến thể (QT-11).
 * Mọi API lấy công ty từ token; không truyền companyId.
 */

/**
 * Cấu hình gợi ý (Documents/21 §17.5): ở nhóm `null` là theo công ty; ở công ty `null` là không gợi ý (riêng
 * `priceRounding` null là bước 1 đồng)
 */
export interface SuggestConfig {
  marginCoefficient: number | null;
  priceRounding: number | null;
  reorderLeadDays: number | null;
  reorderSafetyQty: number | null;
  reorderDefaultQty: number | null;
}

/** Nhóm hàng (Documents/21 §5.2): phân loại nội bộ, một cấp, không ghép sang sàn */
/**
 * Tầng của dòng dữ liệu (dữ liệu chung, Documents/21 §5.6): `platform` là chuẩn nền tảng dùng chung mọi công ty, công ty
 * chỉ đọc và thêm được phần riêng; `company` là của công ty. Thiếu thì coi như `platform` (chỉ đọc), để thiếu dữ liệu không mở nút sửa rồi bị 403
 */
export type DataScope = 'platform' | 'company';

/** Dòng chuẩn nền tảng, hoặc thiếu `scope`: công ty không sửa, không xoá */
export const isPlatform = (row: { scope?: DataScope }) => row.scope !== 'company';

export interface ProductGroup {
  id: string;
  name: string;
  scope?: DataScope;
  /** Nhóm chuẩn công ty đã ẩn (không hiện ở form sản phẩm); nhóm của công ty luôn false */
  hidden?: boolean;
  /** Danh mục mặc định đổi tên khi gộp dữ liệu chuẩn: tên cũ (Documents/21 §5.7) */
  renamedFrom?: string | null;
  /** Danh mục hẹp hơn tách từ danh mục cũ; rỗng là không tách (Documents/21 §5.7) */
  splitInto?: { id: string; name: string }[];
  /** Kể cả sản phẩm đã lưu trữ */
  productCount: number;
  suggest: SuggestConfig;
  /** Trục phân loại chuẩn của mẫu nhóm, 0–2 theo thứ tự (Documents/21 §5.5) */
  axes?: GroupAxis[];
  /** Số thông số trong mẫu và số thông số bắt buộc */
  specFieldCount?: number;
  requiredCount?: number;
  updatedAt: string;
  version: number;
}

export interface GroupAxis {
  scope?: DataScope;
  attributeId: string;
  name: string;
  platformKind: PlatformKind | null;
}

/** `suggest` chỉ gửi khi có `catalog.group.manage`; tạo nhanh trong form chỉ gửi `name` */
export interface ProductGroupInput {
  name: string;
  suggest?: SuggestConfig;
  /** Chép mẫu thông số và trục chuẩn của nhóm khác (một lần, không thành cha con); PUT thay mẫu đang có (§5.2, §5.5) */
  copyTemplateFromGroupId?: string;
}

/** Cài đặt sản phẩm của công ty (`/catalog/settings`) */
export interface ProductSettings {
  /** Vd "SP{SEQ:5}-{VAL}", xem utils/sku.ts */
  skuPattern: string;
  /** Số {SEQ} cấp cho SKU kế tiếp, chỉ đọc */
  skuNextSeq: number;
  suggest: SuggestConfig;
  version: number;
}

export interface ProductSettingsInput {
  skuPattern: string;
  suggest?: SuggestConfig;
  version: number;
}

/** Loại thuộc tính chuẩn sàn; adapter ghép sang sales attribute theo loại (Documents/21 §18.8.3) */
/** 23 thuộc tính biến thể chuẩn (Documents/21 §5.7); mã sale prop của từng sàn là hằng của adapter */
export type PlatformKind =
  | 'color' | 'size' | 'shoe_size' | 'bra_size' | 'age' | 'ring_size'
  | 'storage' | 'version' | 'screen_size' | 'connector' | 'length' | 'battery_capacity'
  | 'voltage' | 'power' | 'volume' | 'weight' | 'flavor' | 'scent'
  | 'pack' | 'diaper_size' | 'bed_size' | 'style' | 'compatible_model';

export interface AttributeValue {
  id: string;
  value: string;
  /** Mã dùng trong {VAL} của SKU (D27, docs/21 V21), vd "DEN" */
  code: string;
  /** Đã có biến thể dùng: không xoá được */
  inUse: boolean;
  /** Giá trị chuẩn của thuộc tính nền tảng, hay giá trị công ty thêm */
  scope?: DataScope;
}

export interface Attribute {
  id: string;
  name: string;
  scope?: DataScope;
  /** Thuộc tính chuẩn sàn (Màu sắc, Kích cỡ, Dung tích, Hương vị), hệ thống tạo khi lập công ty; null là tự đặt */
  platformKind: PlatformKind | null;
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

/** Nhãn chính của SKU (7 giá trị, Documents/21 §17.1): Lưu trữ → Ngừng nhập → Tạm ngừng → hiện diện trên sàn */
export type VariantMainLabel = 'archived' | 'discontinued' | 'paused' | 'live' | 'error' | 'pending' | 'not_listed';

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

/** Phần còn thiếu theo Documents/21 §17.1; name, image tính ở cha, còn lại theo SKU. Nhóm hàng bắt buộc nên không thiếu */
export type VariantMissing = 'name' | 'image' | 'variantImages' | 'price' | 'minQty' | 'weight' | 'dimensions' | 'specs';

export const MISSING_LABELS: Record<VariantMissing, string> = {
  name: 'tên',
  image: 'ảnh',
  variantImages: 'ảnh phân loại',
  price: 'giá muốn thực nhận',
  minQty: 'ngưỡng tồn',
  weight: 'cân nặng',
  dimensions: 'kích thước đóng gói',
  specs: 'thuộc tính sản phẩm bắt buộc',
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
  /** Giá muốn bán, số muốn thực nhận (D7); thiếu thì SKU Chờ hoàn thiện vì giá */
  targetNetPrice: number | null;
  /** Ngưỡng tồn đặt ở §15 (quyền inventory.reorder.manage), ở đây chỉ để xem */
  minQty: number | null;
  weightG: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  /** Version của SKU, gửi kèm PATCH §17.2 */
  version: number;
  presence: VariantPresence;
  /** Có listing lỗi (push_failed, rejected, platform_hold) kể cả khi đã live: nhãn phụ "Có lỗi" */
  hasListingError: boolean;
  /** Số listing trên sàn, kể cả listing đang ẩn do tạm ngừng */
  listingCount: number;
  /** Lý do chưa lưu trữ được (tồn, đang về, chờ xử lý, chứng từ mở); rỗng là lưu trữ được */
  archiveBlockers: string[];
}

export interface ProductListItem {
  id: string;
  /** Mã sản phẩm cha, duy nhất trong công ty, sinh theo mẫu SKU của công ty */
  code: string;
  name: string;
  group: { id: string; name: string };
  /** Số SKU chưa lưu trữ */
  variantCount: number;
  /** Mọi SKU, kể cả đã lưu trữ */
  variantTotal: number;
  /** Số SKU theo nhãn chính (đủ 7 khoá, tính cả SKU lưu trữ), để suy nhãn cha ("Đang bán 4/6") */
  labelCounts: Record<VariantMainLabel, number>;
  /** Số SKU chưa lưu trữ Chờ hoàn thiện */
  incompleteCount: number;
  /** Số SKU chưa lưu trữ có listing lỗi, kể cả SKU đang bán */
  errorCount: number;
  thumbnailUrl: string | null;
  status: ProductStatus;
  updatedAt: string;
  version: number;
}

export interface ProductDetail extends ProductListItem {
  description: string;
  images: ProductImage[];
  /** Ảnh bảng kích cỡ, một ảnh dùng chung mọi SKU và gian hàng; `url` rỗng khi máy chủ chưa cấu hình link ảnh */
  sizeChart: { fileId: string; url: string } | null;
  /**
   * Xuất xứ (ISO alpha-2) và thương hiệu, dùng chung mọi sàn (Documents/21 §17.2, commerio-backend#340). Tuỳ chọn tới
   * khi BE #340 merge; trang đẩy lên sàn đọc để hiện ở tab Product info
   */
  originCountry?: string | null;
  brand?: string | null;
  variants: ProductVariant[];
  /** Thuộc tính gắn ảnh phân loại (một trục của sản phẩm), null là chưa chọn (Documents/21 §17.2, commerio-backend#340) */
  imageAttributeId?: string | null;
  /** Ảnh theo giá trị của thuộc tính gắn ảnh; `url` rỗng khi máy chủ chưa cấu hình link ảnh */
  attributeValueImages?: { attributeValueId: string; fileId: string; url: string }[];
  /** Thông số của mẫu nhóm hiện tại (theo thứ tự mẫu), rồi thông số ngoài mẫu đang có giá trị (Documents/21 §5.5) */
  specs?: ProductSpecValue[];
  /** Thông số `required` của mẫu đang trống */
  missingSpecFieldIds?: string[];
}

export interface ProductListParams {
  page?: number;
  pageSize?: number;
  /** Tên sản phẩm hoặc SKU */
  search?: string;
  groupId?: string;
  status?: ProductStatus;
  /** Có ít nhất một SKU ở trạng thái này */
  businessStatus?: Exclude<VariantBusinessStatus, 'archived'>;
  /** `incomplete`: còn SKU Chờ hoàn thiện; `ready`: mọi SKU Sẵn sàng (Documents#228, 21 §17.2) */
  readiness?: VariantReadiness;
}

/**
 * Trục phân loại (Documents/21 §5.2): có `attributeId` thì dùng thuộc tính đó; chỉ `name` thì BE dùng thuộc tính cùng
 * tên hoặc tạo mới. Giá trị không có `id` là giá trị mới, tạo cùng giao dịch
 */
export interface ProductAxis {
  attributeId?: string;
  name?: string;
  /** `imageFileId` chỉ ở trục `imageAxis` khi tạo (Documents/21 §5.5) */
  values: { id?: string; value: string; imageFileId?: string }[];
}

export interface ProductCreateInput {
  name: string;
  groupId: string;
  description: string;
  /** Theo thứ tự hiển thị, phần tử đầu là ảnh đại diện */
  imageFileIds: string[];
  sizeChartFileId?: string | null;
  /** Tối đa 2 trục */
  axes: ProductAxis[];
  /** `options[i]` là một `value` của `axes[i]`; không trục thì một biến thể `options: []`. Giá, cân nặng, kích thước tuỳ chọn */
  variants: ({ options: string[] } & VariantFacts)[];
  specs?: SpecInput[];
  /** Chỉ số trục trong `axes` làm thuộc tính gắn ảnh */
  imageAxis?: 0 | 1;
  /** Xuất xứ ISO alpha-2, thương hiệu: điền ngay lúc tạo (Documents/21 §5.5) */
  originCountry?: string | null;
  brand?: string | null;
}

/** Giá, cân nặng, kích thước gói của một SKU; luật như PATCH …/variants/:variantId (§17.2) */
export interface VariantFacts {
  standardPrice?: number | null;
  targetNetPrice?: number | null;
  weightG?: number | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
}

export interface ProductUpdateInput {
  name: string;
  description: string;
  imageFileIds: string[];
  /** Bỏ trống thì giữ nguyên, `null` thì gỡ, id thì thay */
  sizeChartFileId?: string | null;
  /** Gửi để đổi nhóm hàng */
  groupId?: string;
  /** Xuất xứ, mã ISO alpha-2; bỏ trường là giữ, `null` là xoá (Documents/21 §17.2) */
  originCountry?: string | null;
  /** Thương hiệu; bỏ trường là giữ, `null` là không thương hiệu */
  brand?: string | null;
  /** Bỏ trường là giữ, `null` là bỏ chọn; đổi hoặc bỏ thì BE gỡ mọi ảnh phân loại của thuộc tính cũ */
  imageAttributeId?: string | null;
  /** Thay giá trị của từng `fieldId` gửi lên; `optionIds: []` hoặc `value: ''` là xoá */
  specs?: SpecInput[];
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
  groupName: string;
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
  groupId?: string;
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
  targetNetPrice?: number | null;
  weightG?: number | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
}

// ---------- Thông số sản phẩm theo nhóm hàng (Documents/21 §5.5) ----------

export type SpecInputKind = 'select' | 'multiselect' | 'text' | 'number' | 'date';

export interface SpecOption {
  id: string;
  value: string;
  scope?: DataScope;
}

/** Thông số trong thư viện của công ty */
export interface SpecField {
  id: string;
  scope?: DataScope;
  code: string;
  name: string;
  input: SpecInputKind;
  unit: string | null;
  /** select/multiselect nhận giá trị ngoài danh sách (tạo lựa chọn mới) */
  allowCustom: boolean;
  options: (SpecOption & { position: number; inUse: boolean })[];
  groupCount: number;
  productCount: number;
  updatedAt: string;
  version: number;
}

export interface SpecFieldCreateInput {
  code?: string;
  name: string;
  input: SpecInputKind;
  unit?: string | null;
  allowCustom: boolean;
  options?: { value: string }[];
}

/** Không đổi được `code`, `input`; lựa chọn cũ vắng mặt là xoá, thứ tự mảng là `position` */
export interface SpecFieldUpdateInput {
  name: string;
  unit?: string | null;
  allowCustom: boolean;
  options?: { id?: string; value: string }[];
  version: number;
}

export interface GroupTemplateField {
  /** Dòng của mẫu chuẩn (không bỏ được) hay dòng công ty thêm vào nhóm chuẩn */
  scope?: DataScope;
  fieldId: string;
  code: string;
  name: string;
  input: SpecInputKind;
  unit: string | null;
  allowCustom: boolean;
  required: boolean;
  options: SpecOption[];
}

/** Mẫu nhóm hàng; `version` là của nhóm */
/** Thuộc tính biến thể được phép của danh mục (Documents/21 §5.7): gợi ý và lọc ô chọn, không chặn lưu */
export interface AllowedAttribute {
  attributeId: string;
  name: string;
  platformKind: string | null;
  scope?: DataScope;
  /** Đang là biến thể mặc định (trục chuẩn) của danh mục */
  isAxis: boolean;
}

export interface GroupTemplate {
  groupId: string;
  axes: (GroupAxis & { values: SpecOption[] })[];
  fields: GroupTemplateField[];
  /** BE trước §5.7 chưa trả: coi như mọi thuộc tính đều được */
  allowedAttributes?: AllowedAttribute[];
  version: number;
}

export interface GroupTemplateInput {
  /** 0–2, khác nhau. Nhóm chuẩn: không gửi (trục do nền tảng đặt, gửi thì 422) */
  axisAttributeIds?: string[];
  /** Thứ tự mảng là thứ tự hiển thị. Nhóm chuẩn: chỉ dòng của công ty */
  fields: { fieldId: string; required: boolean }[];
  /** Thuộc tính biến thể được phép (§5.7); bỏ trường là giữ. Danh mục mặc định: chỉ phần của công ty */
  allowedAttributeIds?: string[];
  version: number;
}

/** Giá trị gửi lên: select đúng một trong optionIds/newValues; multiselect cộng lại 1–20; text/number/date dùng value */
export interface SpecInput {
  fieldId: string;
  optionIds?: string[];
  newValues?: string[];
  value?: string;
}

export interface ProductSpecValue {
  fieldId: string;
  code: string;
  name: string;
  input: SpecInputKind;
  unit: string | null;
  allowCustom: boolean;
  required: boolean;
  /** false: thông số ngoài mẫu nhóm hiện tại, hiện ở "Thông số khác" */
  inTemplate: boolean;
  selected: SpecOption[];
  choices: SpecOption[];
  value: string | null;
}
