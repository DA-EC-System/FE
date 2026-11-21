import { z } from 'zod';
import { valueCode } from '@/utils/sku';
import type { Attribute, ProductDetail, ProductUpdateInput } from '@/types/catalog';
import { suggestFormSchema } from './suggest';

export const MAX_IMAGES = 9;
/** Ảnh gửi lên kho: JPG, PNG, tối đa 1 MB, cạnh ngắn từ 330 px cho khớp yêu cầu của sàn (FE#205) */
export const MAX_IMAGE_BYTES = 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png'];
export const MIN_IMAGE_SIDE = 330;
/** Tệp người dùng chọn được: WebP đổi sang JPEG khi nén, không từ chối */
export const SOURCE_IMAGE_TYPES = [...IMAGE_TYPES, 'image/webp'];

/** Nhóm hàng (Documents/21 §5.2): tên 1–60 ký tự, năm ô gợi ý ghi đè công ty (trống là theo công ty) */
export const groupSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên danh mục sản phẩm').max(60, 'Tên danh mục tối đa 60 ký tự'),
  suggest: suggestFormSchema,
});
export type GroupForm = z.infer<typeof groupSchema>;

export const VALUE_CODE = /^[A-Z0-9]{1,6}$/;

export const attributeSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên thuộc tính').max(15, 'Tên thuộc tính tối đa 15 ký tự'),
  values: z
    .array(
      z.object({
        id: z.string().optional(),
        value: z.string().trim().min(1, 'Nhập giá trị').max(20, 'Mỗi giá trị tối đa 20 ký tự'),
        // Bỏ trống thì sinh từ giá trị (V21)
        code: z.string().trim().toUpperCase(),
      }),
    )
    .min(1, 'Thêm ít nhất một giá trị')
    .superRefine((values, ctx) => {
      const seenValues = new Set<string>();
      const seenCodes = new Set<string>();
      values.forEach((v, i) => {
        const key = v.value.trim().toLowerCase();
        if (key && seenValues.has(key)) {
          ctx.addIssue({ code: 'custom', path: [i, 'value'], message: 'Giá trị bị trùng' });
        }
        seenValues.add(key);

        const code = effectiveCode(v);
        if (!VALUE_CODE.test(code)) {
          ctx.addIssue({
            code: 'custom',
            path: [i, 'code'],
            message: code ? 'Mã chỉ gồm A-Z, 0-9, tối đa 6 ký tự' : 'Nhập mã',
          });
        } else if (seenCodes.has(code)) {
          ctx.addIssue({ code: 'custom', path: [i, 'code'], message: 'Mã bị trùng' });
        }
        seenCodes.add(code);
      });
    }),
});
export type AttributeForm = z.infer<typeof attributeSchema>;

/** Mã sẽ lưu: mã người dùng nhập, bỏ trống thì sinh từ giá trị */
export function effectiveCode(v: { value: string; code?: string }): string {
  return v.code?.trim().toUpperCase() || valueCode(v.value);
}

export const productSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên sản phẩm').max(200, 'Tên sản phẩm tối đa 200 ký tự'),
  groupId: z.string().min(1, 'Chọn danh mục sản phẩm'),
  description: z.string().max(5000, 'Mô tả tối đa 5000 ký tự'),
  /** Mã ISO alpha-2, rỗng là chưa chọn (Documents/21 §17.2; chỉ sửa được khi đã tạo sản phẩm) */
  originCountry: z.string(),
  brand: z.string().trim().max(100, 'Thương hiệu tối đa 100 ký tự'),
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

/** Tên và mã giá trị theo id, để hiện tổ hợp và xem trước SKU */
export function valueIndex(attributes: Attribute[]): Map<string, { value: string; code: string }> {
  return new Map(
    attributes.flatMap((a) => a.values.map((v) => [v.id, { value: v.value, code: v.code }] as const)),
  );
}

/** Kiểu tệp người dùng chọn: JPG, PNG, hoặc WebP (sẽ đổi sang JPG) */
export function sourceImageError(file: File): string | null {
  return SOURCE_IMAGE_TYPES.includes(file.type) ? null : `${file.name}: chỉ nhận ảnh JPG hoặc PNG`;
}

/** Kiểm tệp đã nén trước khi xin vé; BE kiểm lại */
export function imageFileError(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return `${file.name}: chỉ nhận ảnh JPG hoặc PNG`;
  if (file.size > MAX_IMAGE_BYTES) return `${file.name}: ảnh lớn hơn 1 MB`;
  return null;
}

/**
 * `sizeChartFileId` của PUT (Documents/21, FE#261): không đổi thì bỏ trống để BE giữ nguyên,
 * gỡ ảnh thì `null`, chọn ảnh mới thì gửi id mới
 */
export function sizeChartPatch(initial: string | null, current: string | null): { sizeChartFileId?: string | null } {
  if (initial === current) return {};
  return { sizeChartFileId: current };
}

/**
 * Body `PUT /catalog/products/:id` chỉ đổi xuất xứ, thương hiệu (trang đẩy, commerio-backend#467): PUT đòi đủ tên, mô tả,
 * ảnh nên gửi lại giá trị đang có; bỏ `sizeChartFileId` là giữ bảng size. Ô trống gửi `null`
 */
export function productFactsBody(
  p: Pick<ProductDetail, 'name' | 'description' | 'images' | 'version'>,
  facts: { originCountry: string; brand: string },
): ProductUpdateInput {
  return {
    name: p.name,
    description: p.description,
    imageFileIds: [...p.images].sort((a, b) => a.position - b.position).map((i) => i.fileId),
    originCountry: facts.originCountry.trim() || null,
    brand: facts.brand.trim() || null,
    version: p.version,
  };
}

/**
 * Body `PUT /catalog/products/:id` chỉ đổi một số trường (nút "Dùng giá trị này" theo sàn, FE#417): các trường khác gửi lại
 * giá trị đã lưu của sản phẩm, kèm `version` để lệch thì BE trả 409; bỏ `sizeChartFileId` là giữ bảng size
 */
export function productPatchBody(
  p: Pick<ProductDetail, 'name' | 'description' | 'images' | 'originCountry' | 'brand' | 'version'>,
  patch: { originCountry?: string; brand?: string; description?: string; imageAttributeId?: string | null },
): ProductUpdateInput {
  return {
    ...('imageAttributeId' in patch && { imageAttributeId: patch.imageAttributeId ?? null }),
    name: p.name,
    description: patch.description ?? p.description,
    imageFileIds: [...p.images].sort((a, b) => a.position - b.position).map((i) => i.fileId),
    originCountry: patch.originCountry ?? p.originCountry ?? null,
    brand: patch.brand ?? p.brand ?? null,
    version: p.version,
  };
}
