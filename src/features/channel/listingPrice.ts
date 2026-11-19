import type { ListingRow } from '@/types/shop';

/** Nhãn nguồn giá của dòng ghép (FE#274, BE#225) */
export const PRICE_SOURCE_LABEL: Record<NonNullable<ListingRow['priceSource']>, string> = {
  standard: 'Giá chuẩn',
  shop: 'Theo gian hàng',
  override: 'Ghi đè',
};

/**
 * Ô giá: chỉ số nguyên đồng. Bỏ khoảng trắng và ký hiệu đồng; dấu chấm chỉ bỏ khi đúng dạng nhóm nghìn (150.000), nên
 * "150000.00" hay "99.5" báo lỗi thay vì thành số lớn gấp trăm lần
 */
export function parsePriceInput(text: string): { price: number } | { error: string } {
  const compact = text.trim().replace(/[\s₫]|đ/gi, '');
  if (!compact) return { error: 'Nhập giá bán' };
  const raw = /^\d{1,3}(\.\d{3})+$/.test(compact) ? compact.replace(/\./g, '') : compact;
  if (!/^\d+$/.test(raw)) return { error: 'Giá là số nguyên đồng' };
  const price = Number(raw);
  if (price <= 0) return { error: 'Giá phải lớn hơn 0' };
  return { price };
}
