import type { ProductVariant } from '@/types/catalog';

/** Ô của hộp Thông tin SKU chép được từ SKU cùng sản phẩm */
export const COPY_FIELDS = ['standardPrice', 'targetNetPrice', 'weightG', 'lengthMm', 'widthMm', 'heightMm'] as const;
export type CopyField = (typeof COPY_FIELDS)[number];

type Facts = Pick<ProductVariant, 'id' | 'sku' | 'businessStatus' | CopyField>;

const filled = (v: Facts, f: CopyField) => v[f] !== null && v[f] !== undefined;

/**
 * SKU cùng sản phẩm để gợi ý chép giá, cân nặng, kích thước gói (kiểm người bán KB3 3.9; Documents/25 §5.3: gợi ý, xác
 * nhận mới lưu). Chọn SKU chưa lưu trữ có số cho nhiều ô mà SKU đang sửa còn trống nhất; không có ô nào chép được thì null.
 */
export function siblingToCopy(variant: Facts, siblings: readonly Facts[]): { from: Facts; fields: CopyField[] } | null {
  let best: { from: Facts; fields: CopyField[] } | null = null;
  for (const s of siblings) {
    if (s.id === variant.id || s.businessStatus === 'archived') continue;
    const fields = COPY_FIELDS.filter((f) => !filled(variant, f) && filled(s, f));
    if (fields.length && (!best || fields.length > best.fields.length)) best = { from: s, fields };
  }
  return best;
}

/** Nhãn ngắn của các ô sẽ chép, cho câu gợi ý */
export function copyFieldsText(fields: readonly CopyField[]): string {
  const parts: string[] = [];
  if (fields.includes('standardPrice')) parts.push('giá chuẩn');
  if (fields.includes('targetNetPrice')) parts.push('giá muốn thực nhận');
  if (fields.includes('weightG')) parts.push('cân nặng');
  if (fields.some((f) => f === 'lengthMm' || f === 'widthMm' || f === 'heightMm')) parts.push('kích thước gói');
  return parts.join(', ');
}
