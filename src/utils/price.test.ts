import { describe, expect, it } from 'vitest';
import { MONEY_FORMAT_ERROR, MONEY_NEGATIVE_ERROR, formatMoneyInput, moneySchema, parseMoney, parsePrice } from './price';

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

describe('parseMoney (FE#385)', () => {
  it('nhận số liền, phân cách bằng dấu chấm hoặc dấu phẩy, bỏ khoảng trắng và hậu tố đồng', () => {
    expect(parseMoney('1500000')).toEqual({ ok: true, value: 1500000 });
    expect(parseMoney('1.500.000')).toEqual({ ok: true, value: 1500000 });
    expect(parseMoney('1,500,000')).toEqual({ ok: true, value: 1500000 });
    expect(parseMoney(' 1.500.000 đ ')).toEqual({ ok: true, value: 1500000 });
    expect(parseMoney('150.500₫')).toEqual({ ok: true, value: 150500 });
    expect(parseMoney('0')).toEqual({ ok: true, value: 0 });
  });

  it('ô trống là null', () => {
    expect(parseMoney('')).toEqual({ ok: true, value: null });
    expect(parseMoney('  ')).toEqual({ ok: true, value: null });
  });

  it('chuỗi mơ hồ báo lỗi, không đoán', () => {
    for (const s of ['150.5', '1.500.000,50', '1.500,000', '15.00.000', '1.5000', '.500', '1.', '150000.00', 'abc', '1e6']) {
      expect(parseMoney(s), s).toEqual({ ok: false, error: MONEY_FORMAT_ERROR });
    }
  });

  it('số âm có câu riêng', () => {
    expect(parseMoney('-1.000')).toEqual({ ok: false, error: MONEY_NEGATIVE_ERROR });
  });
});

describe('moneySchema', () => {
  const schema = moneySchema({ label: 'Giá nhập', max: 1_000_000_000 });

  it('ra số để gửi API', () => {
    expect(schema.parse('1.500.000')).toBe(1500000);
    expect(typeof schema.parse('1,500,000')).toBe('number');
  });

  it('bắt buộc nhập, chặn ngoài khoảng, chặn chuỗi mơ hồ', () => {
    const msg = (s: string) => schema.safeParse(s).error?.issues[0]?.message;
    expect(msg('')).toBe('Nhập giá nhập');
    expect(msg('150.5')).toBe(MONEY_FORMAT_ERROR);
    expect(msg('1.000.000.001')).toBe('Giá nhập tối đa 1.000.000.000 đồng');
    expect(moneySchema({ label: 'Số tiền hoàn', min: 1, max: 10 }).safeParse('0').error?.issues[0]?.message).toBe(
      'Số tiền hoàn phải từ 1 đồng',
    );
  });
});

describe('formatMoneyInput', () => {
  it('có phân cách nghìn, null là chuỗi rỗng', () => {
    expect(formatMoneyInput(1500000)).toBe('1.500.000');
    expect(formatMoneyInput(0)).toBe('0');
    expect(formatMoneyInput(null)).toBe('');
    expect(formatMoneyInput(undefined)).toBe('');
  });
});
