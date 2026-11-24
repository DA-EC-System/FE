/** Ô giá nhập chữ dùng chung (giá chuẩn của SKU, giá trên listing). Trước ở features/pricing, bỏ theo D9 */
import { z } from 'zod';
import { formatCurrency } from '@/utils/format';

/** Giá là số nguyên đồng, không âm (UC-CP-03 bước 8) */
export const MAX_PRICE = 10_000_000_000;

export const MONEY_FORMAT_ERROR = 'Số tiền là số nguyên đồng, ví dụ 1.500.000';
export const MONEY_NEGATIVE_ERROR = 'Số tiền không được âm';

export type MoneyParse = { ok: true; value: number | null } | { ok: false; error: string };

/**
 * Hàm đọc số tiền dùng chung (FE#385). Tiền là số nguyên đồng.
 * Nhận "1500000", "1.500.000", "1,500,000" (một loại dấu, mỗi nhóm đủ 3 chữ số), bỏ khoảng trắng và hậu tố "đ"/"₫".
 * Chuỗi mơ hồ ("150.5", "1.500.000,50", "1.500,000", "15.00.000") báo lỗi, không đoán. Ô trống là null.
 */
export function parseMoney(raw: string): MoneyParse {
  const compact = raw.replace(/\s/g, '').replace(/(đ|₫)$/i, '');
  if (!compact) return { ok: true, value: null };
  if (/^-/.test(compact) && /^-[\d.,]+$/.test(compact)) return { ok: false, error: MONEY_NEGATIVE_ERROR };
  let digits: string;
  if (/^\d+$/.test(compact)) digits = compact;
  else if (/^\d{1,3}(\.\d{3})+$/.test(compact) || /^\d{1,3}(,\d{3})+$/.test(compact)) digits = compact.replace(/[.,]/g, '');
  else return { ok: false, error: MONEY_FORMAT_ERROR };
  const value = Number(digits);
  if (!Number.isSafeInteger(value)) return { ok: false, error: MONEY_FORMAT_ERROR };
  return { ok: true, value };
}

/** Số tiền để điền sẵn vào ô nhập: "1.500.000", không có ký hiệu đồng */
export const formatMoneyInput = (value: number | null | undefined) =>
  value === null || value === undefined ? '' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value);

/** Ô tiền trong form (zod): bắt buộc nhập, trong khoảng [min, max] */
export const moneySchema = ({ label, min = 0, max }: { label: string; min?: number; max: number }) =>
  z.string().transform((raw, ctx): number => {
    const fail = (message: string) => {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    };
    const parsed = parseMoney(raw);
    if (!parsed.ok) return fail(parsed.error);
    if (parsed.value === null) return fail(`Nhập ${label.toLowerCase()}`);
    if (parsed.value < min) return fail(`${label} phải từ ${formatMoneyInput(min)} đồng`);
    if (parsed.value > max) return fail(`${label} tối đa ${formatMoneyInput(max)} đồng`);
    return parsed.value;
  });

/**
 * Ô giá nhập chữ: bỏ khoảng trắng, dấu phân cách nghìn ("." hoặc ","), chữ "đ"/"₫".
 * Ô trống là chưa có giá (null).
 */
export const priceTextSchema = z.string().transform((raw, ctx): number | null => {
  const fail = (message: string) => {
    ctx.addIssue({ code: 'custom', message });
    return z.NEVER;
  };
  // Đọc bằng parseMoney (FE#385); câu lỗi riêng của ô giá giữ tới khi các bảng sửa SKU chuyển sang MoneyInput
  const parsed = parseMoney(raw);
  if (!parsed.ok) return fail(parsed.error === MONEY_NEGATIVE_ERROR ? 'Giá không được âm' : 'Giá phải là số nguyên đồng, vd 150000');
  if (parsed.value === null) return null;
  if (parsed.value > MAX_PRICE) return fail('Giá tối đa 10 tỷ đồng');
  return parsed.value;
});

export function parsePrice(text: string): { ok: true; value: number | null } | { ok: false; error: string } {
  const result = priceTextSchema.safeParse(text);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, error: result.error.issues[0]?.message ?? 'Giá sai định dạng' };
}

export const priceText = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : formatCurrency(value);
