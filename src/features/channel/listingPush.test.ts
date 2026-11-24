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
  pushBlockMessage,
  pushErrorTarget,
  pushErrorText,
  pushResultBlocks,
  SPEC_FIX_CODES,
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
  shopPrice: null,
  pendingPrice: null,
  configVersionId: null,
  netReceived: null,
  belowFloor: null,
  feeWarning: null,
  stockToPush: null,
  stockHeldReason: null,
  lastSyncFailedAt: null,
  listing: l,
  specStatus: 'complete',
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
    expect(outsideChangeLabel(l.outsideChange!)).toBe('Bị tắt trên Seller Center · chờ CEO');
  });

  it('giá trên sàn bị sửa thì nêu giá sàn, kể cả khi listing đang ẩn bằng tồn 0', () => {
    const l = listing('hidden', {
      hiddenBy: 'zero_stock',
      outsideChange: { kind: 'price_changed', platformPrice: 149000, detectedAt: '2026-11-17T00:00:00.000Z' },
    });
    expect(listingStatusHint(l, false)).toContain('dùng giá trên sàn');
    expect(listingStatusHint(l, false)).not.toContain('tồn 0');
    expect(outsideChangeLabel(l.outsideChange!)).toMatch(/^Giá bị sửa trên Seller Center: 149\.000.* · chờ CEO$/);
  });
});

describe('pushErrorText: câu BE dựng, mã sàn trong Chi tiết từ sàn (FE#462, commerio-backend#567)', () => {
  const at = '2026-11-24T00:00:00.000Z';
  const translated = {
    code: 'attribute_value_invalid',
    kind: 'data' as const,
    message: 'Cân nặng phải là số',
    target: { kind: 'variant_field' as const, field: 'weight' as const },
    variantId: 'v-1',
    platformCode: 'BIZ_CHECK_MEASURE_PROP_TEXT_INVALID',
    platformMessage: 'weight không phải là số hợp lệ!',
    requestId: 'req-9',
    at,
  };

  it('lỗi sau #567: hiện `message`, mã và câu gốc của sàn cùng mã yêu cầu ở Chi tiết', () => {
    expect(pushErrorText(translated)).toEqual({
      text: 'Cân nặng phải là số',
      platformMessage: 'BIZ_CHECK_MEASURE_PROP_TEXT_INVALID: weight không phải là số hợp lệ! · Mã yêu cầu: req-9',
    });
  });

  it('lỗi do app giữ (không có mã sàn): không có Chi tiết', () => {
    const e = { ...translated, platformCode: null, platformMessage: null, requestId: null, target: null, kind: 'connection' as const };
    expect(pushErrorText(e)).toEqual({ text: 'Cân nặng phải là số' });
  });

  it('lỗi ghi trước #567 mà `message` là câu sàn: câu chung của mã, câu sàn vào Chi tiết', () => {
    const t = pushErrorText({ code: 'shop_not_eligible', message: 'Shop onboarding incomplete', at });
    expect(t.text).toContain('Gian hàng chưa đủ điều kiện');
    expect(t.platformMessage).toBe('Shop onboarding incomplete');
    const w = 'BIZ_CHECK_PACKAGE_WEIGHT_BY_KG_INVALID:Khối lượng kiện hàng nên nằm trong khoảng 0.001 và 300.0';
    expect(pushErrorText({ code: 'images_missing', message: w, at }).platformMessage).toBe(w);
  });

  it('lỗi ghi trước #567 của mã chặn app: giữ `message`', () => {
    expect(pushErrorText({ code: 'images_missing', message: 'Sản phẩm chưa có ảnh', at })).toEqual({ text: 'Sản phẩm chưa có ảnh' });
  });
});

describe('pushErrorTarget: chỗ sửa của lỗi', () => {
  const at = '2026-11-24T00:00:00.000Z';
  it('đọc `target` của BE', () => {
    expect(
      pushErrorTarget({ code: 'x', message: 'm', kind: 'data', target: { kind: 'category' }, platformCode: 'E1', at }),
    ).toEqual({ kind: 'category' });
    expect(pushErrorTarget({ code: 'x', message: 'm', kind: 'platform', target: null, at })).toBeNull();
  });
  it('bản ghi cũ: suy từ mã và câu cân nặng của Lazada', () => {
    const w = 'BIZ_CHECK_PACKAGE_WEIGHT_BY_KG_INVALID: ...';
    expect(pushErrorTarget({ code: 'marketplace_rejected', message: w, at })).toEqual({ kind: 'variant_field', field: 'weight' });
    expect(pushErrorTarget({ code: 'size_chart_missing', message: '', at })).toEqual({ kind: 'product_field', field: 'sizeChart' });
    expect(pushErrorTarget({ code: 'spec_incomplete', message: '', at })).toBeNull();
    expect(pushErrorTarget(null)).toBeNull();
  });
});

