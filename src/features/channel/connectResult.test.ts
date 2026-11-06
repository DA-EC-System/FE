import { describe, expect, it } from 'vitest';
import type { Shop, ShopCallbackResult, ShopConnectionResult, ShopStatus } from '@/types/shop';
import { connectedOutcome, firstConnection, reconnectSummary, remoteSkuSuffix, remoteSkuValue } from './connectResult';

const shop = { id: 'shp-x', shopName: 'Shop thử', status: 'active' } as Shop;
const connecting = { ...shop, status: 'connecting' } as Shop;

const item = (over: Partial<ShopConnectionResult> = {}): ShopConnectionResult => ({
  shop,
  created: false,
  reconnect: null,
  previousStatus: 'active',
  remoteSkuCount: 0,
  ...over,
});
/** Gốc response không có previousStatus, remoteSkuCount (§18.7.4) */
const wrap = (...items: ShopConnectionResult[]): ShopCallbackResult => ({
  shop: items[0].shop,
  created: items[0].created,
  reconnect: items[0].reconnect,
  shops: items,
});
const before = (previousStatus: ShopStatus | null) => wrap(item({ previousStatus }));

describe('connectedOutcome', () => {
  it('nhiều gian hàng là multiple, kiểm trước created', () => {
    const fresh = item({ shop: connecting, created: true, previousStatus: null });
    expect(connectedOutcome(wrap(fresh, fresh))).toBe('multiple');
  });

  it('created là connected', () => {
    expect(connectedOutcome(wrap(item({ shop: connecting, created: true, previousStatus: null })))).toBe('connected');
  });

  it('created false thì là đã có, kể cả gian hàng còn đang thiết lập', () => {
    expect(connectedOutcome(before('active'))).toBe('already_connected');
    expect(connectedOutcome(wrap(item({ shop: connecting, previousStatus: 'connecting' })))).toBe('already_connected');
  });

  it('trước đó mất quyền hoặc đã ngắt là nối lại', () => {
    expect(connectedOutcome(before('needs_reauth'))).toBe('reconnected');
    expect(connectedOutcome(before('disconnected'))).toBe('reconnected');
  });

  it('đọc previousStatus trong shops[], không đọc ở gốc', () => {
    const root = { ...before('needs_reauth'), previousStatus: 'active' } as ShopCallbackResult;
    expect(connectedOutcome(root)).toBe('reconnected');
    expect(firstConnection(wrap(item({ remoteSkuCount: 7 }))).remoteSkuCount).toBe(7);
  });
});

describe('reconnectSummary', () => {
  it('kể việc đã bù, bỏ phần bằng 0', () => {
    expect(reconnectSummary({ jobsRun: 3, relisted: 0, pulledFrom: null })).toEqual(['chạy 3 việc đang chờ']);
    expect(reconnectSummary({ jobsRun: 0, relisted: 2, pulledFrom: null })).toEqual(['đưa lại 2 listing lên sàn']);
  });

  it('không có phần bù thì rỗng', () => {
    expect(reconnectSummary(null)).toEqual([]);
  });
});

describe('remoteSkuCount khi BE chưa trả (phần 18.7 còn lại)', () => {
  it('có số thì hiện số, kể cả 0', () => {
    expect(remoteSkuSuffix(12)).toBe(' · 12 SKU trên sàn');
    expect(remoteSkuSuffix(0)).toBe(' · 0 SKU trên sàn');
    expect(remoteSkuValue(0)).toBe('0');
  });

  it('vắng hoặc null thì bỏ cụm SKU và ô hiện "—"', () => {
    expect(remoteSkuSuffix(undefined)).toBe('');
    expect(remoteSkuSuffix(null)).toBe('');
    expect(remoteSkuValue(undefined)).toBe('—');
    expect(remoteSkuValue(null)).toBe('—');
  });

  it('thiếu previousStatus thì coi là đã có, không phải nối lại', () => {
    const { previousStatus: _omit, ...rest } = item();
    expect(connectedOutcome(wrap(rest as ShopConnectionResult))).toBe('already_connected');
  });
});
