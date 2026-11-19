/**
 * Ô cân nặng (g), kích thước gói (mm) của SKU (commerio-backend#434, Documents/21 §17.5).
 * Chỉ nhận chữ số: không bỏ dấu chấm, phẩy, khoảng trắng giữa số, vì "0,25" kg mà ghép thành 25 g là sai lặng lẽ.
 * Trần trùng với BE (`catalog/domain/measure.ts`).
 */
import { z } from 'zod';

export const WEIGHT_MAX_G = 50_000;
export const EDGE_MAX_MM = 2_000;

export type MeasureKind = 'weight' | 'edge';

const RULES: Record<MeasureKind, { max: number; notInt: string; tooBig: string }> = {
  weight: { max: WEIGHT_MAX_G, notInt: 'Nhập số gam nguyên, vd 250', tooBig: 'Cân nặng tối đa 50 kg' },
  edge: { max: EDGE_MAX_MM, notInt: 'Nhập số mm nguyên, vd 300', tooBig: 'Tối đa 2.000 mm' },
};

/** Ô trống là chưa có (null) */
export function parseMeasure(
  kind: MeasureKind,
  raw: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: true, value: null };
  const rule = RULES[kind];
  if (!/^\d+$/.test(text)) return { ok: false, error: rule.notInt };
  const value = Number(text);
  if (value <= 0) return { ok: false, error: 'Nhập số nguyên lớn hơn 0' };
  if (value > rule.max) return { ok: false, error: rule.tooBig };
  return { ok: true, value };
}

/** Ô số đo trong form react-hook-form: giữ chữ, resolver trả số hoặc null */
export const measureTextSchema = (kind: MeasureKind) =>
  z.string().transform((raw, ctx): number | null => {
    const parsed = parseMeasure(kind, raw);
    if (parsed.ok) return parsed.value;
    ctx.addIssue({ code: 'custom', message: parsed.error });
    return z.NEVER;
  });
