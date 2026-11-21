import { describe, expect, it } from 'vitest';
import { regroupErrorText } from './regroupError';

describe('Câu lỗi gom thành một sản phẩm (Documents/21 §18.8.4)', () => {
  it('mỗi mã 409 một câu có bước đi tiếp; mã lạ dùng câu chung', () => {
    expect(regroupErrorText('nothing_to_regroup', 'Lazada', 'x')).toContain('không cần gom');
    expect(regroupErrorText('shop_not_connected', 'Lazada', 'x')).toContain('Kết nối lại');
    expect(regroupErrorText('invalid_transition', 'Lazada', 'x')).toContain('Xử lý xong');
    expect(regroupErrorText('push_blocked', 'TikTok Shop', 'x')).toContain('TikTok Shop');
    expect(regroupErrorText('marketplace_unsupported', 'Lazada', 'x')).toContain('Gom tay');
    expect(regroupErrorText('shop_awaiting_stocktake', 'Lazada', 'Câu chung')).toBe('Câu chung');
    expect(regroupErrorText(undefined, 'Lazada', 'Lỗi chung')).toBe('Lỗi chung');
  });
});
