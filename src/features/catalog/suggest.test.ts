// Năm ô gợi ý (FE#350, Documents/21 §5.2 "Cấu hình gợi ý")
import { describe, expect, it } from 'vitest';
import { EMPTY_SUGGEST_FORM, fromSuggestForm, parseCoefficient, suggestFieldErrors, suggestFormSchema, toSuggestForm } from './suggest';

const errorsOf = (form: Partial<typeof EMPTY_SUGGEST_FORM>) => {
  const r = suggestFormSchema.safeParse({ ...EMPTY_SUGGEST_FORM, ...form });
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path[0], i.message]));
};

describe('hệ số lãi', () => {
  it('nhận dấu phẩy hoặc chấm, tối đa hai chữ số thập phân, từ 1', () => {
    expect(parseCoefficient('1,4')).toBe(1.4);
    expect(parseCoefficient('1.25')).toBe(1.25);
    expect(parseCoefficient(' ')).toBeNull();
    expect(parseCoefficient('0,9')).toBeUndefined();
    expect(parseCoefficient('1,255')).toBeUndefined();
    expect(parseCoefficient('40%')).toBeUndefined();
    expect(parseCoefficient('100,5')).toBeUndefined();
  });
});

describe('suggestFormSchema', () => {
  it('ô trống hợp lệ, đọc ra null', () => {
    expect(errorsOf({})).toEqual({});
    expect(fromSuggestForm(EMPTY_SUGGEST_FORM)).toEqual({
      marginCoefficient: null,
      priceRounding: null,
      reorderLeadDays: null,
      reorderSafetyQty: null,
      reorderDefaultQty: null,
    });
  });

  it('báo lỗi theo ô, giới hạn như BE: hệ số 1–100, làm tròn 1–1.000.000 đ, số ngày ≤ 365, số lượng nguyên', () => {
    expect(errorsOf({ marginCoefficient: '0,5', priceRounding: '0', reorderLeadDays: '366', reorderDefaultQty: '2,5' })).toEqual({
      marginCoefficient: 'Hệ số từ 1 đến 100, tối đa hai chữ số thập phân, ví dụ 1,4',
      priceRounding: 'Bước làm tròn từ 1 đến 1.000.000 đ',
      reorderLeadDays: 'Nhập số nguyên từ 0 đến 365',
      reorderDefaultQty: 'Nhập số nguyên từ 0 đến 1.000.000',
    });
    expect(errorsOf({ reorderSafetyQty: '-1' }).reorderSafetyQty).toBe('Nhập số nguyên từ 0 đến 1.000.000');
    expect(errorsOf({ priceRounding: '1.5' }).priceRounding).toBeTruthy();
  });

  it('đọc và hiện lại theo kiểu vi-VN', () => {
    const config = { marginCoefficient: 1.4, priceRounding: 1000, reorderLeadDays: 7, reorderSafetyQty: 0, reorderDefaultQty: null };
    const form = toSuggestForm(config);
    expect(form).toEqual({ marginCoefficient: '1,4', priceRounding: '1.000', reorderLeadDays: '7', reorderSafetyQty: '0', reorderDefaultQty: '' });
    expect(fromSuggestForm(form)).toEqual(config);
  });
});

it('lỗi BE theo ô có hoặc không có tiền tố suggest.', () => {
  expect(suggestFieldErrors({ 'suggest.marginCoefficient': 'a', priceRounding: 'b', name: 'c' })).toEqual([
    ['marginCoefficient', 'a'],
    ['priceRounding', 'b'],
  ]);
});
