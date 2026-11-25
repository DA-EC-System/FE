import { parseCell, type CellParse } from '@/components/common/editableGrid/cellParse';
import { parseMeasure } from '@/utils/measure';
import { parsePrice } from '@/utils/price';
import type { BulkField, ProductVariant } from '@/types/catalog';

/**
 * Đọc chữ trong một ô số của SKU (bảng sửa hàng loạt và bảng biến thể, FE#475): giá theo ô giá; khối lượng, cạnh theo
 * `parseMeasure` (tối đa 50 kg, 2 m, chỉ nhận chữ số, commerio-backend#434); ngưỡng tồn cho phép 0
 */
export function parseVariantField(field: BulkField, raw: string): CellParse {
  switch (field) {
    case 'standardPrice':
    case 'targetNetPrice': {
      const p = parsePrice(raw);
      if (p.ok && p.value === 0) return { ok: false, error: 'Nhập số lớn hơn 0' };
      return p;
    }
    case 'weightG':
    case 'lengthMm':
    case 'widthMm':
    case 'heightMm':
      return parseMeasure(field, raw);
    case 'minQty':
      return parseCell(raw, { allowZero: true });
  }
}

/** Ô nên mở khi đi tới một SKU còn thiếu thông tin (`?spec=`, nút "Cần xử lý"): ô thiếu đầu tiên */
export function firstMissingField(v: Pick<ProductVariant, 'missing' | BulkField>): BulkField {
  if (v.missing.includes('price')) return v.targetNetPrice === null ? 'targetNetPrice' : 'standardPrice';
  if (v.missing.includes('weight')) return 'weightG';
  if (v.missing.includes('dimensions')) return (['lengthMm', 'widthMm', 'heightMm'] as const).find((f) => v[f] === null) ?? 'lengthMm';
  if (v.missing.includes('minQty')) return 'minQty';
  return 'targetNetPrice';
}

const BULK_FIELDS: readonly string[] = ['standardPrice', 'targetNetPrice', 'minQty', 'weightG', 'lengthMm', 'widthMm', 'heightMm'];
/** Đọc `?field=` trên URL */
export const isBulkField = (v: string | null): v is BulkField => v !== null && BULK_FIELDS.includes(v);

/**
 * Version gửi kèm khi lưu một ô SKU (FE#475): `version` của SKU và `reorderVersion` của ngưỡng tồn. `reorderVersion`
 * undefined là chưa đọc được (trang sản phẩm đang tải bảng ngưỡng): không gửi ngưỡng tồn, tránh ghi đè mù
 */
export interface SkuVersions {
  version: number;
  reorderVersion: number | null | undefined;
}
