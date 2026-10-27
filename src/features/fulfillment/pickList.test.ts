import { describe, expect, it } from 'vitest';
import type { FulfillmentLine } from '@/types/fulfillment';
import { buildPickList } from './pickList';

const line = (variantId: string, sku: string, quantity: number): FulfillmentLine => ({
  variantId,
  sku,
  productName: `SP ${sku}`,
  attributesLabel: '',
  quantity,
});

describe('buildPickList (FE#59)', () => {
  it('gộp theo biến thể, cộng số lượng, đếm số kiện, sắp theo SKU', () => {
    const list = buildPickList([
      { lines: [line('v1', 'B-01', 1), line('v2', 'A-01', 1)] },
      { lines: [line('v1', 'B-01', 2)] },
      { lines: [line('v1', 'B-01', 1), line('v3', 'C-01', 1)] },
    ]);
    expect(list.map((l) => [l.sku, l.quantity, l.packageCount])).toEqual([
      ['A-01', 1, 1],
      ['B-01', 4, 3],
      ['C-01', 1, 1],
    ]);
  });

  it('một kiện có hai dòng cùng biến thể chỉ đếm một kiện', () => {
    const [row] = buildPickList([{ lines: [line('v1', 'A', 1), line('v1', 'A', 2)] }]);
    expect(row).toMatchObject({ quantity: 3, packageCount: 1 });
  });

  it('không có kiện ra danh sách rỗng', () => {
    expect(buildPickList([])).toEqual([]);
  });
});
