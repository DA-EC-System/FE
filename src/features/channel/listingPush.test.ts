import { describe, expect, it } from 'vitest';
import type { ChannelListing, ListingRow, ListingStatus, PushResult } from '@/types/shop';
import {
  hasPushing,
  imageUrlsFor,
  LISTING_POLL_MAX_MS,
  LISTING_POLL_MS,
  listingPollDelay,
  listingStatusHint,
  splitPushResults,
} from './listingPush';

const listing = (status: ListingStatus, over: Partial<ChannelListing> = {}): ChannelListing => ({
  id: 'lst-1',
  externalProductId: 'p-1',
  externalSkuId: 's-1',
  sellerSku: 'SKU-1',
  status,
  rejectReason: null,
  pushError: null,
  pushAttempts: 0,
  hiddenBy: null,
  stockSync: 'synced',
  priceSync: 'synced',
  stockSyncError: null,
  priceSyncError: null,
  qcAlert: null,
  platformStock: null,
  lastPushedAt: null,
  lastPushedPrice: null,
  pendingMapping: null,
  version: 1,
  ...over,
});

const row = (variantId: string, productId: string, l: ChannelListing | null, thumb: string | null = '/img/a.png'): ListingRow => ({
  variantId,
  productId,
  productName: 'Áo',
  sku: variantId,
  attributesLabel: '',
  thumbnailUrl: thumb,
  price: 100000,
  priceSource: 'standard',
  listing: l,
});

describe('theo dõi listing đang đẩy (§18.6.4)', () => {
  const pushing = [row('v1', 'p1', listing('pushing', { externalProductId: null }))];
  const settled = [row('v1', 'p1', listing('live'))];

  it('còn dòng đang đẩy thì đọc lại mỗi 5 giây', () => {
    expect(hasPushing(pushing)).toBe(true);
    expect(listingPollDelay(pushing, 0, 1000)).toBe(LISTING_POLL_MS);
  });

  it('không còn dòng đang đẩy thì dừng', () => {
    expect(hasPushing(settled)).toBe(false);
    expect(listingPollDelay(settled, 0, 1000)).toBe(false);
    expect(listingPollDelay(undefined, 0, 1000)).toBe(false);
  });

  it('quá 30 phút thì dừng dù còn dòng đang đẩy', () => {
    expect(listingPollDelay(pushing, 0, LISTING_POLL_MAX_MS - 1)).toBe(LISTING_POLL_MS);
    expect(listingPollDelay(pushing, 0, LISTING_POLL_MAX_MS)).toBe(false);
  });
});

describe('ảnh gửi kèm lần đầu đẩy (§18.5)', () => {
  it('chỉ gửi cho sản phẩm chưa có SKU nào trên sàn, mỗi sản phẩm một lần, URL đầy đủ', () => {
    const items = [
      row('v1', 'p1', listing('live')),
      row('v2', 'p1', null),
      row('v3', 'p2', null, '/img/b.png'),
      row('v4', 'p2', null, '/img/b2.png'),
      row('v5', 'p3', null, null),
    ];
    const targets = items.slice(1);
    expect(imageUrlsFor(targets, items, 'https://app.example')).toEqual({
      p2: ['https://app.example/img/b.png'],
    });
  });

  it('listing đang đẩy lần đầu (chưa có mã sàn) vẫn tính là chưa lên sàn', () => {
    const items = [row('v1', 'p1', listing('pushing', { externalProductId: null }))];
    expect(imageUrlsFor(items, items, 'https://app.example')).toEqual({ p1: ['https://app.example/img/a.png'] });
  });
});

describe('tách kết quả đẩy', () => {
  it('dòng có code là bị chặn, còn lại đã xếp việc', () => {
    const results: PushResult[] = [
      { variantId: 'v1', listingId: 'l1', status: 'pushing', code: null, message: null },
      { variantId: 'v2', listingId: null, status: null, code: 'price_missing', message: null },
      { variantId: 'v3', listingId: 'l3', status: 'live', code: 'already_listed', message: 'x' },
    ];
    const { queued, blocked } = splitPushResults(results);
    expect(queued).toBe(1);
    expect(blocked.map((r) => r.variantId)).toEqual(['v2', 'v3']);
  });
});

describe('giải thích trạng thái listing', () => {
  it('đang đẩy: nói chờ duyệt chỉ khi sàn có duyệt', () => {
    expect(listingStatusHint(listing('pushing'), true)).toContain('chờ sàn duyệt');
    expect(listingStatusHint(listing('pushing'), false)).toContain('bán được');
  });

  it('đang đẩy mà sàn lỗi tạm thì nói số lần đã thử', () => {
    expect(listingStatusHint(listing('pushing', { pushAttempts: 2 }), false)).toContain('đã thử 2 lần');
  });

  it('ẩn do đẩy tồn 0 thì nói rõ', () => {
    expect(listingStatusHint(listing('hidden', { hiddenBy: 'zero_stock' }), false)).toContain('tồn 0');
  });
});
