import { z } from 'zod';
import { skuPatternError } from '@/utils/sku';
import type { Attribute } from '@/types/catalog';

export type Toast = { severity: 'success' | 'error' | 'warning'; msg: string };

export const MAX_IMAGES = 9;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên danh mục').max(60, 'Tên danh mục tối đa 60 ký tự'),
  skuPattern: z
    .string()
    .trim()
    .toUpperCase()
    .superRefine((value, ctx) => {
      const message = skuPatternError(value);
      if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    }),
});
export type CategoryForm = z.infer<typeof categorySchema>;

export const attributeSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên thuộc tính').max(40, 'Tên thuộc tính tối đa 40 ký tự'),
  values: z
    .array(
      z.object({
        id: z.string().optional(),
        value: z.string().trim().min(1, 'Nhập giá trị').max(40, 'Tối đa 40 ký tự'),
      }),
    )
    .min(1, 'Thêm ít nhất một giá trị')
    .superRefine((values, ctx) => {
      const seen = new Set<string>();
      values.forEach((v, i) => {
        const key = v.value.trim().toLowerCase();
        if (key && seen.has(key)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'value'], message: 'Giá trị bị trùng' });
        }
        seen.add(key);
      });
    }),
});
export type AttributeForm = z.infer<typeof attributeSchema>;

export const productSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên sản phẩm').max(200, 'Tên sản phẩm tối đa 200 ký tự'),
  categoryId: z.string().min(1, 'Chọn danh mục'),
  description: z.string().max(5000, 'Mô tả tối đa 5000 ký tự'),
});
export type ProductForm = z.infer<typeof productSchema>;

/** Tích Đề-các các nhóm giá trị; không chọn thuộc tính nào thì có một tổ hợp rỗng */
export function cartesian(groups: string[][]): string[][] {
  return groups.reduce<string[][]>(
    (acc, group) => acc.flatMap((combo) => group.map((id) => [...combo, id])),
    [[]],
  );
}

export const comboKey = (ids: string[]) => [...ids].sort().join('|');

/** Tên giá trị theo id, để xem trước SKU và hiện tổ hợp */
export function valueNames(attributes: Attribute[]): Map<string, string> {
  return new Map(attributes.flatMap((a) => a.values.map((v) => [v.id, v.value] as const)));
}

/** Kiểm file ảnh phía FE trước khi xin vé; BE kiểm lại */
export function imageFileError(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return `${file.name}: chỉ nhận ảnh JPG, PNG hoặc WebP`;
  if (file.size > MAX_IMAGE_BYTES) return `${file.name}: ảnh tối đa 5 MB`;
  return null;
}
