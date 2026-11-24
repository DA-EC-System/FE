import { describe, expect, it } from 'vitest';
import type { Shop } from '@/types/shop';
import { openOrdersSkippedNote, setupRunning } from './setupDecisions';

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

describe('Đơn còn mở bỏ qua vì trần môi trường (Shop.setup.openOrdersSkipped)', () => {
  const setup = (openOrdersSkipped?: number) => ({ steps: [], unmatchedCount: 0, openOrdersSkipped });

  it('có đơn bỏ qua thì nêu số', () => {
    expect(openOrdersSkippedNote(setup(3500))).toBe(
      'Bỏ qua 3500 đơn đang xử lý cũ hơn; hàng của các đơn này chưa được tạm giữ',
    );
  });

  it('0, vắng (BE trước #198) hoặc setup null thì không có câu', () => {
    expect(openOrdersSkippedNote(setup(0))).toBeNull();
    expect(openOrdersSkippedNote(setup(undefined))).toBeNull();
    expect(openOrdersSkippedNote(null)).toBeNull();
  });
});
