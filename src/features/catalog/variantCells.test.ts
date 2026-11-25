import { describe, expect, it } from 'vitest';
import { parseCell } from '@/components/common/editableGrid/cellParse';
import { parseVariantField } from './variantCells';

describe('parseVariantField', () => {
  it('giá theo ô giá, không nhận 0', () => {
    expect(parseVariantField('standardPrice', '150.000')).toEqual({ ok: true, value: 150000 });
    expect(parseVariantField('targetNetPrice', '')).toEqual({ ok: true, value: null });
    expect(parseVariantField('standardPrice', '0').ok).toBe(false);
    expect(parseVariantField('standardPrice', 'abc').ok).toBe(false);
  });
  it('khối lượng, cạnh chặn quá trần, không ghép số qua dấu phẩy, chấm (commerio-backend#434)', () => {
    expect(parseVariantField('weightG', '60000')).toEqual({ ok: false, error: 'Cân nặng tối đa 50 kg' });
    expect(parseVariantField('lengthMm', '2500')).toEqual({ ok: false, error: 'Chiều dài tối đa 2.000 mm' });
    expect(parseVariantField('heightMm', '120')).toEqual({ ok: true, value: 120 });
    expect(parseVariantField('weightG', '0,25')).toEqual({ ok: false, error: 'Nhập số gam nguyên, vd 250' });
    expect(parseVariantField('widthMm', '1.000')).toEqual({ ok: false, error: 'Nhập số mm nguyên, vd 300' });
    expect(parseVariantField('weightG', '')).toEqual({ ok: true, value: null });
  });
  it('ngưỡng tồn cho phép 0', () => {
    expect(parseVariantField('minQty', '0')).toEqual({ ok: true, value: 0 });
    expect(parseVariantField('minQty', '-1')).toEqual({ ok: false, error: 'Nhập số nguyên từ 0' });
    expect(parseCell('0', { allowZero: true })).toEqual({ ok: true, value: 0 });
  });
});
