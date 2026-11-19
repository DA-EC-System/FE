import { describe, expect, it } from 'vitest';
import { measureTextSchema, parseMeasure, type MeasureKind } from './measure';

// commerio-backend#434: ô cân nặng, kích thước không tự ghép số ("0,25" từng lưu thành 25 g)
describe('parseMeasure', () => {
  it.each<[MeasureKind, string, number | null]>([
    ['weight', '250', 250],
    ['weight', ' 250 ', 250],
    ['weight', '', null],
    ['weight', '   ', null],
    ['weight', '50000', 50_000],
    ['edge', '2000', 2_000],
  ])('%s "%s" → %s', (kind, raw, value) => {
    expect(parseMeasure(kind, raw)).toEqual({ ok: true, value });
  });

  it.each<[MeasureKind, string, string]>([
    ['weight', '0,25', 'Nhập số gam nguyên, vd 250'],
    ['weight', '0.25', 'Nhập số gam nguyên, vd 250'],
    ['weight', '50.000', 'Nhập số gam nguyên, vd 250'],
    ['weight', '2 50', 'Nhập số gam nguyên, vd 250'],
    ['weight', '-5', 'Nhập số gam nguyên, vd 250'],
    ['weight', '50001', 'Cân nặng tối đa 50 kg'],
    ['weight', '0', 'Nhập số nguyên lớn hơn 0'],
    ['edge', '30.5', 'Nhập số mm nguyên, vd 300'],
    ['edge', '2001', 'Tối đa 2.000 mm'],
  ])('%s "%s" → lỗi "%s"', (kind, raw, error) => {
    expect(parseMeasure(kind, raw)).toEqual({ ok: false, error });
  });
});

describe('measureTextSchema', () => {
  it('trả số khi đúng, lỗi tại ô khi gõ số lẻ', () => {
    expect(measureTextSchema('weight').parse('250')).toBe(250);
    expect(measureTextSchema('weight').safeParse('0,25').error?.issues[0]?.message).toBe('Nhập số gam nguyên, vd 250');
  });
});
