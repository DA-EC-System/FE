/**
 * Dữ liệu riêng của bảng sửa hàng loạt (FE#155): khối lượng, kích thước, version của SKU
 * và quy tắc gợi ý theo danh mục. BE thật giữ ở catalog.product_variants và cấu hình danh mục (BE#242).
 */

export interface MockVariantSpec {
  weightG: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  version: number;
}

/** SKU không có ở đây coi như chưa nhập khối lượng, kích thước và version 1 */
export const variantSpecs: Record<string, MockVariantSpec> = {
  'prd-001-v1': { weightG: 180, lengthMm: 300, widthMm: 250, heightMm: 20, version: 2 },
  'prd-001-v2': { weightG: 200, lengthMm: 300, widthMm: 250, heightMm: 20, version: 1 },
  'prd-002-v1': { weightG: 450, lengthMm: 350, widthMm: 300, heightMm: 40, version: 1 },
  'prd-003-v1': { weightG: 300, lengthMm: 200, widthMm: 120, heightMm: 50, version: 1 },
};

export function specOf(variantId: string): MockVariantSpec {
  return (variantSpecs[variantId] ??= { weightG: null, lengthMm: null, widthMm: null, heightMm: null, version: 1 });
}

export interface MockCategoryRule {
  /** Giá chuẩn gợi ý = giá nhập × hệ số */
  markup: number;
  /** Làm tròn giá gợi ý tới bội số này */
  roundTo: number;
  /** Số ngày NCC giao, dùng cho ngưỡng tồn gợi ý */
  leadDays: number;
  safetyStock: number;
}

const DEFAULT_RULE: MockCategoryRule = { markup: 1.4, roundTo: 1000, leadDays: 7, safetyStock: 5 };

export const categoryRules: Record<string, MockCategoryRule> = {
  'cat-ao': { markup: 1.4, roundTo: 1000, leadDays: 7, safetyStock: 5 },
  'cat-quan': { markup: 1.5, roundTo: 1000, leadDays: 7, safetyStock: 3 },
  'cat-pk': { markup: 1.6, roundTo: 1000, leadDays: 10, safetyStock: 2 },
};

export const ruleOf = (categoryId: string) => categoryRules[categoryId] ?? DEFAULT_RULE;

/** Giới hạn BE kiểm khi lưu, FE không chặn trước để thấy lỗi theo dòng */
export const SPEC_LIMITS = { weightG: 50000, sizeMm: 2000, maxRows: 200 } as const;

/** Số ngày bán dùng tính tốc độ bán */
export const VELOCITY_DAYS = 30;
