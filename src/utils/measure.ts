/**
 * Ô cân nặng (g), kích thước gói (mm) của SKU (commerio-backend#434, Documents/21 §17.5). Trần và câu lỗi trùng BE
 * (`catalog/domain/measure.ts`). Chỉ nhận chữ số: không bỏ dấu chấm, phẩy, khoảng trắng giữa số như ô giá, vì "0,25" (kg)
 * mà ghép thành 25 g là sai lặng lẽ.
 */
export const WEIGHT_MAX_G = 50_000;
export const EDGE_MAX_MM = 2_000;

export type MeasureField = 'weightG' | 'lengthMm' | 'widthMm' | 'heightMm';

const RULES: Record<MeasureField, { max: number; notInt: string; tooBig: string }> = {
  weightG: { max: WEIGHT_MAX_G, notInt: 'Nhập số gam nguyên, vd 250', tooBig: 'Cân nặng tối đa 50 kg' },
  lengthMm: { max: EDGE_MAX_MM, notInt: 'Nhập số mm nguyên, vd 300', tooBig: 'Chiều dài tối đa 2.000 mm' },
  widthMm: { max: EDGE_MAX_MM, notInt: 'Nhập số mm nguyên, vd 300', tooBig: 'Chiều rộng tối đa 2.000 mm' },
  heightMm: { max: EDGE_MAX_MM, notInt: 'Nhập số mm nguyên, vd 300', tooBig: 'Chiều cao tối đa 2.000 mm' },
};

export const isMeasureField = (key: string): key is MeasureField => key in RULES;

/** Ô trống là chưa có (null); còn lại là số nguyên từ 1 tới trần */
export function parseMeasure(field: MeasureField, raw: string): { ok: true; value: number | null } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: true, value: null };
  const rule = RULES[field];
  const value = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(value)) return { ok: false, error: rule.notInt };
  if (value === 0) return { ok: false, error: 'Nhập số nguyên lớn hơn 0' };
  if (value > rule.max) return { ok: false, error: rule.tooBig };
  return { ok: true, value };
}
