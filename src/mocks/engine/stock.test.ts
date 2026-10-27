import { describe, expect, it } from 'vitest';
import {
  allocate,
  availableOf,
  needsReorder,
  reclaim,
  reserveWhole,
  shortageOf,
  stockState,
  violations,
  type Hold,
  type StockNumbers,
} from './stock';

const n = (patch: Partial<StockNumbers> = {}): StockNumbers => ({
  onHand: 0,
  reserved: 0,
  locked: 0,
  quarantine: 0,
  incoming: 0,
  ...patch,
});
const hold = (id: string, lines: [string, number][], patch: Partial<Hold> = {}): Hold => ({
  id,
  lines: lines.map(([variantId, qty]) => ({ variantId, qty })),
  createdAt: `2026-10-0${id.slice(-1)}T00:00:00.000Z`,
  ...patch,
});

describe('con số tồn', () => {
  it('khả dụng = tồn thực − đang giữ − tạm khoá, không âm', () => {
    expect(availableOf(n({ onHand: 10, reserved: 3, locked: 2 }))).toBe(5);
    expect(availableOf(n({ onHand: 2, reserved: 3 }))).toBe(0);
  });

  it('bất biến', () => {
    expect(violations(n({ onHand: 5, reserved: 5 }))).toEqual([]);
    expect(violations(n({ onHand: -1 }))).toContain('negative_on_hand');
    expect(violations(n({ onHand: 2, reserved: 3 }))).toEqual(['reserved_over_on_hand']);
    expect(violations(n({ quarantine: -1, incoming: -2 }))).toEqual(['negative_quarantine', 'negative_incoming']);
  });

  it('nhãn và gợi ý nhập lại', () => {
    expect(stockState(0, 5)).toBe('out');
    expect(stockState(5, 5)).toBe('low');
    expect(stockState(6, 5)).toBe('in_stock');
    expect(stockState(3, null)).toBe('in_stock');
    // khả dụng 4 + đang về 3 − đang thiếu 2 = 5 ≤ ngưỡng 5
    expect(needsReorder(n({ onHand: 4, incoming: 3 }), 2, 5)).toBe(true);
    expect(needsReorder(n({ onHand: 4, incoming: 4 }), 2, 5)).toBe(false);
    expect(shortageOf(n({ onHand: 3 }), 5)).toBe(2);
  });
});

describe('giữ hàng', () => {
  it('giữ nguyên kiện: thiếu một dòng thì không giữ dòng nào', () => {
    const levels = new Map([
      ['a', n({ onHand: 5 })],
      ['b', n({ onHand: 1 })],
    ]);
    expect(reserveWhole(levels, hold('k1', [['a', 2], ['b', 2]]))).toBe(false);
    expect(levels.get('a')!.reserved).toBe(0);
    expect(reserveWhole(levels, hold('k2', [['a', 2], ['b', 1]]))).toBe(true);
    expect(levels.get('a')!.reserved).toBe(2);
    expect(levels.get('b')!.reserved).toBe(1);
  });

  it('chia hàng cho kiện thiếu: hạn sớm trước, kiện không đủ thì bỏ qua', () => {
    const levels = new Map([['a', n({ onHand: 5 })]]);
    const got = allocate(levels, [
      hold('k1', [['a', 3]], { dueAt: '2026-10-20' }),
      hold('k2', [['a', 4]], { dueAt: '2026-10-10' }),
      hold('k3', [['a', 1]], { dueAt: '2026-10-25' }),
    ]);
    expect(got.map((h) => h.id)).toEqual(['k2', 'k3']);
    expect(levels.get('a')!.reserved).toBe(5);
  });

  it('lấy lại phần giữ: đơn chưa thanh toán trước, giữ sau cùng trước, bỏ kiện đã đóng', () => {
    const levels = new Map([['a', n({ onHand: 2, reserved: 6 })]]);
    const taken = reclaim(levels, 'a', [
      hold('k1', [['a', 2]], { unpaid: true }),
      hold('k2', [['a', 2]]),
      hold('k3', [['a', 1]]),
      hold('k4', [['a', 1]], { packed: true }),
    ]);
    expect(taken.map((h) => h.id)).toEqual(['k1', 'k3', 'k2']);
    expect(levels.get('a')!.reserved).toBe(1);
  });
});
