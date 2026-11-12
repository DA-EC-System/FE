import { describe, expect, it } from 'vitest';
import type { Shop, ShopCallbackResult, ShopConnectionResult, ShopStatus } from '@/types/shop';
import {
  connectedOutcome,
  firstConnection,
  reconnectSummary,
  remoteCountsSuffix,
  remoteCountsText,
  remoteCountsValue,
} from './connectResult';

const shop = { id: 'shp-x', shopName: 'Shop thử', status: 'active' } as Shop;
const connecting = { ...shop, status: 'connecting' } as Shop;

const item = (over: Partial<ShopConnectionResult> = {}): ShopConnectionResult => ({
  shop,
  created: false,
  reconnect: null,
  previousStatus: 'active',
  remoteProductCount: 0,
  remoteSkuCount: 0,
  ...over,
});
/** Gốc response không có previousStatus, remoteProductCount, remoteSkuCount (§18.7.4) */
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
    expect(firstConnection(wrap(item({ remoteProductCount: 3 }))).remoteProductCount).toBe(3);
  });
});

describe('reconnectSummary', () => {
  it('kể việc đã bù, bỏ phần bằng 0', () => {
    expect(reconnectSummary({ jobsRun: 3, relisted: 0, pulledFrom: null })).toEqual(['chạy 3 việc đang chờ']);
    expect(reconnectSummary({ jobsRun: 0, relisted: 2, pulledFrom: null })).toEqual(['đưa lại 2 sản phẩm lên sàn']);
  });

  it('không có phần bù thì rỗng', () => {
    expect(reconnectSummary(null)).toEqual([]);
  });
});

describe('hàng trên sàn: số sản phẩm và số phân loại (§18.7.4)', () => {
  const counts = (remoteProductCount?: number | null, remoteSkuCount?: number | null) => ({ remoteProductCount, remoteSkuCount });

  it('có cả hai số thì hiện một cụm', () => {
    expect(remoteCountsText(counts(305, 812))).toBe('305 sản phẩm · 812 phân loại');
    expect(remoteCountsSuffix(counts(305, 812))).toBe(' · 305 sản phẩm · 812 phân loại');
    expect(remoteCountsValue(counts(305, 812))).toBe('305 sản phẩm · 812 phân loại');
  });

  it('chưa có số phân loại thì chỉ hiện số sản phẩm', () => {
    expect(remoteCountsValue(counts(305, null))).toBe('305 sản phẩm');
    expect(remoteCountsSuffix(counts(305, null))).toBe(' · 305 sản phẩm');
  });

  it('0 là gian hàng rỗng thật, vẫn hiện số', () => {
    expect(remoteCountsValue(counts(0, 0))).toBe('0 sản phẩm · 0 phân loại');
  });

  it('chưa có số sản phẩm thì ô hiện "—", màn nhiều gian hàng bỏ cả cụm', () => {
    expect(remoteCountsValue(counts(null, null))).toBe('—');
    expect(remoteCountsSuffix(counts(null, null))).toBe('');
    // Không suy từ số phân loại
    expect(remoteCountsValue(counts(null, 812))).toBe('—');
  });

  it('BE chưa trả trường thì như null', () => {
    expect(remoteCountsValue(counts())).toBe('—');
    expect(remoteCountsSuffix(counts())).toBe('');
    expect(remoteCountsValue(counts(12))).toBe('12 sản phẩm');
  });

  it('thiếu previousStatus thì coi là đã có, không phải nối lại', () => {
    const { previousStatus: _omit, ...rest } = item();
    expect(connectedOutcome(wrap(rest as ShopConnectionResult))).toBe('already_connected');
  });
});
