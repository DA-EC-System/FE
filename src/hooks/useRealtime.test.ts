import { describe, expect, it } from 'vitest';
import { groupsOf } from './useRealtime';

describe('groupsOf: sự kiện → nhóm query làm mới', () => {
  it('đơn, kiện, yêu cầu trả, gian hàng', () => {
    expect(groupsOf('sales.order_created')).toEqual(['sales', 'fulfillment', 'tasks']);
    expect(groupsOf('sales.order_status_changed')).toContain('sales');
    expect(groupsOf('fulfillment.package_status_changed')).toEqual(['fulfillment', 'sales', 'tasks']);
    expect(groupsOf('sales.return_status_changed')).toEqual(['returns', 'sales']);
    expect(groupsOf('channel.shop_status_changed')).toEqual(['shops']);
    expect(groupsOf('channel.listing_sync_changed')).toEqual(['shops']);
  });

  it('loại chưa biết thì không làm mới gì', () => {
    expect(groupsOf('khac.su_kien')).toEqual([]);
  });
});
