import { z } from 'zod';
import { formatMoneyInput, parseMoney } from '@/utils/price';
import type { SuggestConfig } from '@/types/catalog';

/**
 * Năm ô gợi ý giá, gợi ý nhập lại (Documents/21 §5.2 "Cấu hình gợi ý", 19/11/2026). Công ty đặt mặc định ở Cài đặt
 * sản phẩm, nhóm hàng ghi đè; ô trống là `null`: ở nhóm là theo công ty, ở công ty là không gợi ý.
 */
export const SUGGEST_KEYS = [
  'marginCoefficient',
  'priceRounding',
  'reorderLeadDays',
  'reorderSafetyQty',
  'reorderDefaultQty',
] as const satisfies readonly (keyof SuggestConfig)[];

export type SuggestForm = Record<keyof SuggestConfig, string>;

// Giới hạn theo SuggestConfig của BE (commerio-backend catalog/api/schemas.ts)
const COEFFICIENT_MAX = 100;
const ROUNDING_MAX = 1_000_000;
const COUNT_MAX: Record<'reorderLeadDays' | 'reorderSafetyQty' | 'reorderDefaultQty', number> = {
  reorderLeadDays: 365,
  reorderSafetyQty: 1_000_000,
  reorderDefaultQty: 1_000_000,
};
const COEFFICIENT = /^\d{1,3}([.,]\d{1,2})?$/;

/** "1,4" hoặc "1.4" → 1.4; trống → null; sai → undefined */
export function parseCoefficient(raw: string): number | null | undefined {
  const text = raw.trim();
  if (!text) return null;
  if (!COEFFICIENT.test(text)) return undefined;
  const value = Number(text.replace(',', '.'));
  return value >= 1 && value <= COEFFICIENT_MAX ? value : undefined;
}

function parseCount(raw: string, max: number): number | null | undefined {
  const text = raw.trim();
  if (!text) return null;
  if (!/^\d{1,7}$/.test(text)) return undefined;
  const value = Number(text);
  return value <= max ? value : undefined;
}

export const suggestFormSchema = z
  .object({
    marginCoefficient: z.string(),
    priceRounding: z.string(),
    reorderLeadDays: z.string(),
    reorderSafetyQty: z.string(),
    reorderDefaultQty: z.string(),
  })
  .superRefine((f, ctx) => {
    const issue = (path: keyof SuggestConfig, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (parseCoefficient(f.marginCoefficient) === undefined) {
      issue('marginCoefficient', `Hệ số từ 1 đến ${COEFFICIENT_MAX}, tối đa hai chữ số thập phân, ví dụ 1,4`);
    }
    const rounding = parseMoney(f.priceRounding);
    if (!rounding.ok) issue('priceRounding', rounding.error);
    else if (rounding.value !== null && (rounding.value < 1 || rounding.value > ROUNDING_MAX)) {
      issue('priceRounding', `Bước làm tròn từ 1 đến ${ROUNDING_MAX.toLocaleString('vi-VN')} đ`);
    }
    for (const [key, max] of Object.entries(COUNT_MAX) as [keyof typeof COUNT_MAX, number][]) {
      if (parseCount(f[key], max) === undefined) issue(key, `Nhập số nguyên từ 0 đến ${max.toLocaleString('vi-VN')}`);
    }
  });

export const EMPTY_SUGGEST_FORM: SuggestForm = {
  marginCoefficient: '',
  priceRounding: '',
  reorderLeadDays: '',
  reorderSafetyQty: '',
  reorderDefaultQty: '',
};

/** Hiện số theo kiểu vi-VN: 1.4 → "1,4", 1000 → "1.000" */
export function suggestText(key: keyof SuggestConfig, value: number | null): string {
  if (value === null) return '';
  if (key === 'marginCoefficient') return String(value).replace('.', ',');
  if (key === 'priceRounding') return formatMoneyInput(value);
  return String(value);
}

export function toSuggestForm(config: SuggestConfig | undefined): SuggestForm {
  if (!config) return { ...EMPTY_SUGGEST_FORM };
  return Object.fromEntries(SUGGEST_KEYS.map((k) => [k, suggestText(k, config[k])])) as SuggestForm;
}

/** Gọi sau khi `suggestFormSchema` đã qua */
export function fromSuggestForm(form: SuggestForm): SuggestConfig {
  const rounding = parseMoney(form.priceRounding);
  return {
    marginCoefficient: parseCoefficient(form.marginCoefficient) ?? null,
    priceRounding: rounding.ok ? rounding.value : null,
    reorderLeadDays: parseCount(form.reorderLeadDays, COUNT_MAX.reorderLeadDays) ?? null,
    reorderSafetyQty: parseCount(form.reorderSafetyQty, COUNT_MAX.reorderSafetyQty) ?? null,
    reorderDefaultQty: parseCount(form.reorderDefaultQty, COUNT_MAX.reorderDefaultQty) ?? null,
  };
}

/** Lỗi theo ô của BE (`errors["suggest.marginCoefficient"]` hoặc `errors.marginCoefficient`) */
export function suggestFieldErrors(errors: Record<string, string>): [keyof SuggestConfig, string][] {
  return SUGGEST_KEYS.flatMap((k) => {
    const message = errors[`suggest.${k}`] ?? errors[k];
    return message ? [[k, message] as [keyof SuggestConfig, string]] : [];
  });
}
