/**
 * Hàm thuần của danh sách Liên kết SKU sàn (Documents/21 §18.12, FE#460): chọn dòng cho thao tác hàng loạt, đếm lựa chọn
 * trong nháp, tóm tắt kết quả áp.
 */

import type { Decision, DecisionAction, RemoteProduct, RemoteSkuRow, SkuLinkInput, SkuLinkResult, SkuLinkSuggestion } from '@/types/setupDraft';

/** SKU sàn còn chờ người xử lý: chưa liên kết, không "không quản tồn", không chờ CEO duyệt */
export const isOpenSku = (r: Pick<RemoteSkuRow, 'matchedVariantId' | 'mode' | 'pendingMapping'>): boolean =>
  !r.matchedVariantId && !r.mode && !r.pendingMapping;

export const CONFIDENCE_LABELS: Record<SkuLinkSuggestion['confidence'], string> = {
  high: 'Chắc chắn',
  medium: 'Khá giống',
  low: 'Ít giống',
};

/** Nhãn lựa chọn trong nháp, dùng cho ô lọc và bộ đếm */
export const DECISION_LABELS: Record<DecisionAction, string> = {
  link: 'Liên kết SKU kho có sẵn',
  create: 'Tạo SKU kho mới',
  skip: 'Bỏ qua',
  unmanaged: 'Không quản tồn',
};

/** Câu ngắn của gợi ý: trùng SKU người bán, hoặc tên gần giống kèm phần trăm */
export function suggestionText(s: Pick<SkuLinkSuggestion, 'match' | 'score'>): string {
  if (s.match === 'sku') return 'Trùng SKU người bán';
  return s.score === null ? 'Tên gần giống' : `Tên gần giống ${Math.round(s.score * 100)}%`;
}

/**
 * Dòng "liên kết theo gợi ý" từ các SKU cho trước: chỉ SKU còn mở có gợi ý (`onlyHigh` thì chỉ `high`). Hai SKU sàn cùng
 * trỏ một SKU kho thì giữ dòng đầu, dòng sau để người bán chọn tay. `taken`: SKU kho đã được chọn ở nơi khác (nháp)
 */
export function suggestionLinks(
  rows: readonly RemoteSkuRow[],
  { onlyHigh = false, taken = new Set<string>() }: { onlyHigh?: boolean; taken?: ReadonlySet<string> } = {},
): SkuLinkInput[] {
  const used = new Set(taken);
  const out: SkuLinkInput[] = [];
  for (const r of rows) {
    const s = r.suggestion;
    if (!s || !isOpenSku(r) || used.has(s.variantId) || (onlyHigh && s.confidence !== 'high')) continue;
    used.add(s.variantId);
    out.push({ externalSkuId: r.externalSkuId, action: 'link', variantId: s.variantId });
  }
  return out;
}

/** Dòng "tạo SKU kho" từ các SKU cho trước: SKU còn mở và tạo được. Giữ thứ tự để SKU cùng sản phẩm sàn liền nhau */
export function createItems(rows: readonly RemoteSkuRow[]): SkuLinkInput[] {
  return rows.filter((r) => isOpenSku(r) && r.canCreate).map((r) => ({ externalSkuId: r.externalSkuId, action: 'create', variantId: null }));
}

/** Số SKU theo lựa chọn trong nháp; `total` là số SKU chưa liên kết của gian hàng, phần còn lại là "chưa chọn" */
export function decisionCounts(decisions: readonly Decision[], total: number): Record<DecisionAction | 'none', number> {
  const out = { link: 0, create: 0, skip: 0, unmanaged: 0, none: 0 };
  for (const d of decisions) out[d.action] += 1;
  out.none = Math.max(0, total - decisions.length);
  return out;
}

/** Câu báo sau khi áp (gian hàng đang bán) */
export function resultSummaryText(results: readonly SkuLinkResult[]): string {
  const n = (r: SkuLinkResult['result']) => results.filter((x) => x.result === r).length;
  const parts: string[] = [];
  if (n('linked')) parts.push(`Đã liên kết ${n('linked')} SKU`);
  if (n('created')) parts.push(`${parts.length ? 'tạo' : 'Đã tạo'} ${n('created')} SKU kho`);
  if (n('pending')) parts.push(`${n('pending')} SKU chờ CEO duyệt`);
  if (n('error')) parts.push(`${n('error')} SKU chưa xong, xem lý do ở từng dòng`);
  return parts.length ? `${parts.join(', ')}.` : 'Không có SKU nào thay đổi.';
}

/** Cỡ trang mặc định (sản phẩm sàn); trang gian hàng hỏi cùng tham số để đếm tab dùng chung cache với trang đầu */
export const SKU_LINK_PAGE_SIZE = 20;

/** Mọi SKU của các sản phẩm, theo thứ tự trang */
export const allSkus = (products: readonly RemoteProduct[]): RemoteSkuRow[] => products.flatMap((p) => p.skus);
