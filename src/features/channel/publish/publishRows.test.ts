import { describe, expect, it } from 'vitest';
import type { ChannelListing, PriceQuoteRow, ProductListingRow } from '@/types/shop';
import { feePct, initialSelection, isOnPlatform, priceRange, priceView, rowBlocker, selectedPlatforms, shopSummary, stockToPushText } from './publishRows';

const row = (over: Partial<ProductListingRow> = {}): ProductListingRow =>
  ({
    variantId: 'v1',
    productId: 'p1',
    productName: 'Áo thun',
    sku: 'AO-1',
    attributesLabel: 'Đen / M',
    thumbnailUrl: null,
    price: 189_000,
    priceSource: 'shop',
    shopPrice: 189_000,
    pendingPrice: null,
    configVersionId: null,
    netReceived: 152_300,
    belowFloor: false,
    feeWarning: null,
    listing: null,
    specStatus: 'complete',
    shopId: 's1',
    shopName: 'Shop 1',
    platform: 'a',
    ...over,
  }) as ProductListingRow;

const listing = (status: ChannelListing['status']) => ({ status }) as ChannelListing;

describe('isOnPlatform, shopSummary', () => {
  it('dòng đang đẩy, đang bán, chờ duyệt là đã ở trên sàn; lỗi đẩy, đã gỡ thì chưa', () => {
    expect(isOnPlatform(row({ listing: listing('live') }))).toBe(true);
    expect(isOnPlatform(row({ listing: listing('pushing') }))).toBe(true);
    expect(isOnPlatform(row({ listing: listing('push_failed') }))).toBe(false);
    expect(isOnPlatform(row({ listing: listing('delisted') }))).toBe(false);
    expect(isOnPlatform(row())).toBe(false);
  });
  it('đếm SKU đã lên sàn theo gian hàng', () => {
    const rows = [row({ listing: listing('live') }), row({ variantId: 'v2' }), row({ shopId: 's2' })];
    expect(shopSummary(rows, 's1')).toEqual({ total: 2, onPlatform: 1, specStatus: 'complete' });
    expect(shopSummary(rows, 's3')).toEqual({ total: 0, onPlatform: 0, specStatus: null });
  });
});

describe('initialSelection', () => {
  const usable = [
    { id: 's1', platform: 'a' },
    { id: 's2', platform: 'b' },
  ];
  it('?shops= thắng; id không dùng được thì bỏ', () => {
    expect([...initialSelection(usable, [], { shops: 's2,x', platform: 'a' })]).toEqual(['s2']);
  });
  it('?platform= chọn mọi gian hàng của sàn đó', () => {
    expect([...initialSelection(usable, [], { shops: null, platform: 'b' })]).toEqual(['s2']);
  });
  it('mặc định chọn gian hàng còn SKU chưa lên sàn', () => {
    const rows = [row({ listing: listing('live') }), row({ shopId: 's2' })];
    expect([...initialSelection(usable, rows, { shops: null, platform: null })]).toEqual(['s2']);
  });
  it('sàn của các gian hàng đã chọn, không lặp', () => {
    expect(selectedPlatforms([...usable, { id: 's3', platform: 'a' }], new Set(['s1', 's3']))).toEqual(['a']);
  });
});

describe('priceView, feePct, rowBlocker', () => {
  it('chưa gõ giá thì dùng số BE tính sẵn ở ListingRow', () => {
    const v = priceView(row(), undefined);
    expect(v).toMatchObject({ listPrice: 189_000, netReceived: 152_300, blockedCode: null });
    expect(feePct(v)).toBeCloseTo(0.1942, 3);
    expect(rowBlocker(v, true)).toBeNull();
  });
  it('gian hàng chưa có cấu hình phí (ba số null, §18.6.7) thì chặn kèm lý do', () => {
    const v = priceView(row({ netReceived: null, belowFloor: null }), undefined);
    expect(rowBlocker(v, true)).toBe('Gian hàng chưa có cấu hình phí');
    expect(feePct(v)).toBeNull();
  });
  it('kết quả tính thử thắng số cũ; dưới giá thấp nhất thì chặn', () => {
    const quote: PriceQuoteRow = {
      shopId: 's1',
      variantId: 'v1',
      listPrice: 150_000,
      netReceived: 120_000,
      belowFloor: true,
      feeWarning: null,
      feeConfigId: 'f1',
      blocked: null,
      marginPct: 0.05,
    };
    const v = priceView(row(), quote);
    expect(v).toMatchObject({ listPrice: 150_000, marginPct: 0.05 });
    expect(rowBlocker(v, true)).toBe('Dưới giá thấp nhất');
  });
  it('mã chặn của tính thử dịch ra câu', () => {
    const v = priceView(row(), {
      shopId: 's1',
      variantId: 'v1',
      listPrice: null,
      netReceived: null,
      belowFloor: null,
      feeWarning: null,
      feeConfigId: null,
      blocked: { code: 'fee_not_configured' },
    });
    expect(rowBlocker(v, true)).toBe('Gian hàng chưa có cấu hình phí');
  });
  it('sàn còn thiếu thông tin thì chặn trước mọi lý do giá', () => {
    expect(rowBlocker(priceView(row(), undefined), false)).toBe('Còn thiếu thông tin của sàn');
  });
});

describe('priceRange', () => {
  it('bỏ giá null; không có giá nào thì null', () => {
    expect(priceRange([200, null, 100])).toEqual({ min: 100, max: 200 });
    expect(priceRange([null])).toBeNull();
  });
});

describe('stockToPushText (§18.9 R3)', () => {
  it('có số thì hiện số; giữ tồn thì ghi lý do; không đọc được số thì gạch', () => {
    expect(stockToPushText({ stockToPush: 1200, stockHeldReason: null })).toBe('1.200');
    expect(stockToPushText({ stockToPush: null, stockHeldReason: 'shop_waiting_opening' })).toBe('Chờ kiểm kê lần đầu');
    expect(stockToPushText({ stockToPush: null, stockHeldReason: 'not_counted' })).toBe('Chưa có số tồn');
    expect(stockToPushText({ stockToPush: null, stockHeldReason: null })).toBe('—');
    expect(stockToPushText({ stockToPush: 0, stockHeldReason: null })).toBe('0');
  });
});
