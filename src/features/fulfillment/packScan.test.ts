import { describe, expect, it } from 'vitest';
import { expectedScans, matchScan, packPayload, scanProgress, scannedOfLine } from './packScan';

const line = (id: string, variantId: string | null, sku: string, quantity: number, extra: { untracked?: boolean; externalSku?: string | null } = {}) => ({
  id,
  variantId,
  sku,
  quantity,
  untracked: extra.untracked ?? false,
  externalSku: extra.externalSku ?? null,
});

// Dòng đã ghép: SKU app khác SKU sàn (TRA-B01); hai dòng không quản tồn cùng SKU sàn (KH-B06); một dòng chưa ghép.
const lines = [
  line('l1', 'v1', 'AO-DO-M', 2, { externalSku: 'SAN-AO-DO' }),
  line('u1', null, 'QUA-TANG', 1, { untracked: true, externalSku: 'QUA-TANG' }),
  line('u2', null, 'QUA-TANG', 1, { untracked: true, externalSku: 'QUA-TANG' }),
  line('x1', null, 'CHUA-GHEP', 1, { externalSku: 'CHUA-GHEP' }),
];

describe('quét đóng gói', () => {
  it('đếm biến thể và từng dòng không quản tồn, bỏ dòng chưa ghép', () => {
    expect([...expectedScans(lines)]).toEqual([['variant:v1', 2], ['line:u1', 1], ['line:u2', 1]]);
  });

  it('khớp SKU biến thể app trước, không phân biệt hoa thường', () => {
    expect(matchScan(lines, {}, ' ao-do-m ')).toMatchObject({ kind: 'ok', key: 'variant:v1' });
  });

  it('khớp SKU sàn khi không có SKU app trùng', () => {
    expect(matchScan(lines, {}, 'SAN-AO-DO')).toMatchObject({ kind: 'ok', key: 'variant:v1' });
  });

  it('SKU trùng nhiều dòng không quản tồn: lấy dòng đầu chưa đủ, đủ hết thì báo đủ', () => {
    expect(matchScan(lines, { 'line:u1': 1 }, 'QUA-TANG')).toMatchObject({ kind: 'ok', key: 'line:u2' });
    expect(matchScan(lines, { 'line:u1': 1, 'line:u2': 1 }, 'QUA-TANG')).toMatchObject({ kind: 'full', quantity: 1 });
  });

  it('dòng chưa ghép không quét được, mã lạ báo không có', () => {
    expect(matchScan(lines, {}, 'CHUA-GHEP')).toMatchObject({ kind: 'unmapped' });
    expect(matchScan(lines, {}, 'KHONG-CO')).toEqual({ kind: 'not_found' });
    expect(matchScan(lines, {}, '  ')).toEqual({ kind: 'not_found' });
  });

  it('chỉ đủ khi mọi dòng gồm cả không quản tồn đã đủ', () => {
    expect(scanProgress(lines, { 'variant:v1': 2 })).toEqual({ total: 4, scanned: 2, complete: false, percent: 50 });
    expect(scanProgress(lines, { 'variant:v1': 2, 'line:u1': 1, 'line:u2': 1 })).toMatchObject({ complete: true, percent: 100 });
    expect(scanProgress([lines[3]!], {})).toEqual({ total: 0, scanned: 0, complete: true, percent: 100 });
  });

  it('số trên từng dòng chia theo thứ tự dòng cùng biến thể', () => {
    const same = [line('a', 'v1', 'A', 2), line('b', 'v1', 'A', 1), line('c', null, 'C', 1)];
    expect([0, 1, 2].map((i) => scannedOfLine(same, { 'variant:v1': 3 }, i))).toEqual([2, 1, null]);
    expect([0, 1].map((i) => scannedOfLine(same, { 'variant:v1': 1 }, i))).toEqual([1, 0]);
  });

  it('thân lệnh pack tách lines theo biến thể và untrackedLines theo id dòng', () => {
    expect(packPayload(lines, { 'variant:v1': 2, 'line:u1': 1 })).toEqual({
      lines: [{ variantId: 'v1', quantity: 2 }],
      untrackedLines: [{ lineId: 'u1', quantity: 1 }],
    });
  });
});
