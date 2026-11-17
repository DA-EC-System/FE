import { describe, expect, it } from 'vitest';
import type { ChannelListing, ListingRow, ListingStatus, PushResult } from '@/types/shop';
import {
  canUpdateContent,
  hasPushing,
  LISTING_POLL_MAX_MS,
  LISTING_POLL_MS,
  listingPollDelay,
  listingStatusHint,
  outsideChangeLabel,
  pendingRevisionHint,
  pendingRevisionLabel,
  pushErrorText,
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
  pendingRevision: null,
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

describe('pushErrorText (FE#266, commerio-backend#305)', () => {
  const at = '2026-11-17T00:00:00.000Z';
  it('gian hàng TikTok chưa đủ điều kiện: câu tiếng Việt kèm câu của sàn', () => {
    const t = pushErrorText({ code: 'shop_not_eligible', message: 'Shop onboarding incomplete', at });
    expect(t).toContain('Gian hàng chưa đủ điều kiện');
    expect(t).toContain('Seller Center');
    expect(t).toMatch(/Sàn báo: Shop onboarding incomplete$/);
  });

  it('sai luật đăng: câu tiếng Việt kèm mã và câu của sàn', () => {
    const t = pushErrorText({ code: 'listing_check_failed', message: '12052051: product name must be between 25 and 255 characters', at });
    expect(t).toContain('chưa đạt luật đăng bán');
    expect(t).toContain('Sàn báo: 12052051');
  });

  it('mã khác giữ nguyên câu BE trả', () => {
    expect(pushErrorText({ code: 'marketplace_rejected', message: 'Sàn từ chối sản phẩm', at })).toBe('Sàn từ chối sản phẩm');
  });
});

describe('Sửa nội dung listing đang bán (FE#275, §18.3)', () => {
  it('chỉ listing live của gian hàng TikTok', () => {
    expect(canUpdateContent('tiktok', listing('live'))).toBe(true);
    expect(canUpdateContent('lazada', listing('live'))).toBe(false);
    expect(canUpdateContent('tiktok', listing('hidden'))).toBe(false);
    expect(canUpdateContent('tiktok', listing('under_review'))).toBe(false);
    expect(canUpdateContent('tiktok', null)).toBe(false);
    expect(canUpdateContent(undefined, listing('live'))).toBe(false);
  });

  it('bản sửa đang duyệt hay bị từ chối vẫn gửi lại được', () => {
    const at = '2026-11-16T09:30:00.000Z';
    expect(canUpdateContent('tiktok', listing('live', { pendingRevision: { status: 'auditing', rejectReason: null, at } }))).toBe(true);
    expect(canUpdateContent('tiktok', listing('live', { pendingRevision: { status: 'failed', rejectReason: 'x', at } }))).toBe(true);
  });

  it('nhãn và giải thích theo trạng thái bản sửa', () => {
    const at = '2026-11-16T09:30:00.000Z';
    expect(pendingRevisionLabel({ status: 'auditing', rejectReason: null, at })).toBe('Bản sửa đang duyệt');
    expect(pendingRevisionLabel({ status: 'failed', rejectReason: 'x', at })).toBe('Bản sửa bị từ chối');
    expect(pendingRevisionHint({ status: 'auditing', rejectReason: null, at })).toContain('vẫn bán bản cũ');
    expect(pendingRevisionHint({ status: 'failed', rejectReason: 'x', at })).toContain('bấm Sửa nội dung để gửi lại');
  });
});
