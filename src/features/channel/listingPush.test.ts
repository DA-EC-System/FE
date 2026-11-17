import { describe, expect, it } from 'vitest';
import type { ChannelListing, ListingRow, ListingStatus, PushResult } from '@/types/shop';
import {
  hasPushing,
  LISTING_POLL_MAX_MS,
  LISTING_POLL_MS,
  listingPollDelay,
  listingStatusHint,
  outsideChangeLabel,
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
  outsideChange: null,
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

  it('ẩn vì SKU tạm ngừng thì chỉ bỏ tạm ngừng ở trang sản phẩm', () => {
    for (const hiddenBy of ['platform', null] as const) {
      expect(listingStatusHint(listing('hidden', { hiddenBy }), false)).toContain('Bỏ tạm ngừng ở trang sản phẩm');
    }
    expect(listingStatusHint(listing('hidden', { hiddenBy: 'zero_stock' }), false)).toContain('Bỏ tạm ngừng');
  });

  it('sàn tắt ngoài app thì nhắc kiểm tra Seller Center, chờ CEO', () => {
    const l = listing('hidden', {
      hiddenBy: 'platform',
      outsideChange: { kind: 'disabled', platformPrice: null, detectedAt: '2026-11-17T00:00:00.000Z' },
    });
    expect(listingStatusHint(l, false)).toContain('Seller Center');
    expect(listingStatusHint(l, false)).toContain('CEO');
    expect(outsideChangeLabel(l.outsideChange!)).toBe('Sàn tắt ngoài app (chờ CEO quyết)');
  });

  it('giá trên sàn bị sửa thì nêu giá sàn, kể cả khi listing đang ẩn bằng tồn 0', () => {
    const l = listing('hidden', {
      hiddenBy: 'zero_stock',
      outsideChange: { kind: 'price_changed', platformPrice: 149000, detectedAt: '2026-11-17T00:00:00.000Z' },
    });
    expect(listingStatusHint(l, false)).toContain('nhận giá trên sàn');
    expect(listingStatusHint(l, false)).not.toContain('tồn 0');
    expect(outsideChangeLabel(l.outsideChange!)).toMatch(/^Giá trên sàn bị sửa: 149\.000.*\(chờ CEO quyết\)$/);
  });
});
