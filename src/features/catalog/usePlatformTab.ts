import { useMemo } from 'react';
import { usePlatformCategory, useProductSpec } from '@/api/shops.api';
import { productAxes, specMissing, type ProductFacts } from '@/features/channel/specDraft';
import { shopUsable } from '@/lib/machines/channel';
import type { ProductDetail } from '@/types/catalog';
import type { Marketplace, Shop } from '@/types/shop';
import { sharedGaps } from './productTabs';

/**
 * Dữ liệu một tab sàn, dùng chung cho nhãn "Thiếu N" ở thanh tab và nội dung tab (react-query gộp lời gọi). Đếm thiếu
 * theo luật `specMissing` của trang đẩy khi đã có attribute của leaf, chưa có thì theo `missing` của BE; cộng trường
 * dùng chung còn trống và "chưa chọn category" khi sản phẩm chỉ có listing mà chưa có spec
 */
export function usePlatformTab(product: ProductDetail, platform: Marketplace, shops: readonly Shop[]) {
  const specQuery = useProductSpec(product.id, platform);
  const spec = specQuery.data?.spec ?? null;
  const shop = shops.find((s) => s.platform === platform && shopUsable(s.status)) ?? null;
  const leaf = usePlatformCategory(platform, spec?.externalCategoryId ?? null, shop?.id);
  const attrs = leaf.data?.attributes ?? null;
  const axes = useMemo(() => productAxes(product.variants), [product.variants]);
  const facts: ProductFacts = { originCountry: product.originCountry ?? null, brand: product.brand ?? null };
  const missing = spec ? (attrs ? specMissing(attrs, spec, axes, facts) : (specQuery.data?.missing ?? [])) : [];
  const noCategory = specQuery.isSuccess && !spec;
  const gaps = sharedGaps(product, leaf.data?.category.sizeChartRule ?? null);
  return { specQuery, spec, shop, leaf, attrs, axes, facts, missing, noCategory, gaps, count: missing.length + gaps.length + (noCategory ? 1 : 0) };
}
