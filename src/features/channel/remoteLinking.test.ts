import { describe, expect, it } from 'vitest';
import type { MatchBulkResult, RemoteSku } from '@/types/shop';
import { bulkPairs, bulkSummary, bulkSummaryText, isOpenRemote, suggestionLabel } from './remoteLinking';

const remote = (over: Partial<RemoteSku> = {}): RemoteSku => ({
  externalProductId: 'p',
  externalSkuId: 'x1',
  title: 'Áo thun đen M',
  sellerSku: 'AO-1',
  matchedVariantId: null,
  mode: null,
  listingId: null,
  listingVersion: null,
  pendingMapping: null,
  suggestion: { variantId: 'v1', sku: 'AO-1', productName: 'Áo thun', match: 'sku', score: null },
  canCreate: false,
  cannotCreateReason: 'sku_taken',
  ...over,
});

describe('bulkPairs: chỉ gom gợi ý trùng mã SKU (§18.9 R2)', () => {
  it('bỏ gợi ý theo tên, dòng không có gợi ý, dòng đã liên kết hoặc chờ duyệt', () => {
    const rows = [
      remote(),
      remote({ externalSkuId: 'x2', suggestion: { variantId: 'v2', sku: 'B', productName: 'B', match: 'name', score: 0.8 } }),
      remote({ externalSkuId: 'x3', suggestion: null }),
      remote({ externalSkuId: 'x4', matchedVariantId: 'v9', suggestion: { variantId: 'v4', sku: 'C', productName: 'C', match: 'sku', score: null } }),
      remote({ externalSkuId: 'x5', pendingMapping: {} as RemoteSku['pendingMapping'] }),
    ];
    expect(bulkPairs(rows)).toEqual([{ externalSkuId: 'x1', variantId: 'v1' }]);
  });
  it('hai SKU sàn trỏ cùng SKU kho thì chỉ giữ cặp đầu; SKU kho đã chọn trong phiên thì bỏ', () => {
    const rows = [remote(), remote({ externalSkuId: 'x2' })];
    expect(bulkPairs(rows)).toEqual([{ externalSkuId: 'x1', variantId: 'v1' }]);
    expect(bulkPairs(rows, new Set(['v1']))).toEqual([]);
  });
});

describe('bulkSummary', () => {
  const r = (outcome: MatchBulkResult['outcome']): MatchBulkResult => ({
    externalSkuId: 'x',
    variantId: 'v',
    outcome,
    code: outcome === 'failed' ? 'mapping_pending' : null,
    message: null,
  });
  it('đếm theo kết quả từng cặp và ra câu báo', () => {
    const s = bulkSummary([r('matched'), r('matched'), r('pending'), r('failed')]);
    expect(s.matched).toBe(2);
    expect(s.pending).toBe(1);
    expect(s.failed).toHaveLength(1);
    expect(bulkSummaryText(s)).toBe('Đã liên kết 2 cặp, 1 cặp chờ CEO duyệt, 1 cặp chưa liên kết được.');
    expect(bulkSummaryText(bulkSummary([r('matched')]))).toBe('Đã liên kết 1 cặp.');
  });
});

describe('suggestionLabel, isOpenRemote', () => {
  it('nhãn gợi ý', () => {
    expect(suggestionLabel({ match: 'sku', score: null })).toBe('Trùng mã SKU');
    expect(suggestionLabel({ match: 'name', score: 0.824 })).toBe('Tên gần giống 82%');
  });
  it('dòng "không quản tồn" không còn mở', () => {
    expect(isOpenRemote(remote({ mode: 'unmanaged' }))).toBe(false);
    expect(isOpenRemote(remote())).toBe(true);
  });
});