describe('pushResultBlocks: lý do chặn của lượt vừa bấm (commerio-backend#566)', () => {
  const base: PushResult = { variantId: 'v-1', listingId: null, status: null, code: 'category_unmapped', message: null };
  it('có `blockers` thì dùng câu và chỗ sửa của BE', () => {
    const r: PushResult = {
      ...base,
      blockers: [
        { code: 'category_unmapped', label: 'Chưa chọn category Lazada', scope: 'platform', target: { kind: 'category' }, variantIds: [] },
        { code: 'price_missing', label: 'Chưa có giá', scope: 'common', target: { kind: 'variant_field', field: 'price' }, variantIds: ['v-1'] },
      ],
    };
    expect(pushResultBlocks(r, 'Lazada')).toEqual([
      { code: 'category_unmapped', label: 'Chưa chọn category Lazada', target: { kind: 'category' } },
      { code: 'price_missing', label: 'Chưa có giá', target: { kind: 'variant_field', field: 'price' } },
    ]);
  });
  it('không có `blockers` thì dựng câu từ `code`; đã xếp việc thì rỗng', () => {
    expect(pushResultBlocks(base, 'Lazada')).toEqual([
      { code: 'category_unmapped', label: 'Chưa chọn category Lazada cho sản phẩm', target: null },
    ]);
    expect(pushResultBlocks({ ...base, code: null, status: 'pushing' }, 'Lazada')).toEqual([]);
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
    expect(pendingRevisionLabel({ status: 'auditing', rejectReason: null, at })).toBe('Chỉnh sửa chờ duyệt');
    expect(pendingRevisionLabel({ status: 'failed', rejectReason: 'x', at })).toBe('Chỉnh sửa bị từ chối');
    expect(pendingRevisionHint({ status: 'auditing', rejectReason: null, at })).toContain('vẫn bán bản cũ');
    expect(pendingRevisionHint({ status: 'failed', rejectReason: 'x', at })).toContain('bấm Cập nhật thông tin lên sàn để gửi lại');
  });
});

describe('Mã chặn đẩy theo thông tin sàn (commerio-backend#400, Documents/21 §18.5)', () => {
  it('câu theo tên sàn đúng bảng FE báo của hợp đồng', () => {
    expect(pushBlockMessage('category_unmapped', null, 'Lazada')).toBe('Chưa chọn category Lazada cho sản phẩm');
    expect(pushBlockMessage('spec_incomplete', 'Chất liệu, Kiểu cổ', 'Lazada')).toBe(
      'Thông tin Lazada của sản phẩm còn thiếu: Chất liệu, Kiểu cổ',
    );
    expect(pushBlockMessage('spec_incomplete', null, 'TikTok')).toBe('Thông tin TikTok của sản phẩm còn thiếu');
    expect(pushBlockMessage('category_not_permitted', null, 'TikTok')).toBe(
      'Gian hàng chưa được bán category này. Xin quyền trên Seller Center hoặc đổi category',
    );
  });

  it('mã khác: message BE trả, không có thì câu theo mã', () => {
    expect(pushBlockMessage('price_missing', null, 'Lazada')).toContain('Chưa có giá');
    expect(pushBlockMessage('marketplace_rejected', 'Sàn báo X', 'Lazada')).toBe('Sàn báo X');
  });

  it('mã mở được trang Thông tin sàn', () => {
    expect([...SPEC_FIX_CODES].sort()).toEqual(['category_not_permitted', 'category_unmapped', 'listing_check_failed', 'spec_incomplete']);
  });
});

describe('pushBlockMessage: below_floor khi đăng với giá đặt tay (§18.9 R1)', () => {
  it('nói rõ giá niêm yết dưới giá thấp nhất, không dùng câu của listing đang bán', () => {
    expect(pushBlockMessage('below_floor', null, 'Sàn A')).toMatch(/dưới giá thấp nhất, chưa đăng/);
  });
});
