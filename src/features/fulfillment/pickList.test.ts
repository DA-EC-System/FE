import { describe, expect, it } from 'vitest';
import type { FulfillmentLine } from '@/types/fulfillment';
import { buildPickList } from './pickList';

const line = (variantId: string | null, sku: string, quantity: number): FulfillmentLine => ({
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
    expect(list.items.map((l) => [l.sku, l.quantity, l.packageCount])).toEqual([
      ['A-01', 1, 1],
      ['B-01', 4, 3],
      ['C-01', 1, 1],
    ]);
  });

  it('một kiện có hai dòng cùng biến thể chỉ đếm một kiện', () => {
    const [row] = buildPickList([{ lines: [line('v1', 'A', 1), line('v1', 'A', 2)] }]).items;
    expect(row).toMatchObject({ quantity: 3, packageCount: 1 });
  });

  it('gộp theo SKU khi chưa ghép, báo giới hạn theo số kiện', () => {
    const packages = [{ lines: [line(null, 'A', 1), line(null, 'A', 2), line(null, 'B', 1)] }, { lines: [line(null, 'A', 1)] }];
    expect(buildPickList(packages, 1)).toMatchObject({
      items: [{ variantId: null, sku: 'A', quantity: 3, packageCount: 1 }, { variantId: null, sku: 'B', quantity: 1, packageCount: 1 }],
      packageCount: 1, truncated: true,
    });
  });

  it('không có kiện ra danh sách rỗng', () => {
    expect(buildPickList([])).toEqual({ items: [], packageCount: 0, truncated: false });
  });
});
