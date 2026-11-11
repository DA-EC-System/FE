/** Ô giá nhập chữ dùng chung (giá chuẩn của SKU, giá trên listing). Trước ở features/pricing, bỏ theo D9 */
import { z } from 'zod';
import { formatCurrency } from '@/utils/format';

/** Giá là số nguyên đồng, không âm (UC-CP-03 bước 8) */
export const MAX_PRICE = 10_000_000_000;

/**
 * Ô giá nhập chữ: bỏ khoảng trắng, dấu phân cách nghìn ("." hoặc ","), chữ "đ"/"₫".
 * Ô trống là chưa có giá (null).
 */
export const priceTextSchema = z.string().transform((raw, ctx): number | null => {
  const compact = raw.trim().replace(/\s|₫|đ$/gi, '');
  if (!compact) return null;
  const fail = (message: string) => {
    ctx.addIssue({ code: 'custom', message });
    return z.NEVER;
  };
  // "150.000" hay "150,000" là phân cách nghìn; "150000.5" là giá lẻ, không bỏ dấu
  if (/[.,]/.test(compact) && !/^-?\d{1,3}([.,]\d{3})+$/.test(compact)) {
    return fail('Giá phải là số nguyên đồng, vd 150000');
  }
  const text = compact.replace(/[.,]/g, '');
  if (/^-\d+$/.test(text)) return fail('Giá không được âm');
  if (!/^\d+$/.test(text)) return fail('Giá phải là số nguyên đồng, vd 150000');
  const value = Number(text);
  if (value > MAX_PRICE) return fail('Giá tối đa 10 tỷ đồng');
  return value;
});

export function parsePrice(text: string): { ok: true; value: number | null } | { ok: false; error: string } {
  const result = priceTextSchema.safeParse(text);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, error: result.error.issues[0]?.message ?? 'Giá sai định dạng' };
}

export const priceText = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : formatCurrency(value);
