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
  it('khối lượng, cạnh chặn sai đơn vị', () => {
    expect(parseVariantField('weightG', '60000')).toEqual({ ok: false, error: 'Quá 50 kg, kiểm tra lại đơn vị gram' });
    expect(parseVariantField('lengthMm', '2500')).toEqual({ ok: false, error: 'Quá 2 m, kiểm tra lại đơn vị mm' });
    expect(parseVariantField('heightMm', '120')).toEqual({ ok: true, value: 120 });
  });
  it('ngưỡng tồn cho phép 0', () => {
    expect(parseVariantField('minQty', '0')).toEqual({ ok: true, value: 0 });
    expect(parseVariantField('minQty', '-1')).toEqual({ ok: false, error: 'Nhập số nguyên từ 0' });
    expect(parseCell('0', { allowZero: true })).toEqual({ ok: true, value: 0 });
  });
});
