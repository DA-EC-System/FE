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
  isWeightError,
  pushErrorText,
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
  it('gian hàng TikTok chưa đủ điều kiện: câu tiếng Việt, câu của sàn tách riêng', () => {
    const t = pushErrorText({ code: 'shop_not_eligible', message: 'Shop onboarding incomplete', at });
    expect(t.text).toContain('Gian hàng chưa đủ điều kiện');
    expect(t.text).toContain('Seller Center');
    expect(t.platformMessage).toBe('Shop onboarding incomplete');
  });

  it('sai luật đăng mà không có câu dịch: câu chung, câu của sàn tách riêng', () => {
    const t = pushErrorText({ code: 'listing_check_failed', message: '12099999: something else', at });
    expect(t.text).toBe(
      'Sàn từ chối sản phẩm. Sửa sản phẩm hoặc thông tin sàn của sản phẩm (category, attribute) rồi đẩy lại.',
    );
    expect(t.platformMessage).toBe('12099999: something else');
  });

  it('mã khác, câu không khớp bảng dịch: giữ nguyên câu BE trả', () => {
    expect(pushErrorText({ code: 'marketplace_rejected', message: 'Sàn từ chối sản phẩm', at })).toEqual({ text: 'Sàn từ chối sản phẩm' });
  });
});

describe('lỗi cân nặng kiện hàng (FE#326)', () => {
  it('câu tiếng Việt nêu khoảng sàn cho phép, câu gốc ở Chi tiết từ sàn', () => {
    const message = 'BIZ_CHECK_PACKAGE_WEIGHT_BY_KG_INVALID:Khối lượng kiện hàng nên nằm trong khoảng 0.001 và 300.0';
    const t = pushErrorText({ code: 'marketplace_rejected', message, at: '2026-11-18T00:00:00.000Z' });
    expect(t.text).toBe('Cân nặng kiện hàng phải từ 0,001 đến 300 kg theo sàn. Sửa cân nặng ở Thông tin SKU rồi bấm Đẩy lại.');
    expect(t.platformMessage).toBe(message);
    expect(isWeightError({ message })).toBe(true);
    expect(isWeightError({ message: 'other' })).toBe(false);
  });
});

describe('bảng dịch lỗi đẩy hay gặp (FE#250, TT-U03)', () => {
  const at = '2026-11-17T00:00:00.000Z';
  const TITLE = 'Tên sản phẩm phải dài 25–255 ký tự trên TikTok. Sửa tên ở trang sản phẩm rồi bấm Đẩy lại.';
  const SIZE = 'Danh mục TikTok này bắt buộc ảnh bảng kích cỡ. Thêm ảnh bảng kích cỡ ở trang sản phẩm rồi đẩy lại.';

  it.each([
    ['listing_check_failed', '12052051: The product name must be between 25 and 255 characters, inclusive.', TITLE],
    ['marketplace_rejected', 'Value Out Of Range. The parameter `product title` must be within 25 to 255', TITLE],
    ['marketplace_rejected', 'Missing Parameter. `size_chart_image` is required. Please provide it and retry.', SIZE],
    [
      'listing_check_failed',
      '12052104: attribute Material is required',
      'Category của sàn bắt buộc một attribute còn thiếu. Bổ sung ở Thông tin sàn của sản phẩm rồi đẩy lại.',
    ],
    [
      'marketplace_rejected',
      'E0501: Category attribute "brand" is mandatory',
      'Category Lazada bắt buộc attribute "brand". Bổ sung ở Thông tin sàn của sản phẩm rồi đẩy lại.',
    ],
  ])('%s: %s', (code, message, text) => {
    expect(pushErrorText({ code, message, at })).toEqual({ text, platformMessage: message });
  });

  it('nhiều lỗi nối bằng "; ": dịch từng phần, phần không dịch được thì thêm câu chung', () => {
    const message = '12052051: product name must be between 25 and 255 characters; 12099999: other';
    expect(pushErrorText({ code: 'listing_check_failed', message, at })).toEqual({
      text: `${TITLE} Sàn từ chối sản phẩm. Sửa sản phẩm hoặc thông tin sàn của sản phẩm (category, attribute) rồi đẩy lại.`,
      platformMessage: message,
    });
  });

  it('câu độ dài tên không phải 25–255 của TikTok thì không dịch', () => {
    expect(pushErrorText({ code: 'marketplace_rejected', message: 'product name must be within 255 characters', at })).toEqual({
      text: 'product name must be within 255 characters',
    });
  });

  it('mã chặn của app không dịch theo câu', () => {
    expect(pushErrorText({ code: 'images_missing', message: 'size_chart_image is required', at })).toEqual({
      text: 'size_chart_image is required',
    });
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
