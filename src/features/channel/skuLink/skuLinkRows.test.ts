import { describe, expect, it } from 'vitest';
import type { RemoteSkuRow, SkuLinkResult, SkuLinkSuggestion } from '@/types/setupDraft';
import { createItems, decisionCounts, isOpenSku, resultSummaryText, suggestionLinks, suggestionText } from './skuLinkRows';

const sug = (variantId: string, confidence: SkuLinkSuggestion['confidence'] = 'high'): SkuLinkSuggestion => ({
  variantId,
  sku: variantId.toUpperCase(),
  productName: 'Áo',
  match: confidence === 'high' ? 'sku' : 'name',
  score: confidence === 'high' ? null : 0.8,
  confidence,
});
const row = (id: string, over: Partial<RemoteSkuRow> = {}): RemoteSkuRow =>
  ({
    externalSkuId: id,
    sellerSku: id,
    title: 'Áo',
    variantLabel: null,
    matchedVariantId: null,
    canCreate: true,
    cannotCreateReason: null,
    decision: null,
    ...over,
  }) as RemoteSkuRow;

describe('skuLinkRows (FE#460)', () => {
  it('SKU mở: chưa liên kết, không chờ duyệt, không "không quản tồn"', () => {
    expect(isOpenSku(row('a'))).toBe(true);
    expect(isOpenSku(row('a', { matchedVariantId: 'v' }))).toBe(false);
    expect(isOpenSku(row('a', { mode: 'unmanaged' }))).toBe(false);
    expect(isOpenSku(row('a', { pendingMapping: {} as never }))).toBe(false);
  });

  it('gợi ý: chỉ high khi onlyHigh, bỏ SKU kho trùng hoặc đã chọn ở nơi khác', () => {
    const rows = [row('a', { suggestion: sug('v1') }), row('b', { suggestion: sug('v1') }), row('c', { suggestion: sug('v2', 'medium') }), row('d', { suggestion: sug('v3') })];
    expect(suggestionLinks(rows, { onlyHigh: true, taken: new Set(['v3']) })).toEqual([{ externalSkuId: 'a', action: 'link', variantId: 'v1' }]);
    expect(suggestionLinks(rows).map((r) => r.externalSkuId)).toEqual(['a', 'c', 'd']);
  });

  it('tạo SKU kho: chỉ SKU mở và tạo được', () => {
    expect(createItems([row('a'), row('b', { canCreate: false }), row('c', { matchedVariantId: 'v' })])).toEqual([{ externalSkuId: 'a', action: 'create', variantId: null }]);
  });

  it('đếm lựa chọn và phần chưa chọn', () => {
    const d = (action: 'link' | 'create' | 'skip') => ({ externalSkuId: action, action, variantId: null });
    expect(decisionCounts([d('link'), d('create'), d('skip')], 5)).toEqual({ link: 1, create: 1, skip: 1, unmanaged: 0, none: 2 });
  });

  it('câu gợi ý và câu kết quả', () => {
    expect(suggestionText(sug('v'))).toBe('Trùng SKU người bán');
    expect(suggestionText(sug('v', 'medium'))).toBe('Tên gần giống 80%');
    const r = (result: SkuLinkResult['result']): SkuLinkResult => ({ externalSkuId: 'x', result, variantId: null, productId: null, code: null, message: null });
    expect(resultSummaryText([r('linked'), r('created'), r('error')])).toBe('Đã liên kết 1 SKU, tạo 1 SKU kho, 1 SKU chưa xong, xem lý do ở từng dòng.');
    expect(resultSummaryText([])).toBe('Không có SKU nào thay đổi.');
  });
});
