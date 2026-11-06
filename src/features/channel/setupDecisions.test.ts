import { describe, expect, it } from 'vitest';
import type { SetupSuggestion, Shop } from '@/types/shop';
import { decisionErrors, initialChoices, setupRunning, toDecisions } from './setupDecisions';

const row = (externalSkuId: string, over: Partial<SetupSuggestion> = {}): SetupSuggestion => ({
  externalSkuId,
  title: `SP ${externalSkuId}`,
  match: 'sku',
  score: null,
  variantId: `var-${externalSkuId}`,
  sku: `SKU-${externalSkuId}`,
  available: 5,
  platformStock: 5,
  ...over,
});

describe('Bước 1 thiết lập: quyết định từng SKU sàn (§18.7.5)', () => {
  it('chỉ chọn sẵn dòng có variantId, mỗi biến thể một dòng', () => {
    const list = [
      row('a'),
      row('b', { match: 'name', score: 0.62, variantId: 'var-a', sku: 'SKU-a' }),
      row('c', { match: 'none', variantId: null, sku: null, available: null }),
    ];
    const c = initialChoices(list);
    expect(c.a).toEqual({ variantId: 'var-a', sku: 'SKU-a', available: 5, picked: false });
    expect(c.b).toBeNull();
    expect(c.c).toBeNull();
  });

  it('gửi một quyết định cho mọi SKU trong suggestions, bỏ qua là variantId null', () => {
    const list = [row('a'), row('b'), row('c', { match: 'none', variantId: null, sku: null, available: null })];
    const c = initialChoices(list);
    c.b = { variantId: 'var-khac', sku: 'KHAC', available: 2, picked: true };
    expect(toDecisions(list, c)).toEqual([
      { externalSkuId: 'a', variantId: 'var-a' },
      { externalSkuId: 'b', variantId: 'var-khac' },
      { externalSkuId: 'c', variantId: null },
    ]);
  });

  it('lỗi decisions.<i> gắn về đúng dòng', () => {
    const list = [row('a'), row('b')];
    expect(decisionErrors(list, { 'decisions.1': 'Biến thể đã ghép ở dòng khác', openingStock: 'x' })).toEqual({
      b: 'Biến thể đã ghép ở dòng khác',
    });
    expect(decisionErrors(list, undefined)).toEqual({});
  });
});

describe('Tiến độ thiết lập (§18.7.7)', () => {
  it('còn bước running thì còn đọc lại', () => {
    const shop = (status: 'running' | 'done' | 'blocked') =>
      ({ setup: { steps: [{ key: 'push_stock', status, blockedBy: null }], unmatchedCount: 0 } }) as unknown as Shop;
    expect(setupRunning(shop('running'))).toBe(true);
    expect(setupRunning(shop('blocked'))).toBe(false);
    expect(setupRunning({ setup: null } as unknown as Shop)).toBe(false);
    expect(setupRunning(undefined)).toBe(false);
  });
});
