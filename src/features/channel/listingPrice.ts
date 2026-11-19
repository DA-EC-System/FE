import type { ListingRow } from '@/types/shop';

/** Nhãn nguồn giá của dòng ghép (FE#274, BE#225) */
export const PRICE_SOURCE_LABEL: Record<NonNullable<ListingRow['priceSource']>, string> = {
  standard: 'Giá chuẩn',
  shop: 'Theo gian hàng',
  override: 'Ghi đè',
};

/** Ô giá: chỉ số nguyên đồng, bỏ dấu chấm phân cách nghìn người dùng gõ */
export function parsePriceInput(text: string): { price: number } | { error: string } {
  const raw = text.trim().replace(/[.\s₫đ]/g, '');
  if (!raw) return { error: 'Nhập giá bán' };
  if (!/^\d+$/.test(raw)) return { error: 'Giá là số nguyên đồng' };
  const price = Number(raw);
  if (price <= 0) return { error: 'Giá phải lớn hơn 0' };
  return { price };
}
