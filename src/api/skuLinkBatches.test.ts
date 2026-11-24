import { describe, expect, it } from 'vitest';
import type { SkuLinkInput } from '@/types/setupDraft';
import { skuLinkBatches } from './setupDraft.api';

const items = (product: string, n: number): SkuLinkInput[] =>
  Array.from({ length: n }, (_, i) => ({ externalSkuId: `${product}-${i}`, action: 'create', variantId: null }));
const productOf = (id: string) => id.split('-')[0];

describe('skuLinkBatches (FE#460)', () => {
  it('không cắt ngang sản phẩm sàn; lô tối đa 200', () => {
    const batches = skuLinkBatches([...items('a', 150), ...items('b', 100), ...items('c', 50)], productOf);
    expect(batches.map((b) => b.length)).toEqual([150, 150]);
    expect(new Set(batches[0]!.map((i) => productOf(i.externalSkuId)))).toEqual(new Set(['a']));
  });

  it('sản phẩm hơn 200 SKU mới bị cắt', () => {
    expect(skuLinkBatches(items('a', 450), productOf).map((b) => b.length)).toEqual([200, 200, 50]);
  });
});
