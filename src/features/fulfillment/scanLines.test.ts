import { describe, expect, it } from 'vitest';
import { addScan, scanRowsFrom } from './scanLines';

const line = (variantId: string, sku: string, quantity: number) => ({ variantId, sku, productName: 'Áo', attributesLabel: '', quantity });

describe('scanRowsFrom', () => {
  it('mặc định số quét bằng dự kiến, gộp theo biến thể; fromZero thì bắt đầu từ 0 (#363)', () => {
    const lines = [line('v1', 'A-1', 2), line('v1', 'A-1', 1), line('v2', 'A-2', 1)];
    expect(scanRowsFrom(lines).map((r) => [r.sku, r.expected, r.quantity])).toEqual([
      ['A-1', 3, '3'],
      ['A-2', 1, '1'],
    ]);
    expect(scanRowsFrom(lines, { fromZero: true }).map((r) => [r.sku, r.expected, r.quantity])).toEqual([
      ['A-1', 3, '0'],
      ['A-2', 1, '0'],
    ]);
  });
});

describe('addScan', () => {
  const rows = scanRowsFrom([line('v1', 'A-1', 2), line('v2', 'A-2', 1)], { fromZero: true });

  it('quét SKU (không phân biệt hoa thường, bỏ khoảng trắng) thì dòng đó cộng 1', () => {
    const once = addScan(rows, ' a-1 ')!;
    expect(once.map((r) => r.quantity)).toEqual(['1', '0']);
    expect(addScan(once, 'A-1')!.map((r) => r.quantity)).toEqual(['2', '0']);
  });

  it('ô đang sai thì tính từ 0; SKU không có hoặc rỗng thì null', () => {
    expect(addScan([{ ...rows[0]!, quantity: 'x' }], 'A-1')![0]!.quantity).toBe('1');
    expect(addScan(rows, 'B-9')).toBeNull();
    expect(addScan(rows, '  ')).toBeNull();
  });
});
