import { describe, expect, it } from 'vitest';
import { countSourceOf, fillFromPlatform, nextEmpty, pageOf, sheetCounts, visibleRows, type SheetRow } from './stocktakeSheet';

const row = (patch: Partial<SheetRow>): SheetRow => ({
  sku: 'SKU',
  productName: 'Áo',
  attributesLabel: '',
  counted: '',
  book: 0,
  platformStock: null,
  countSource: null,
  ...patch,
});

const rows: SheetRow[] = [
  row({ sku: 'B-1', productName: 'Bình gốm', counted: '14', book: 0, platformStock: 14, countSource: 'manual' }),
  row({ sku: 'A-1', productName: 'Áo thun', counted: '', platformStock: 30 }),
  row({ sku: 'A-2', productName: 'Áo thun', attributesLabel: 'Đỏ, M', counted: '30', book: 30, platformStock: 30, countSource: 'platform' }),
  row({ sku: 'C-1', productName: 'Chậu', counted: '', platformStock: null }),
];

describe('stocktakeSheet (FE#468 bước 7)', () => {
  it('đếm theo bộ lọc: tất cả, chưa nhập, theo tồn sàn, có chênh lệch', () => {
    expect(sheetCounts(rows)).toEqual({ all: 4, empty: 2, platform: 1, diff: 1 });
  });

  it('gom theo sản phẩm, giữ thứ tự phiếu trong một sản phẩm', () => {
    expect(visibleRows(rows, 'all', '')).toEqual([1, 2, 0, 3]);
  });

  it('phiếu kiểm kho lập tay (group false): giữ thứ tự nhập, lọc và tìm vẫn chạy; Infinity là một trang', () => {
    expect(visibleRows(rows, 'all', '', { group: false })).toEqual([0, 1, 2, 3]);
    expect(visibleRows(rows, 'empty', '', { group: false })).toEqual([1, 3]);
    expect(visibleRows(rows, 'all', 'áo', { group: false })).toEqual([1, 2]);
    const idx = Array.from({ length: 200 }, (_, i) => i);
    expect(pageOf(idx, 3, Infinity)).toMatchObject({ page: 1, pages: 1, from: 1, to: 200 });
    expect(pageOf(idx, 1, Infinity).items).toHaveLength(200);
  });

  it('lọc và tìm theo SKU, tên, biến thể; tìm không dấu', () => {
    expect(visibleRows(rows, 'empty', '')).toEqual([1, 3]);
    expect(visibleRows(rows, 'all', 'binh')).toEqual([0]);
    expect(visibleRows(rows, 'all', 'do, m')).toEqual([2]);
    expect(visibleRows(rows, 'diff', 'áo')).toEqual([]);
  });

  it('chia trang 50 dòng, kẹp trang ngoài khoảng', () => {
    const idx = Array.from({ length: 120 }, (_, i) => i);
    expect(pageOf(idx, 1)).toMatchObject({ page: 1, pages: 3, from: 1, to: 50 });
    expect(pageOf(idx, 9)).toMatchObject({ page: 3, from: 101, to: 120 });
    expect(pageOf([], 1)).toMatchObject({ page: 1, pages: 1, from: 0, to: 0, items: [] });
  });

  it('dòng trống kế theo thứ tự đang hiện, vòng lại đầu, hết thì null', () => {
    const order = visibleRows(rows, 'all', '');
    expect(nextEmpty(rows, order, null)).toBe(1);
    expect(nextEmpty(rows, order, 1)).toBe(3);
    expect(nextEmpty(rows, order, 3)).toBe(1);
    expect(nextEmpty(rows.map((r) => ({ ...r, counted: '1' })), order, null)).toBeNull();
  });

  it('điền theo tồn sàn chỉ dòng trống có tồn sàn, không đè số đã đếm', () => {
    expect(fillFromPlatform(rows)).toEqual([{ index: 1, value: 30 }]);
  });

  it('nguồn số đếm: trống là null, gõ đè là manual, giữ platform khi số còn khớp', () => {
    expect(countSourceOf({ counted: '', platformStock: 3, countSource: 'platform' })).toBeNull();
    expect(countSourceOf({ counted: '30', platformStock: 30, countSource: 'platform' })).toBe('platform');
    expect(countSourceOf({ counted: '29', platformStock: 30, countSource: 'platform' })).toBe('manual');
    expect(countSourceOf({ counted: '30', platformStock: 30, countSource: null })).toBe('manual');
  });
});
