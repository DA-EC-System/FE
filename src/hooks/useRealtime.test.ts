import { describe, expect, it } from 'vitest';
import type { RealtimeMessage } from '@/api/realtime';
import { groupsOf, packageNotice } from './useRealtime';

describe('groupsOf: sự kiện → nhóm query làm mới (Documents/21 §13.2)', () => {
  it('đơn, kiện, yêu cầu trả, gian hàng', () => {
    expect(groupsOf('sales.order_created')).toEqual(['sales', 'fulfillment', 'tasks']);
    expect(groupsOf('sales.order_status_changed')).toEqual(['sales', 'fulfillment', 'tasks']);
    expect(groupsOf('fulfillment.package_status_changed')).toEqual(['fulfillment', 'sales', 'tasks']);
    expect(groupsOf('fulfillment.package_delivery_failed')).toEqual(['fulfillment', 'sales', 'tasks']);
    expect(groupsOf('fulfillment.package_lost')).toEqual(['fulfillment', 'sales', 'tasks']);
    expect(groupsOf('sales.return_status_changed')).toEqual(['returns', 'sales', 'tasks']);
    expect(groupsOf('channel.shop_status_changed')).toEqual(['shops', 'tasks']);
    expect(groupsOf('channel.listing_sync_changed')).toEqual(['shops']);
  });

  it('tồn, nhập hàng giữ như cũ', () => {
    expect(groupsOf('inventory.below_threshold')).toEqual(['inventory', 'tasks']);
    expect(groupsOf('purchasing.request_submitted')).toEqual(['purchasing', 'tasks']);
  });

  it('sự kiện đã bỏ hoặc chưa biết thì không làm mới gì', () => {
    expect(groupsOf('payment.succeeded')).toEqual([]);
    expect(groupsOf('khac.su_kien')).toEqual([]);
  });
});

const msg = (type: string, payload: Record<string, unknown>): RealtimeMessage => ({
  eventId: 'e1',
  type,
  occurredAt: '2026-11-19T00:00:00.000Z',
  payload,
});
const codes: Record<string, string> = { 'pkg-1': 'KH-000001' };
const codeOf = (id: string) => codes[id];

describe('packageNotice: thông báo kiện giao thất bại, thất lạc (§11.2)', () => {
  it('giao thất bại: kèm lý do của sàn, mã kiện lấy từ cache', () => {
    expect(packageNotice(msg('fulfillment.package_delivery_failed', { packageId: 'pkg-1', orderId: 'ord-1', reason: 'Khách không nghe máy' }), codeOf)).toEqual({
      text: 'Kiện KH-000001 giao không thành công: Khách không nghe máy',
      packageId: 'pkg-1',
      orderId: 'ord-1',
    });
  });

  it('giao thất bại không có lý do, kiện chưa có trong cache', () => {
    expect(packageNotice(msg('fulfillment.package_delivery_failed', { packageId: 'pkg-9', orderId: 'ord-9', reason: null }), codeOf)?.text).toBe(
      'Một kiện giao không thành công: Sàn báo giao không thành công',
    );
  });

  it('thất lạc: có mã khiếu nại thì kèm, sàn báo (claimCode null) thì không', () => {
    expect(packageNotice(msg('fulfillment.package_lost', { packageId: 'pkg-1', orderId: 'ord-1', claimCode: 'KN-01' }), codeOf)?.text).toBe(
      'Kiện KH-000001 thất lạc, mã khiếu nại KN-01',
    );
    expect(packageNotice(msg('fulfillment.package_lost', { packageId: 'pkg-1', orderId: 'ord-1', claimCode: null }), codeOf)?.text).toBe(
      'Kiện KH-000001 thất lạc',
    );
  });

  it('sự kiện khác không có thông báo kiện', () => {
    expect(packageNotice(msg('fulfillment.package_status_changed', { packageId: 'pkg-1', from: 'packed', to: 'awaiting_pickup' }), codeOf)).toBeNull();
  });
});
