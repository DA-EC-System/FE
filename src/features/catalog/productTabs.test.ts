import { describe, expect, it } from 'vitest';
import type { ProductVariant } from '@/types/catalog';
import type { ChannelListing, PlatformAttribute, ProductListingRow } from '@/types/shop';
import {
  attributeGroups,
  attributeSource,
  sharedTargetId,
  listingsByShop,
  liveOnPlatform,
  productSuggestions,
  variantSuggestion,
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

  it('chia attribute: bắt buộc (kể cả theo điều kiện đang đúng), key, còn lại kể cả trống (chốt v2 câu 4); bỏ sales', () => {
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
    expect(g.other.map((a) => a.code)).toEqual(['o1', 'o2']);
    expect(attributeGroups(attrs, {}).required.map((a) => a.code)).toEqual(['r']);
  });

  it('nguồn ô theo tier: product dùng chung, company từ hồ sơ, category riêng của sàn', () => {
    expect(attributeSource({ tier: 'product', code: 'p' })).toBe('shared');
    expect(attributeSource({ tier: 'company', code: 'c' })).toBe('company');
    expect(attributeSource({ tier: 'category', code: 'a' })).toBe('own');
    expect(attributeSource({ tier: 'category', code: 'a' }, { a: 'match' })).toBe('match');
    expect(attributeSource({ tier: 'category', code: 'a' }, { a: 'user' })).toBe('own');
    expect(attributeSource({ tier: 'company', code: 'a' }, { a: 'match' })).toBe('company');
  });

  it('nhảy tới đúng ô thông số, không có ô thì về card Thông số', () => {
    expect(sharedTargetId('brand', () => false)).toBe('product-field-brand');
    expect(sharedTargetId('spec:f1', (id) => id === 'product-field-spec-f1')).toBe('product-field-spec-f1');
    expect(sharedTargetId('spec:f1', () => false)).toBe('product-field-specs');
  });

  it('nguồn theo resolved: catalog, công ty, mặc định sàn; ghi đè tách theo fieldSources', () => {
    const a = { tier: 'category' as const, code: 'a' };
    expect(attributeSource({ tier: 'product', code: 'p' }, undefined, 'catalog')).toBe('catalog');
    expect(attributeSource(a, undefined, 'company')).toBe('company');
    expect(attributeSource(a, { a: 'match' }, 'default')).toBe('default');
    expect(attributeSource(a, { a: 'user' }, 'override')).toBe('override');
    expect(attributeSource(a, { a: 'push' }, 'override')).toBe('own');
    expect(attributeSource(a, { a: 'match' }, 'override')).toBe('match');
    expect(attributeSource(a, undefined, 'override')).toBe('override');
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

  it('gợi ý giá trị sàn: chỉ trường sàn có giá trị và khác bản đã lưu; brand null (No Brand) không gợi ý', () => {
    const product = { originCountry: null, brand: 'Jastech', description: 'Áo thun' };
    expect(productSuggestions(product, { originCountry: 'vn', brand: null, description: ' Áo thun ' })).toEqual({ originCountry: 'VN' });
    expect(productSuggestions(product, { originCountry: null, brand: 'Khác', description: 'Mô tả sàn' })).toEqual({
      brand: 'Khác',
      description: 'Mô tả sàn',
    });
    expect(productSuggestions({ ...product, originCountry: 'VN' }, { originCountry: 'VN', brand: 'Jastech', description: '' })).toEqual({});
  });

  it('gợi ý cân nặng, kích thước SKU: chỉ ô sàn có số và khác', () => {
    const v = { weightG: 200, lengthMm: null, widthMm: 10, heightMm: 10 };
    expect(variantSuggestion(v, undefined)).toBeNull();
    expect(variantSuggestion(v, { variantId: 'v', weightG: 200, lengthMm: 300, widthMm: null, heightMm: 10 })).toEqual({ lengthMm: 300 });
    expect(variantSuggestion(v, { variantId: 'v', weightG: 200, lengthMm: null, widthMm: 10, heightMm: 10 })).toBeNull();
  });
});

describe('liveOnPlatform', () => {
  const r = (platform: string, listing: Partial<ChannelListing> | null) =>
    ({ platform, listing: listing && { externalProductId: 'R_1', ...listing } }) as unknown as ProductListingRow;

  it('đang bán hay tạm ẩn, có mã trên sàn thì tính là đang có trên sàn', () => {
    expect(liveOnPlatform([r('lazada', { status: 'live' })], 'lazada')).toBe(true);
    expect(liveOnPlatform([r('lazada', { status: 'hidden' })], 'lazada')).toBe(true);
  });

  it('chỉ đẩy lỗi, bị từ chối, đang đẩy, đã gỡ hay chưa có mã sàn thì không tính', () => {
    const rows = [
      r('lazada', { status: 'push_failed', externalProductId: 'R_6049911' }),
      r('lazada', { status: 'rejected', externalProductId: 'R_6049911' }),
      r('lazada', { status: 'pushing', externalProductId: null }),
      r('lazada', { status: 'delisted' }),
      r('lazada', { status: 'live', externalProductId: null }),
      r('lazada', null),
    ];
    expect(liveOnPlatform(rows, 'lazada')).toBe(false);
  });

  it('chỉ xét listing của đúng sàn', () => {
    expect(liveOnPlatform([r('shopee', { status: 'live' })], 'lazada')).toBe(false);
  });
});
