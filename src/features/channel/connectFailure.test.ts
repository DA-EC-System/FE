import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import type { ProblemDetails } from '@/api/client';
import { failureFromError, failureScreen } from './connectFailure';
import { capabilitySummary } from './shopSchemas';

const loi = (data: ProblemDetails) =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: data.status ?? 409,
    statusText: 'Conflict',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data,
  });

describe('Màn kết quả khi sàn trả về (§18.4)', () => {
  it('state hết hạn, nhầm tài khoản, công ty khác có màn riêng', () => {
    expect(failureFromError(loi({ status: 400, code: 'oauth_state_invalid' }))).toEqual({ kind: 'state_invalid' });
    expect(failureFromError(loi({ code: 'shop_connected_elsewhere' }))).toEqual({ kind: 'elsewhere' });
    const mismatch = failureFromError(
      loi({ code: 'shop_mismatch', expected: { name: 'Shop A', externalShopId: '1' }, actual: { name: null, externalShopId: '2' } }),
    );
    expect(failureScreen(mismatch).title).toBe('Bạn vừa đăng nhập 2, không phải Shop A');
  });
  it('lỗi khác hiện câu báo của mã lỗi', () => {
    const f = failureFromError(loi({ status: 502, code: 'marketplace_unavailable', detail: 'Sàn không trả lời' }));
    expect(f.kind).toBe('error');
  });
  it('không có state: nhắc bấm kết nối trong Commerio', () => {
    expect(failureScreen({ kind: 'no_state', platform: 'tiktok' }).description).toBe(
      'Hãy bấm Kết nối TikTok Shop trong Commerio, không uỷ quyền từ Partner Center.',
    );
  });
});

describe('capabilitySummary', () => {
  it('chỉ đọc capabilities', () => {
    expect(capabilitySummary({ listingReview: true, hideBy: 'deactivate', splitLevel: 'unit', returnWindow: 'days' })).toEqual([
      'Sàn duyệt listing trước khi bán',
      'Tách đơn tới từng món',
      'Hạn đổi trả theo số ngày bạn đặt',
    ]);
  });
});
