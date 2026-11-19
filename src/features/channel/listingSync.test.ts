import { describe, expect, it } from 'vitest';
import { formatDateTime } from '@/utils/format';
import { priceText } from '@/utils/price';
import type { SyncError, SyncState } from '@/types/shop';
import { stockDriftLabel, syncLine } from './listingSync';

const AT = '2026-11-18T08:30:00Z';
const ERR: SyncError = { code: 'marketplace_rejected', message: 'Sàn từ chối', at: AT };

const l = (
  priceSync: SyncState,
  stockSync: SyncState,
  extra: { lastPushedAt?: string | null; stockSyncError?: SyncError | null } = {},
) => ({
  lastPushedAt: AT,
  lastPushedPrice: 150000,
  priceSync,
  stockSync,
  stockSyncError: null,
  ...extra,
});

describe('syncLine (FE#312)', () => {
  it('chưa đẩy lần nào: chờ đẩy giá, tồn lần đầu', () => {
    expect(syncLine(l('pending', 'pending', { lastPushedAt: null }))).toBe('Chờ đẩy giá, tồn lần đầu');
    expect(syncLine(l('synced', 'synced', { lastPushedAt: null }))).toBe('Chờ đẩy giá, tồn lần đầu');
  });

  it('giá và tồn cùng chờ: một câu kèm giá trên sàn', () => {
    expect(syncLine(l('pending', 'pending'))).toBe(`Chờ đẩy giá (sàn ${priceText(150000)}) và tồn`);
  });

  it('chỉ giá chờ: giá mới, trên sàn giá cũ', () => {
    expect(syncLine(l('pending', 'synced'))).toBe(`Chờ đẩy giá mới, trên sàn ${priceText(150000)}`);
  });

  it('chỉ tồn chờ: kèm lần đẩy cuối', () => {
    expect(syncLine(l('synced', 'pending'))).toBe(`Chờ đẩy tồn · Đẩy lần cuối ${formatDateTime(AT)}`);
  });

  it('đã đồng bộ cả hai: đã đẩy lúc nào', () => {
    expect(syncLine(l('synced', 'synced'))).toBe(`Đã đẩy ${formatDateTime(AT)}`);
  });

  it('Lệch tồn hoặc đẩy tồn lỗi đã có nhãn riêng: câu không nhắc tồn', () => {
    expect(syncLine(l('synced', 'pending', { stockSyncError: ERR }))).toBe(`Đã đẩy ${formatDateTime(AT)}`);
    expect(syncLine(l('pending', 'pending', { stockSyncError: ERR }))).toBe(`Chờ đẩy giá mới, trên sàn ${priceText(150000)}`);
    expect(syncLine(l('synced', 'error'))).toBe(`Đã đẩy ${formatDateTime(AT)}`);
  });
});

describe('stockDriftLabel', () => {
  it('nêu số trên sàn khi có', () => {
    expect(stockDriftLabel(12)).toBe('Lệch tồn: sàn 12');
    expect(stockDriftLabel(null)).toBe('Lệch tồn');
  });
});
