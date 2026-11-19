import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import type { ProblemDetails } from '@/api/client';
import { elsewhereSteps, failureFromError, failureScreen } from './connectFailure';
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
  it('dán nhầm token của seller khác khi kết nối lại: cùng màn so sánh, hướng dẫn dán lại token (commerio-backend#398)', () => {
    const mismatch = failureFromError(
      loi({ code: 'shop_mismatch', expected: { name: 'Shop A', externalShopId: '1' }, actual: { name: null, externalShopId: '2' } }),
      'token',
    );
    expect(mismatch).toMatchObject({ kind: 'mismatch', via: 'token' });
    const screen = failureScreen(mismatch);
    expect(screen.title).toBe('Token vừa dán là của 2, không phải Shop A');
    expect(screen.description).toContain('lấy token của đúng gian hàng');
    expect(screen.description).not.toContain('Đăng xuất');
    expect(failureFromError(loi({ code: 'shop_connected_elsewhere' }), 'token')).toEqual({ kind: 'elsewhere', via: 'token' });
  });
  it('company_mismatch giữ tên hai công ty (§18.7.4)', () => {
    const f = failureFromError(
      loi({
        status: 409,
        code: 'company_mismatch',
        expected: { id: 'cmp-001', name: 'ABC' },
        actual: { id: 'cmp-002', name: 'XYZ' },
      }),
    );
    expect(f).toEqual({ kind: 'company_mismatch', expected: { id: 'cmp-001', name: 'ABC' }, actual: { id: 'cmp-002', name: 'XYZ' } });
    expect(failureScreen(f).title).toBe('Bạn đang mở XYZ, không phải ABC');
    expect(failureFromError(loi({ status: 409, code: 'company_mismatch' }))).toEqual({ kind: 'company_mismatch' });
  });
  it('lỗi khác hiện câu báo của mã lỗi', () => {
    const f = failureFromError(loi({ status: 502, code: 'marketplace_unavailable', detail: 'Sàn không trả lời' }));
    expect(f.kind).toBe('error');
  });
  it('sàn từ chối mã uỷ quyền: câu kết nối, câu gốc của sàn tách riêng (FE#250)', () => {
    const connect = 'Sàn không nhận lần uỷ quyền này. Liên kết uỷ quyền chỉ dùng được một lần trong vài phút; bấm Kết nối lại từ đầu.';
    expect(failureFromError(loi({ code: 'marketplace_rejected', platformMessage: 'invalid auth code' }))).toEqual({
      kind: 'error',
      message: connect,
      platformMessage: 'invalid auth code',
    });
    expect(failureFromError(loi({ code: 'marketplace_unauthorized', platformCode: 'InvalidCode' }))).toEqual({
      kind: 'error',
      message: connect,
    });
  });
  it('gian hàng ở công ty khác: bước 2 theo cách nối (FE#250)', () => {
    expect(elsewhereSteps()[1]).toBe('Nếu bạn đăng nhập nhầm: đăng xuất trên sàn, đăng nhập đúng tài khoản rồi thêm lại.');
    expect(elsewhereSteps('token')[1]).toBe('Nếu bạn dán nhầm: lấy token của đúng gian hàng rồi dán lại.');
  });
  it('từ chối uỷ quyền: tên sàn lấy từ danh sách sàn, vắng thì dùng nhãn dự phòng', () => {
    expect(failureScreen({ kind: 'declined', platform: 'tiktok' }).title).toBe('Bạn đã từ chối uỷ quyền trên TikTok Shop');
    expect(failureScreen({ kind: 'declined', platform: 'tiktok' }, 'TikTok Shop VN').title).toBe(
      'Bạn đã từ chối uỷ quyền trên TikTok Shop VN',
    );
    expect(failureScreen({ kind: 'declined', platform: 'san-moi' }).title).toBe('Bạn đã từ chối uỷ quyền trên san-moi');
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
      'Sàn duyệt sản phẩm trước khi bán',
      'Tách đơn tới từng món',
      'Hạn trả hàng theo số ngày bạn đặt',
    ]);
  });
});
