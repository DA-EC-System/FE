import type { CannotCreateReason, SetupDecision, SetupSuggestion, Shop, ShopSetupProgress } from '@/types/shop';

/** §18.7.7: đọc lại mỗi 3 giây khi còn bước đang chạy, tối đa 30 phút */
export const SETUP_POLL_MS = 3000;
export const SETUP_POLL_MAX_MS = 30 * 60 * 1000;

/** Biến thể đang ghép cho một SKU sàn; null là bỏ qua */
export interface RowChoice {
  /** Rỗng khi create: SKU kho chưa có, BE tạo lúc hoàn tất */
  variantId: string;
  sku: string;
  available: number;
  /** picked: người dùng chọn khác gợi ý */
  picked: boolean;
  /** Tạo SKU kho từ SKU sàn (commerio-backend#500, §18.7.5) */
  create?: boolean;
}

/** Chọn "Tạo SKU kho": SKU mới chưa có hàng nên có thể bán là 0 */
export const createChoice = (): RowChoice => ({ variantId: '', sku: '', available: 0, picked: false, create: true });

/** Dòng còn tạo được SKU kho mà chưa chọn gì: nút "Tạo SKU kho cho n SKU chưa khớp" chọn hết các dòng này */
export function creatableUnmatched(suggestions: SetupSuggestion[], choices: Record<string, RowChoice | null>): SetupSuggestion[] {
  return suggestions.filter((s) => s.canCreate && !choices[s.externalSkuId]);
}

/** Biến thể đã liên kết ở dòng khác (để ô chọn SKU kho khoá); dòng tạo mới không chiếm biến thể nào */
export function takenVariants(choices: Record<string, RowChoice | null>, exceptId: string): Set<string> {
  return new Set(
    Object.entries(choices)
      .filter(([id, c]) => id !== exceptId && c?.variantId)
      .map(([, c]) => c!.variantId),
  );
}

/** Câu dưới dòng không tạo được SKU kho (§18.7.5); sku_taken thì đã có gợi ý khớp SKU nên không ghi gì */
export const CANNOT_CREATE_TEXT: Record<CannotCreateReason, string | null> = {
  no_seller_sku: 'Sàn chưa có SKU người bán. Đặt SKU trên sàn rồi bấm Tải lại để tạo hoặc liên kết.',
  sku_too_long: 'SKU người bán dài quá 50 ký tự nên không tạo được SKU kho. Sửa SKU trên sàn, hoặc chọn SKU kho có sẵn.',
  sku_taken: null,
  no_permission: null,
};

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
  return suggestions.map((s) => {
    const c = choices[s.externalSkuId];
    if (c?.create) return { externalSkuId: s.externalSkuId, variantId: null, create: true };
    return { externalSkuId: s.externalSkuId, variantId: c?.variantId ?? null };
  });
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

/** Bước 1 khi BE bỏ ghép theo tên vì gian hàng quá nhiều SKU (nameMatchSkipped, §18.7.5) */
export const NAME_MATCH_SKIPPED_NOTE =
  'Gian hàng có quá nhiều SKU nên Commerio chỉ gợi ý khi khớp SKU, không gợi ý theo tên. Hãy chọn SKU kho cho các dòng còn lại.';

/**
 * Câu cạnh bước open_orders khi môi trường đặt trần OPEN_ORDER_PULL_MAX và có đơn còn mở cũ không kéo về
 * (Shop.setup.openOrdersSkipped, §18.6.2). BE không trả số đơn đã kéo nên chỉ nêu phần bỏ qua; 0 hoặc vắng thì null
 */
export function openOrdersSkippedNote(setup: ShopSetupProgress | null | undefined): string | null {
  const skipped = setup?.openOrdersSkipped;
  if (!skipped || skipped <= 0) return null;
  return `Bỏ qua ${skipped} đơn đang xử lý cũ hơn; hàng của các đơn này chưa được tạm giữ`;
}
