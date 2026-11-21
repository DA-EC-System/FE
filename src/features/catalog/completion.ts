import type { ProductVariant, VariantMissing } from '@/types/catalog';
import { SHARED_TARGETS } from './productTabs';
import { specFieldDomId } from './specs/SpecFieldsInput';
import { isEmptySpec, type SpecDrafts, type SpecFieldView } from './specs/specValues';

/** id ô danh mục sản phẩm trong form, để thanh "Còn thiếu" nhảy tới */
export const GROUP_FIELD_ID = 'product-field-group';
/** id ô ngưỡng tồn mức sản phẩm (Documents/29 bước 3) */
export const MIN_QTY_FIELD_ID = 'product-field-min-qty';

/** Một dòng của thanh "Còn thiếu": tên trường, số SKU thiếu (nếu theo SKU), ô để nhảy tới */
export interface MissingItem {
  key: string;
  label: string;
  /** Số biến thể còn thiếu; không có là trường của sản phẩm */
  skuCount?: number;
  target: string;
}

/** Chữ theo bảng thuật ngữ Documents/29 mục 2 */
const LABELS: Record<VariantMissing | 'category', string> = {
  name: 'Tên sản phẩm',
  category: 'Danh mục sản phẩm',
  image: 'Ảnh sản phẩm',
  variantImages: 'Ảnh theo thuộc tính biến thể',
  price: 'Giá muốn thực nhận',
  minQty: 'Ngưỡng tồn',
  weight: 'Cân nặng',
  dimensions: 'Kích thước gói',
  specs: 'Thuộc tính sản phẩm bắt buộc',
};

const TARGETS: Record<VariantMissing | 'category', string> = {
  name: SHARED_TARGETS.name,
  category: GROUP_FIELD_ID,
  image: SHARED_TARGETS.images,
  variantImages: SHARED_TARGETS.images,
  price: SHARED_TARGETS.variants,
  minQty: MIN_QTY_FIELD_ID,
  weight: SHARED_TARGETS.variants,
  dimensions: SHARED_TARGETS.variants,
  specs: SHARED_TARGETS.specs,
};

const PRODUCT_LEVEL = new Set<string>(['name', 'category', 'image', 'specs']);
const ORDER: (VariantMissing | 'category')[] = ['name', 'category', 'image', 'specs', 'variantImages', 'price', 'minQty', 'weight', 'dimensions'];

/**
 * Thanh "Còn thiếu" (Documents/29 bước 3; độ hoàn thiện theo Documents/21 §17.1, BE tính).
 * - Sản phẩm đã lưu: gộp `missing` của các SKU chưa lưu trữ; thuộc tính sản phẩm bắt buộc tách từng ô theo bản đang gõ.
 * - Form tạo: chưa có `missing` của BE, tự xét tên, danh mục, ảnh và thuộc tính bắt buộc đang gõ.
 */
export function missingItems(input: {
  variants?: Pick<ProductVariant, 'businessStatus' | 'missing'>[];
  form?: { name: string; groupId: string; imageCount: number };
  requiredSpecs?: Pick<SpecFieldView, 'fieldId' | 'name' | 'required'>[];
  specDrafts?: SpecDrafts;
}): MissingItem[] {
  const counts = new Map<VariantMissing | 'category', number>();
  for (const v of input.variants ?? []) {
    if (v.businessStatus === 'archived') continue;
    for (const m of v.missing) counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  if (input.form) {
    if (!input.form.name.trim()) counts.set('name', 1);
    if (!input.form.groupId) counts.set('category', 1);
    if (!input.form.imageCount) counts.set('image', 1);
  }

  // Thuộc tính bắt buộc còn trống theo bản đang gõ: mỗi ô một dòng, nhảy đúng ô
  const specRows: MissingItem[] = (input.requiredSpecs ?? [])
    .filter((f) => f.required && isEmptySpec(input.specDrafts?.[f.fieldId]))
    .map((f) => ({ key: `spec:${f.fieldId}`, label: f.name, target: specFieldDomId(f.fieldId) }));
  if (input.requiredSpecs) counts.delete('specs');

  const items: MissingItem[] = [];
  for (const k of ORDER) {
    if (k === 'specs') {
      items.push(...specRows);
      if (!counts.has('specs')) continue;
    }
    const n = counts.get(k);
    if (!n) continue;
    items.push({ key: k, label: LABELS[k], target: TARGETS[k], ...(PRODUCT_LEVEL.has(k) ? {} : { skuCount: n }) });
  }
  return items;
}

/** Lý do khoá nút "Đăng sản phẩm"; null là bấm được */
export function publishBlocker(input: {
  isNew: boolean;
  archived: boolean;
  canPublish: boolean;
  missingCount: number;
  dirty: boolean;
}): string | null {
  if (input.isNew) return 'Lưu sản phẩm trước rồi mới đăng';
  if (input.archived) return 'Sản phẩm đã lưu trữ';
  if (!input.canPublish) return 'Bạn không có quyền đăng sản phẩm lên gian hàng';
  if (input.missingCount) return `Còn thiếu ${input.missingCount} mục để đăng`;
  if (input.dirty) return 'Lưu thay đổi trước rồi mới đăng';
  return null;
}
