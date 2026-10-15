import { z } from 'zod';
import { formatCurrency } from '@/utils/format';
import type { PricelistItem } from '@/types/pricing';

export type Toast = { severity: 'success' | 'error' | 'warning'; msg: string };

/** Giá là số nguyên đồng, không âm (UC-CP-03 bước 8) */
export const MAX_PRICE = 10_000_000_000;

/**
 * Ô giá nhập chữ: bỏ khoảng trắng, dấu phân cách nghìn ("." hoặc ","), chữ "đ"/"₫".
 * Ô trống là chưa có giá (null).
 */
export const priceTextSchema = z.string().transform((raw, ctx): number | null => {
  const text = raw.trim().replace(/[\s.,₫]|đ$/gi, '');
  if (!text) return null;
  const fail = (message: string) => {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    return z.NEVER;
  };
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

export const pricelistNameSchema = z
  .string()
  .trim()
  .min(1, 'Nhập tên bảng giá')
  .max(60, 'Tên bảng giá tối đa 60 ký tự');

export const pricelistCreateSchema = z.object({
  name: pricelistNameSchema,
  shopId: z.string().min(1, 'Chọn gian hàng'),
  copyFromStandard: z.boolean(),
});
export type PricelistCreateForm = z.infer<typeof pricelistCreateSchema>;

export const pricelistRenameSchema = z.object({ name: pricelistNameSchema });
export type PricelistRenameForm = z.infer<typeof pricelistRenameSchema>;

// ---------- Sửa giá hàng loạt ----------

export type BulkMode = 'set' | 'percent' | 'amount' | 'standard' | 'clear';

export interface BulkOperation {
  mode: BulkMode;
  /** set: giá mới; percent: % tăng (âm là giảm); amount: số đồng tăng (âm là giảm) */
  value: number;
  /** Làm tròn tới bội số này (1 là không làm tròn); không áp cho set, standard, clear */
  roundTo: 1 | 100 | 1000;
}

const signed = z.coerce
  .number({ invalid_type_error: 'Nhập một số' })
  .refine((n) => Number.isFinite(n), 'Nhập một số');

export const bulkFormSchema = z
  .object({
    mode: z.enum(['set', 'percent', 'amount', 'standard', 'clear']),
    value: z.string(),
    roundTo: z.union([z.literal(1), z.literal(100), z.literal(1000)]),
  })
  .transform((form, ctx): BulkOperation => {
    const fail = (message: string) => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message });
      return z.NEVER;
    };
    if (form.mode === 'standard' || form.mode === 'clear') {
      return { mode: form.mode, value: 0, roundTo: 1 };
    }
    if (form.mode === 'set') {
      const price = parsePrice(form.value);
      if (!price.ok) return fail(price.error);
      if (price.value === null) return fail('Nhập giá mới');
      return { mode: 'set', value: price.value, roundTo: 1 };
    }
    // %: "12,5" hoặc "12.5"; số tiền: dấu chấm, phẩy là phân cách nghìn
    const text =
      form.mode === 'percent'
        ? form.value.replace(/\s/g, '').replace(',', '.')
        : form.value.replace(/[\s.,]/g, '');
    if (!text) return fail(form.mode === 'percent' ? 'Nhập số %' : 'Nhập số tiền');
    const n = signed.safeParse(text);
    if (!n.success) return fail('Nhập một số, vd 10 hoặc -10');
    if (form.mode === 'percent' && (n.data <= -100 || n.data > 1000)) {
      return fail('Phần trăm phải lớn hơn -100 và không quá 1000');
    }
    if (form.mode === 'amount' && !Number.isInteger(n.data)) return fail('Số tiền phải là số nguyên đồng');
    if (n.data === 0) return fail('Nhập số khác 0');
    return { mode: form.mode, value: n.data, roundTo: form.roundTo };
  });
export type BulkForm = z.input<typeof bulkFormSchema>;

export interface BulkResult {
  /** variantId → giá mới (null là bỏ giá) */
  changes: Map<string, number | null>;
  /** Dòng bỏ qua vì chưa có giá để tính */
  noBase: number;
  /** Dòng bỏ qua vì giá ra âm hoặc quá lớn */
  outOfRange: number;
}

/**
 * Áp một phép sửa lên các dòng đã chọn. `current` là giá đang hiện trên lưới (đã gồm thay đổi chưa lưu).
 * Bảng giá theo kênh: dòng chưa có giá lấy giá chuẩn làm gốc khi tăng/giảm.
 */
export function applyBulk(
  rows: Pick<PricelistItem, 'variantId' | 'standardPrice'>[],
  current: (variantId: string) => number | null,
  op: BulkOperation,
  isChannel: boolean,
): BulkResult {
  const changes = new Map<string, number | null>();
  let noBase = 0;
  let outOfRange = 0;
  for (const row of rows) {
    if (op.mode === 'clear') {
      changes.set(row.variantId, null);
      continue;
    }
    if (op.mode === 'standard') {
      if (row.standardPrice === null) noBase++;
      else changes.set(row.variantId, row.standardPrice);
      continue;
    }
    if (op.mode === 'set') {
      changes.set(row.variantId, op.value);
      continue;
    }
    const base = current(row.variantId) ?? (isChannel ? row.standardPrice : null);
    if (base === null) {
      noBase++;
      continue;
    }
    const raw = op.mode === 'percent' ? base * (1 + op.value / 100) : base + op.value;
    const next = Math.round(raw / op.roundTo) * op.roundTo;
    if (next < 0 || next > MAX_PRICE) {
      outOfRange++;
      continue;
    }
    changes.set(row.variantId, next);
  }
  return { changes, noBase, outOfRange };
}
