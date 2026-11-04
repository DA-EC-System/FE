/**
 * Ghép danh mục Commerio với danh mục lá của sàn (FE#146, Documents/21 §18.5).
 * Hàm thuần dùng chung cho màn hình và mock: kiểm thuộc tính bắt buộc, đọc lỗi 422 theo trường,
 * gộp danh mục Commerio với bản ghép của gian hàng.
 */

import type { Category } from '@/types/catalog';
import type { CategoryAttribute, CategoryMap } from '@/types/shop';

/** Tiền tố khoá lỗi 422 của thuộc tính: `errors["attributes.<tên>"]` */
export const ATTRIBUTE_ERROR_PREFIX = 'attributes.';

/** BE trả tối đa 50 danh mục mỗi lần tìm */
export const CATEGORY_SEARCH_LIMIT = 50;

/** Bỏ dấu và viết thường để tìm "ao thun" ra "Áo thun" */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/** Danh mục lá khớp từ khoá (mọi từ đều có trong đường dẫn), tối đa `limit` */
export function searchCategories<T extends { name: string }>(items: T[], search: string, limit = CATEGORY_SEARCH_LIMIT): T[] {
  const words = foldText(search).split(/\s+/).filter(Boolean);
  const hits = words.length ? items.filter((c) => words.every((w) => foldText(c.name).includes(w))) : items;
  return hits.slice(0, limit);
}

/**
 * Lỗi thuộc tính bắt buộc, khoá theo `name`: thiếu giá trị, hoặc giá trị ngoài `options`.
 * Câu giống BE để FE chặn trước khi gửi và mock trả 422 cùng nội dung.
 */
export function attributeErrors(attributes: CategoryAttribute[], values: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const a of attributes) {
    const value = values[a.name]?.trim() ?? '';
    if (!value) errors[a.name] = a.options.length ? `Chọn ${a.label.toLowerCase()}` : `Nhập ${a.label.toLowerCase()}`;
    else if (a.options.length && !a.options.includes(value)) errors[a.name] = 'Chọn một giá trị trong danh sách';
  }
  return errors;
}

/** `errors` của Problem Details → lỗi theo tên thuộc tính; khoá khác (vd `externalCategoryId`) giữ nguyên */
export function splitProblemErrors(errors: Record<string, string> | undefined): {
  attributes: Record<string, string>;
  other: Record<string, string>;
} {
  const attributes: Record<string, string> = {};
  const other: Record<string, string> = {};
  for (const [key, message] of Object.entries(errors ?? {})) {
    if (key.startsWith(ATTRIBUTE_ERROR_PREFIX)) attributes[key.slice(ATTRIBUTE_ERROR_PREFIX.length)] = message;
    else other[key] = message;
  }
  return { attributes, other };
}

/** Chỉ gửi thuộc tính của danh mục đang chọn (đổi danh mục thì bỏ giá trị cũ), đã cắt khoảng trắng */
export function pickAttributeValues(
  attributes: CategoryAttribute[],
  values: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(attributes.map((a) => [a.name, values[a.name]?.trim() ?? '']));
}

export interface CategoryMapRow {
  category: Pick<Category, 'id' | 'name'>;
  map: CategoryMap | null;
}

/** Mọi danh mục Commerio kèm bản ghép (nếu có); chưa ghép lên trước, rồi theo tên */
export function categoryMapRows(categories: Pick<Category, 'id' | 'name'>[], maps: CategoryMap[]): CategoryMapRow[] {
  const byCategory = new Map(maps.map((m) => [m.categoryId, m]));
  return categories
    .map((category) => ({ category, map: byCategory.get(category.id) ?? null }))
    .sort((a, b) => Number(Boolean(a.map)) - Number(Boolean(b.map)) || a.category.name.localeCompare(b.category.name, 'vi'));
}
