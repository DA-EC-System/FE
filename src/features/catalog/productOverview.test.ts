import { describe, expect, it } from 'vitest';
import type { ChannelListing, ListingStatus, ProductListingRow } from '@/types/shop';
import {
  activePlatforms,
  businessSummary,
  listingsByVariant,
  platformDrift,
  sellingShopCount,
  totalAvailable,
} from './productOverview';

const listing = (status: ListingStatus, over: Partial<ChannelListing> = {}) =>
  ({ id: `l-${Math.random()}`, status, externalProductId: 'p1', contentSource: 'app', ...over }) as ChannelListing;

const row = (over: Partial<ProductListingRow>): ProductListingRow =>
  ({
    variantId: 'v1',
    productId: 'p',
    shopId: 's1',
    shopName: 'Shop A',
    platform: 'tiktok',
    listing: null,
    externalCategoryId: null,
    externalCategoryPath: null,
    ...over,
  }) as ProductListingRow;

describe('Trang sản phẩm: gom số liệu (US-SP-11, commerio-backend#467)', () => {
  it('đếm SKU theo trạng thái kinh doanh, bỏ trạng thái không có SKU', () => {
    const v = (businessStatus: 'selling' | 'paused' | 'discontinued' | 'archived') => ({ businessStatus });
    expect(businessSummary([v('selling'), v('paused'), v('selling'), v('selling')])).toBe('3 đang kinh doanh · 1 đang tạm ngừng bán');
    expect(businessSummary([])).toBe('');
  });

  it('tổng có thể bán cộng available từng SKU', () => {
    expect(totalAvailable([{ available: 3 }, { available: 0 }, { available: 12 }])).toBe(15);
  });

  it('gian hàng đang bán chỉ đếm gian hàng có listing live, mỗi gian hàng một lần', () => {
    expect(
      sellingShopCount([
        row({ shopId: 's1', listing: listing('live') }),
        row({ shopId: 's1', variantId: 'v2', listing: listing('live') }),
        row({ shopId: 's2', listing: listing('hidden') }),
        row({ shopId: 's3' }),
      ]),
    ).toBe(1);
  });

  it('listing theo biến thể bỏ dòng chưa lên sàn, giữ thứ tự gian hàng', () => {
    const a = row({ shopId: 's1', listing: listing('live') });
    const b = row({ shopId: 's2', listing: listing('rejected') });
    const map = listingsByVariant([a, row({ shopId: 's3' }), b, row({ variantId: 'v2' })]);
    expect(map.get('v1')).toEqual([a, b]);
    expect(map.has('v2')).toBe(false);
  });

  it('sàn hoạt động bỏ gian hàng đã ngắt, không lặp sàn', () => {
    expect(
      activePlatforms([
        { platform: 'lazada', status: 'active' },
        { platform: 'tiktok', status: 'disconnected' },
        { platform: 'lazada', status: 'needs_reauth' },
      ]),
    ).toEqual(['lazada']);
  });

  it('lệch category chỉ xét dòng của sàn đó và listing live/hidden khác category spec', () => {
    const rows = [
      row({ listing: listing('live'), externalCategoryId: '200', externalCategoryPath: 'Thời trang > Áo' }),
      row({ shopId: 's2', platform: 'lazada', listing: listing('live'), externalCategoryId: '999' }),
      row({ shopId: 's3', listing: listing('live', { externalProductId: 'p3' }), externalCategoryId: '100' }),
    ];
    const drift = platformDrift(rows, 'tiktok', { externalCategoryId: '100', categoryPath: 'Thời trang > Áo thun' });
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatchObject({ shopId: 's1', fromId: '200', fromPath: 'Thời trang > Áo' });
  });
});
