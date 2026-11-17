// Tải lại SKU sàn (FE#265, BE#361; Documents/21 §18.3): câu báo sàn trả thiếu danh sách, hết thời gian chờ
import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { isTimeout, type ProblemDetails } from './client';
import { problemMessage } from './problemMessages';

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

  it('platformCode khác giữ câu cũ của marketplace_rejected', () => {
    expect(problemMessage(loi({ status: 409, code: 'marketplace_rejected', platformCode: 'other' }))).toBe(
      'Sàn không cho huỷ đơn này.',
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
