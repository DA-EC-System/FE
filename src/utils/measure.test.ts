import { describe, expect, it } from 'vitest';
import { parseMeasure, type MeasureField } from './measure';

// commerio-backend#434: ô cân nặng, kích thước không tự ghép số ("0,25" từng lưu thành 25 g); trần như BE
describe('parseMeasure', () => {
  it.each<[MeasureField, string, number | null]>([
    ['weightG', '250', 250],
    ['weightG', ' 250 ', 250],
    ['weightG', '', null],
    ['weightG', '   ', null],
    ['weightG', '1', 1],
    ['weightG', '50000', 50_000],
    ['lengthMm', '2000', 2_000],
    ['heightMm', '120', 120],
  ])('%s "%s" → %s', (field, raw, value) => {
    expect(parseMeasure(field, raw)).toEqual({ ok: true, value });
  });

  it.each<[MeasureField, string, string]>([
    ['weightG', '0,25', 'Nhập số gam nguyên, vd 250'],
    ['weightG', '0.25', 'Nhập số gam nguyên, vd 250'],
    ['weightG', '50.000', 'Nhập số gam nguyên, vd 250'],
    ['weightG', '2 50', 'Nhập số gam nguyên, vd 250'],
    ['weightG', '-5', 'Nhập số gam nguyên, vd 250'],
    ['weightG', '1,5kg', 'Nhập số gam nguyên, vd 250'],
    ['weightG', '0', 'Nhập số nguyên lớn hơn 0'],
    ['weightG', '50001', 'Cân nặng tối đa 50 kg'],
    ['lengthMm', '30.5', 'Nhập số mm nguyên, vd 300'],
    ['lengthMm', '2001', 'Chiều dài tối đa 2.000 mm'],
    ['widthMm', '2001', 'Chiều rộng tối đa 2.000 mm'],
    ['heightMm', '2001', 'Chiều cao tối đa 2.000 mm'],
  ])('%s "%s" → lỗi "%s"', (field, raw, error) => {
    expect(parseMeasure(field, raw)).toEqual({ ok: false, error });
  });
});
