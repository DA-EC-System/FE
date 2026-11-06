import { describe, expect, it } from 'vitest';
import type { Shop } from '@/types/shop';
import { connectedOutcome, reconnectSummary } from './connectResult';

const shop = { id: 'shp-x', shopName: 'Shop thử', status: 'active' } as Shop;
const connecting = { ...shop, status: 'connecting' } as Shop;

describe('connectedOutcome', () => {
  it('nhiều gian hàng là multiple', () => {
    const item = { shop: connecting, created: true, reconnect: null };
    expect(connectedOutcome({ ...item, shops: [item, item] })).toBe('multiple');
  });

  it('tạo mới hoặc còn đang thiết lập thì mời thiết lập', () => {
    expect(connectedOutcome({ shop: connecting, created: true, reconnect: null })).toBe('connected');
    expect(connectedOutcome({ shop: connecting, created: false, reconnect: null, previousStatus: 'connecting' })).toBe(
      'connected',
    );
  });

  it('trước đó mất quyền hoặc đã ngắt là nối lại', () => {
    expect(connectedOutcome({ shop, created: false, reconnect: null, previousStatus: 'needs_reauth' })).toBe('reconnected');
    expect(connectedOutcome({ shop, created: false, reconnect: null, previousStatus: 'disconnected' })).toBe('reconnected');
  });

  it('đang chạy thì chỉ cấp lại token', () => {
    expect(connectedOutcome({ shop, created: false, reconnect: null, previousStatus: 'active' })).toBe('already_connected');
  });

  it('BE chưa trả previousStatus thì đoán theo phần bù việc', () => {
    expect(connectedOutcome({ shop, created: false, reconnect: { jobsRun: 1, relisted: 0, pulledFrom: null } })).toBe(
      'reconnected',
    );
    expect(connectedOutcome({ shop, created: false, reconnect: null })).toBe('already_connected');
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
