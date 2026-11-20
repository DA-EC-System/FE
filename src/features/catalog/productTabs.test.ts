import { describe, expect, it } from 'vitest';
import type { ProductVariant } from '@/types/catalog';
import type { ChannelListing, PlatformAttribute, ProductListingRow } from '@/types/shop';
import {
  attributeGroups,
  attributeSource,
  listingsByShop,
  sharedGaps,
  tabFromParam,
  visiblePlatforms,
} from './productTabs';

const attr = (over: Partial<PlatformAttribute>): PlatformAttribute => ({
  code: 'a',
  label: 'A',
  kind: 'property',
  input: 'text',
  options: [],
  allowCustom: true,
  required: false,
  requiredWhen: null,
  isKey: false,
  tier: 'category',
  defaultValue: null,
  ...over,
});

const row = (over: Partial<ProductListingRow>): ProductListingRow =>
  ({ variantId: 'v1', shopId: 's1', shopName: 'Shop A', platform: 'tiktok', listing: null, ...over }) as ProductListingRow;
const listing = { id: 'l1', status: 'live' } as ChannelListing;

const variant = (over: Partial<ProductVariant>): ProductVariant =>
  ({ id: 'v', businessStatus: 'selling', weightG: 200, lengthMm: 10, widthMm: 10, heightMm: 10, ...over }) as ProductVariant;

describe('Trang sản phẩm theo tab (FE#417)', () => {
  it('chỉ hiện tab sàn đã có spec hoặc có listing, giữ thứ tự sàn', () => {
    const rows = [row({ platform: 'lazada', listing }), row({ platform: 'tiktok' })];
    expect(visiblePlatforms(['tiktok', 'lazada'], () => false, rows)).toEqual(['lazada']);
    expect(visiblePlatforms(['tiktok', 'lazada'], (p) => p === 'tiktok', rows)).toEqual(['tiktok', 'lazada']);
    expect(visiblePlatforms(['tiktok'], () => false, [])).toEqual([]);
  });

  it('?tab= lạ hoặc sàn không có tab thì về tab Commerio', () => {
    expect(tabFromParam('lazada', ['lazada'])).toBe('lazada');
    expect(tabFromParam('tiktok', ['lazada'])).toBe('commerio');
    expect(tabFromParam(null, ['lazada'])).toBe('commerio');
  });

  it('chia attribute: bắt buộc (kể cả theo điều kiện đang đúng), key, còn lại đã có giá trị; bỏ sales', () => {
    const attrs = [
      attr({ code: 'r', required: true }),
      attr({ code: 'w', requiredWhen: [{ code: 'r', optionIds: ['x'] }] }),
      attr({ code: 'k', isKey: true }),
      attr({ code: 'o1' }),
      attr({ code: 'o2' }),
      attr({ code: 's', kind: 'sales', required: true }),
      attr({ code: 'p', tier: 'product' }),
    ];
    const g = attributeGroups(attrs, { r: 'x', o1: 'có' });
    expect(g.required.map((a) => a.code)).toEqual(['r', 'w']);
    expect(g.key.map((a) => a.code)).toEqual(['k']);
    expect(g.other.map((a) => a.code)).toEqual(['o1']);
    expect(attributeGroups(attrs, {}).required.map((a) => a.code)).toEqual(['r']);
  });

  it('nguồn ô theo tier: product dùng chung, company từ hồ sơ, category riêng của sàn', () => {
    expect(attributeSource({ tier: 'product' })).toBe('shared');
    expect(attributeSource({ tier: 'company' })).toBe('company');
    expect(attributeSource({ tier: 'category' })).toBe('own');
  });

  it('trường dùng chung còn thiếu: ảnh, mô tả, bảng size khi bắt buộc, cân nặng kích thước của SKU chưa lưu trữ', () => {
    const empty = { images: [], description: ' ', sizeChart: null, variants: [variant({ weightG: null })] };
    expect(sharedGaps(empty, 'required').map((g) => g.target)).toEqual(['images', 'description', 'sizeChart', 'variants']);
    expect(sharedGaps(empty, 'optional').map((g) => g.target)).not.toContain('sizeChart');
    const archivedOnly = { ...empty, variants: [variant({ weightG: null, businessStatus: 'archived' })] };
    expect(sharedGaps(archivedOnly, null).map((g) => g.target)).not.toContain('variants');
  });

  it('gom listing của một sàn theo gian hàng, gồm dòng chưa lên sàn', () => {
    const rows = [
      row({ shopId: 's1', variantId: 'v1', listing }),
      row({ shopId: 's2', shopName: 'Shop B', variantId: 'v1' }),
      row({ shopId: 's1', variantId: 'v2' }),
      row({ shopId: 's3', platform: 'lazada', listing }),
    ];
    const shops = listingsByShop(rows, 'tiktok');
    expect(shops.map((s) => [s.shopId, s.rows.length])).toEqual([
      ['s1', 2],
      ['s2', 1],
    ]);
  });
});
