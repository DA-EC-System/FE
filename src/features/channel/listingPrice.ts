import type { ListingRow } from '@/types/shop';

/** Nhãn nguồn giá của dòng ghép (FE#274, BE#225). Ô giá đọc bằng `parseMoney` (FE#385) */
export const PRICE_SOURCE_LABEL: Record<NonNullable<ListingRow['priceSource']>, string> = {
  standard: 'Giá chuẩn',
  shop: 'Theo gian hàng',
  override: 'Ghi đè',
};
