/**
 * Hàm thuần của tab "Chưa liên kết" (Documents/29 bước 5, Documents/21 §18.9 R2, R4): cặp liên kết hàng loạt, tóm tắt kết
 * quả, nhãn trường điền ngược.
 */

import type { FillBackField, MatchBulkPair, MatchBulkResult, RemoteSku } from '@/types/shop';

/** SKU sàn còn chờ người xử lý: chưa liên kết, không "không quản tồn", không chờ duyệt */
export const isOpenRemote = (r: Pick<RemoteSku, 'matchedVariantId' | 'mode' | 'pendingMapping'>): boolean =>
  !r.matchedVariantId && !r.mode && !r.pendingMapping;

/**
 * Cặp gom sẵn cho "Liên kết N cặp trùng mã SKU": chỉ gợi ý `match: 'sku'` (§18.9 R2: gợi ý theo tên không gom). Hai SKU sàn
 * cùng trỏ một SKU kho thì chỉ giữ cặp đầu, cặp sau để người bán chọn tay, tránh liên kết trùng. `taken`: SKU kho đã chọn
 * trong phiên mà chưa gửi
 */
export function bulkPairs(rows: readonly RemoteSku[], taken: ReadonlySet<string> = new Set()): MatchBulkPair[] {
  const used = new Set(taken);
  const out: MatchBulkPair[] = [];
  for (const r of rows) {
    const s = r.suggestion;
    if (!s || s.match !== 'sku' || !isOpenRemote(r) || used.has(s.variantId)) continue;
    used.add(s.variantId);
    out.push({ externalSkuId: r.externalSkuId, variantId: s.variantId });
  }
  return out;
}

export interface BulkSummary {
  matched: number;
  pending: number;
  failed: MatchBulkResult[];
}

export function bulkSummary(results: readonly MatchBulkResult[]): BulkSummary {
  return {
    matched: results.filter((r) => r.outcome === 'matched').length,
    pending: results.filter((r) => r.outcome === 'pending').length,
    failed: results.filter((r) => r.outcome === 'failed'),
  };
}

/** Câu báo sau khi liên kết hàng loạt */
export function bulkSummaryText(s: BulkSummary): string {
  const parts = [`Đã liên kết ${s.matched} cặp`];
  if (s.pending) parts.push(`${s.pending} cặp chờ CEO duyệt`);
  if (s.failed.length) parts.push(`${s.failed.length} cặp chưa liên kết được`);
  return parts.join(', ') + '.';
}

/** Nhãn gợi ý: trùng mã SKU, hoặc tên gần giống kèm phần trăm */
export function suggestionLabel(s: { match: 'sku' | 'name'; score: number | null }): string {
  if (s.match === 'sku') return 'Trùng mã SKU';
  return s.score === null ? 'Tên gần giống' : `Tên gần giống ${Math.round(s.score * 100)}%`;
}

/** Nhãn trường điền ngược (§18.9 R4: nhãn do FE giữ) */
export const FILL_BACK_LABELS: Record<FillBackField, string> = {
  originCountry: 'Xuất xứ',
  brand: 'Thương hiệu',
  description: 'Mô tả',
  weight: 'Cân nặng',
  dimensions: 'Kích thước',
  platformSpec: 'Category và attribute của sàn',
};
