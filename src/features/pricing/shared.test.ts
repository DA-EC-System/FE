import { describe, expect, it } from 'vitest';
import { parsePrice } from './shared';

describe('parsePrice (AC-G6)', () => {
  it('nhận số nguyên đồng, có hoặc không có phân cách nghìn', () => {
    expect(parsePrice('150000')).toEqual({ ok: true, value: 150000 });
    expect(parsePrice('150.000')).toEqual({ ok: true, value: 150000 });
    expect(parsePrice('1,250,000 đ')).toEqual({ ok: true, value: 1250000 });
    expect(parsePrice('0')).toEqual({ ok: true, value: 0 });
    expect(parsePrice('10000000000')).toEqual({ ok: true, value: 10_000_000_000 });
  });

  it('ô trống là chưa có giá', () => {
    expect(parsePrice('  ')).toEqual({ ok: true, value: null });
  });

  it('báo lỗi tiếng Việt khi giá âm, lẻ, không phải số hoặc quá 10 tỷ', () => {
    expect(parsePrice('-1000')).toEqual({ ok: false, error: 'Giá không được âm' });
    expect(parsePrice('150000.5')).toEqual({ ok: false, error: 'Giá phải là số nguyên đồng, vd 150000' });
    expect(parsePrice('1,5')).toEqual({ ok: false, error: 'Giá phải là số nguyên đồng, vd 150000' });
    expect(parsePrice('abc')).toEqual({ ok: false, error: 'Giá phải là số nguyên đồng, vd 150000' });
    expect(parsePrice('10000000001')).toEqual({ ok: false, error: 'Giá tối đa 10 tỷ đồng' });
  });
});
