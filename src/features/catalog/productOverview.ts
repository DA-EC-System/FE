import type { ProductVariant, VariantBusinessStatus } from '@/types/catalog';
import type { StockLevel } from '@/types/inventory';
import type { Marketplace, ProductListingRow, Shop } from '@/types/shop';
import { BUSINESS_STATUS_LABELS } from './businessStatus';
import { categoryDrift, type RemoteProductDrift } from './platformCategory';

/**
 * Trang sản phẩm đủ thông tin (Documents/27 US-SP-11, commerio-backend#467): các phép gom thuần cho đầu trang, khối
 * "Trên sàn", bảng biến thể. Không gọi API.
 */

const STATUS_ORDER: VariantBusinessStatus[] = ['selling', 'paused', 'discontinued', 'archived'];
const STATUS_SHORT: Record<VariantBusinessStatus, string> = {
  selling: 'đang kinh doanh',
  paused: BUSINESS_STATUS_LABELS.paused.toLowerCase(),
  discontinued: BUSINESS_STATUS_LABELS.discontinued.toLowerCase(),
  archived: BUSINESS_STATUS_LABELS.archived.toLowerCase(),
};

/**
 * "3 đang kinh doanh · 1 tạm ngừng": đếm SKU theo trạng thái kinh doanh, bỏ trạng thái không có SKU nào. Sản phẩm cha
 * không có trạng thái riêng (Documents/21 §17.1), nên đếm theo SKU (US-SP-11 tiêu chí 1)
 */
export function businessSummary(variants: readonly Pick<ProductVariant, 'businessStatus'>[]): string {
  const counts = new Map<VariantBusinessStatus, number>();
  for (const v of variants) counts.set(v.businessStatus, (counts.get(v.businessStatus) ?? 0) + 1);
  return STATUS_ORDER.filter((s) => counts.get(s)).map((s) => `${counts.get(s)} ${STATUS_SHORT[s]}`).join(' · ');
}

/** Tổng có thể bán của các SKU (Documents/21 §15.1 `available`) */
export const totalAvailable = (levels: readonly Pick<StockLevel, 'available'>[]) =>
  levels.reduce((sum, l) => sum + l.available, 0);

/** Số gian hàng có ít nhất một listing `live` của sản phẩm */
export const sellingShopCount = (rows: readonly ProductListingRow[]) =>
  new Set(rows.filter((r) => r.listing?.status === 'live').map((r) => r.shopId)).size;

/** Dòng có listing (bỏ dòng "chưa lên sàn") theo biến thể, giữ thứ tự gian hàng BE trả */
export function listingsByVariant(rows: readonly ProductListingRow[]): Map<string, ProductListingRow[]> {
  const out = new Map<string, ProductListingRow[]>();
  for (const r of rows) {
    if (!r.listing) continue;
    out.set(r.variantId, [...(out.get(r.variantId) ?? []), r]);
  }
  return out;
}

/** Sàn có gian hàng chưa ngắt của công ty, theo thứ tự gặp trong danh sách gian hàng */
export const activePlatforms = (shops: readonly Pick<Shop, 'platform' | 'status'>[]): Marketplace[] => [
  ...new Set(shops.filter((s) => s.status !== 'disconnected').map((s) => s.platform)),
];

/**
 * Listing trên sàn đang ở category khác spec (US-SP-11 tiêu chí 5): dùng chung luật so của trang đẩy (`categoryDrift`),
 * chỉ xét dòng của sàn đó
 */
export function platformDrift(
  rows: readonly ProductListingRow[],
  platform: Marketplace,
  spec: { externalCategoryId: string; categoryPath: string },
): RemoteProductDrift[] {
  return categoryDrift(
    rows.filter((r) => r.platform === platform).map((row) => ({ shopId: row.shopId, row })),
    { id: spec.externalCategoryId, path: spec.categoryPath },
  );
}
