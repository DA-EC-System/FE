import { describe, expect, it } from 'vitest';
import type { Shop } from '@/types/shop';
import { connectedToast } from './connectResult';

const shop = { id: 'shp-x', shopName: 'Shop thử' } as Shop;

describe('connectedToast', () => {
  it('nhiều gian hàng báo số lượng', () => {
    const item = { shop, created: true, reconnect: null };
    expect(connectedToast({ ...item, shops: [item, item] })).toBe('Đã kết nối 2 gian hàng');
  });
  it('gian hàng mới nhắc hoàn tất thiết lập', () => {
    expect(connectedToast({ shop, created: true, reconnect: null })).toBe(
      'Đã kết nối Shop thử. Hoàn tất thiết lập để bắt đầu bán.',
    );
  });

  it('kết nối lại kể việc đã bù, bỏ phần bằng 0', () => {
    expect(
      connectedToast({ shop, created: false, reconnect: { jobsRun: 3, relisted: 0, pulledFrom: null } }),
    ).toBe('Đã kết nối lại Shop thử: chạy 3 việc đang chờ');
  });

  it('kết nối lại không có gì bù thì chỉ báo đã kết nối lại', () => {
    expect(connectedToast({ shop, created: false, reconnect: null })).toBe('Đã kết nối lại Shop thử');
  });
});
