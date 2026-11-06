import type { SetupDecision, SetupSuggestion, Shop } from '@/types/shop';

/** §18.7.7: đọc lại mỗi 3 giây khi còn bước đang chạy, tối đa 30 phút */
export const SETUP_POLL_MS = 3000;
export const SETUP_POLL_MAX_MS = 30 * 60 * 1000;

/** Biến thể đang ghép cho một SKU sàn; null là bỏ qua */
export interface RowChoice {
  variantId: string;
  sku: string;
  available: number;
  /** picked: người dùng chọn khác gợi ý */
  picked: boolean;
}

/**
 * Chọn sẵn: chỉ dòng có variantId, và mỗi biến thể chỉ chọn sẵn ở dòng đầu tiên
 * (hai SKU sàn cùng ghép một biến thể thì BE trả 422 decisions.<i>)
 */
export function initialChoices(suggestions: SetupSuggestion[]): Record<string, RowChoice | null> {
  const seen = new Set<string>();
  const out: Record<string, RowChoice | null> = {};
  for (const s of suggestions) {
    if (s.variantId && !seen.has(s.variantId)) {
      seen.add(s.variantId);
      out[s.externalSkuId] = { variantId: s.variantId, sku: s.sku ?? '', available: s.available ?? 0, picked: false };
    } else {
      out[s.externalSkuId] = null;
    }
  }
  return out;
}

/** Mỗi SKU trong suggestions một quyết định, theo đúng thứ tự (để đọc lỗi decisions.<i>) */
export function toDecisions(
  suggestions: SetupSuggestion[],
  choices: Record<string, RowChoice | null>,
): SetupDecision[] {
  return suggestions.map((s) => ({ externalSkuId: s.externalSkuId, variantId: choices[s.externalSkuId]?.variantId ?? null }));
}

/** Lỗi 422 errors["decisions.<i>"] gắn về SKU sàn của dòng i */
export function decisionErrors(
  suggestions: SetupSuggestion[],
  errors: Record<string, string> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!errors) return out;
  for (const [key, message] of Object.entries(errors)) {
    const m = /^decisions\.(\d+)/.exec(key);
    const s = m ? suggestions[Number(m[1])] : undefined;
    if (s) out[s.externalSkuId] = message;
  }
  return out;
}

/** Còn bước nào đang chạy thì còn đọc lại */
export function setupRunning(shop: Shop | undefined): boolean {
  return Boolean(shop?.setup?.steps.some((s) => s.status === 'running'));
}
