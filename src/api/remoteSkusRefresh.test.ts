// Tải lại SKU sàn (FE#265, BE#361; Documents/21 §18.3): câu báo sàn trả thiếu danh sách, hết thời gian chờ
import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { isTimeout, type ProblemDetails } from './client';
import { problemMessage, remoteRefreshErrorMessage } from './problemMessages';

const loi = (data: ProblemDetails, headers: Record<string, string> = {}) =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: data.status ?? 409,
    statusText: 'Conflict',
    headers,
    config: { headers: new AxiosHeaders() },
    data,
  });

describe('409 marketplace_rejected khi sàn trả thiếu danh sách SKU', () => {
  it.each(['incomplete_list', 'too_many_calls'])('%s: không có Retry-After thì báo 10 phút (khoá đọc trọn)', (platformCode) => {
    expect(problemMessage(loi({ status: 409, code: 'marketplace_rejected', platformCode }))).toBe(
      'Sàn trả thiếu danh sách SKU, thử lại sau 10 phút.',
    );
  });

  it('có Retry-After thì đổi ra phút, làm tròn lên', () => {
    const e = loi({ status: 409, code: 'marketplace_rejected', platformCode: 'incomplete_list' }, { 'retry-after': '250' });
    expect(problemMessage(e)).toBe('Sàn trả thiếu danh sách SKU, thử lại sau 5 phút.');
  });

  it('kèm câu gốc của sàn nếu có', () => {
    const e = loi({ status: 409, code: 'marketplace_rejected', platformCode: 'incomplete_list', platformMessage: 'Partial' });
    expect(problemMessage(e)).toBe('Sàn trả thiếu danh sách SKU, thử lại sau 10 phút. Sàn báo: Partial');
  });

  it('platformCode khác dùng câu chung của marketplace_rejected', () => {
    expect(problemMessage(loi({ status: 409, code: 'marketplace_rejected', platformCode: 'other' }))).toBe(
      'Sàn từ chối thao tác này.',
    );
  });
});

describe('isTimeout', () => {
  it('axios hết thời gian chờ, không có phản hồi', () => {
    expect(isTimeout(new AxiosError('timeout of 45000ms exceeded', 'ECONNABORTED'))).toBe(true);
    expect(isTimeout(new AxiosError('timeout', 'ETIMEDOUT'))).toBe(true);
  });

  it('lỗi mạng khác hoặc BE có trả lời thì không phải hết giờ', () => {
    expect(isTimeout(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(false);
    expect(isTimeout(loi({ status: 503, code: 'remote_skus_busy' }))).toBe(false);
    expect(isTimeout(new Error('x'))).toBe(false);
  });
});

describe('remoteRefreshErrorMessage: lỗi của lượt tải chạy nền (BE#361)', () => {
  const err = (code: string, platformCode: string | null = null) => ({ code, platformCode, message: 'BE message' });

  it('sàn trả thiếu danh sách: đếm ngược số phút, hết giờ thì mời bấm Tải lại', () => {
    expect(remoteRefreshErrorMessage(err('marketplace_rejected', 'incomplete_list'), 250)).toBe(
      'Sàn trả thiếu danh sách SKU, thử lại sau 5 phút.',
    );
    expect(remoteRefreshErrorMessage(err('marketplace_rejected', 'too_many_calls'), 0)).toBe(
      'Sàn trả thiếu danh sách SKU. Bấm Tải lại để thử lại.',
    );
  });

  it('hết hạn mức gọi sàn dùng câu chung', () => {
    expect(remoteRefreshErrorMessage(err('marketplace_unavailable', 'daily_call_limit'), 600)).toBe(
      'Hôm nay đã hết lượt gọi sàn cho thao tác tay. Việc tự động vẫn chạy và sẽ đồng bộ sau.',
    );
  });

  it('timed_out, sàn lỗi có câu riêng kèm số phút', () => {
    expect(remoteRefreshErrorMessage(err('timed_out'), 61)).toBe(
      'Sàn trả danh sách SKU quá 10 phút nên lượt tải đã dừng. Thử lại sau 2 phút.',
    );
    expect(remoteRefreshErrorMessage(err('marketplace_unavailable'), null)).toBe(
      'Sàn đang lỗi, chưa tải được danh sách SKU. Bấm Tải lại để thử lại.',
    );
  });

  it('sàn từ chối vì lý do khác: câu tải SKU, không câu huỷ đơn (FE#250)', () => {
    expect(remoteRefreshErrorMessage(err('marketplace_rejected', 'other'), null)).toBe(
      'Sàn chưa trả được danh sách SKU. Bấm Tải lại để thử lại.',
    );
  });

  it('gian hàng quá 10.000 sản phẩm: không mời bấm Tải lại', () => {
    expect(remoteRefreshErrorMessage(err('marketplace_rejected', 'too_many_products'), 300)).toBe(
      'Gian hàng quá 10.000 sản phẩm, sàn không cho đọc hết danh sách.',
    );
  });

  it('lượt kẹt quá 15 phút (refresh_stale, FE#315): mời bấm Tải lại', () => {
    expect(remoteRefreshErrorMessage(err('refresh_stale'), null)).toBe(
      'Quá 15 phút chưa tải xong danh sách SKU nên lượt tải đã dừng. Bấm Tải lại để thử lại.',
    );
  });

  it('mã lạ thì dùng message của BE', () => {
    expect(remoteRefreshErrorMessage(err('weird'), null)).toBe('BE message Bấm Tải lại để thử lại.');
  });
});
