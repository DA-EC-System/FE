import { describe, expect, it } from 'vitest';
import type { OrderSource, OrderStatus } from '@/types/sales';
import { PERMISSIONS } from '@/utils/permissions';
import { deliveryOptions, issueFailureLabel, orderActions } from './shared';

const ALL = new Set<string>([PERMISSIONS.orderCreate, PERMISSIONS.orderCancel, PERMISSIONS.deliveryUpdate]);
const canAll = (p: string) => ALL.has(p);
const viewOnly = (p: string) => p === PERMISSIONS.orderView;
const act = (status: OrderStatus, source: OrderSource = 'manual', can = canAll) => orderActions({ status, source }, can);

describe('orderActions (AC-A1, AC-R2)', () => {
  it('đơn tạo tay chờ xác nhận: xác nhận và huỷ', () => {
    expect(act('pending_confirmation')).toEqual({ confirm: true, cancel: true, delivery: false, note: null });
  });

  it('đơn đã xác nhận đến đóng gói: chỉ huỷ', () => {
    for (const s of ['confirmed', 'picking', 'packing'] as OrderStatus[]) {
      expect(act(s, 'inbox')).toEqual({ confirm: false, cancel: true, delivery: false, note: null });
    }
  });

  it('đơn đã xuất, đang giao: chỉ cập nhật giao', () => {
    for (const s of ['issued', 'in_transit'] as OrderStatus[]) {
      expect(act(s)).toEqual({ confirm: false, cancel: false, delivery: true, note: null });
    }
  });

  it('đơn đã kết thúc không có nút', () => {
    for (const s of ['delivered', 'delivery_failed', 'cancelled'] as OrderStatus[]) {
      expect(act(s)).toEqual({ confirm: false, cancel: false, delivery: false, note: null });
    }
  });

  it('đơn sàn không có nút, chỉ có ghi chú', () => {
    expect(act('pending_confirmation', 'marketplace').note).toBe('Đơn sàn tự xác nhận khi giữ được hàng.');
    expect(act('packing', 'marketplace')).toEqual({
      confirm: false,
      cancel: false,
      delivery: false,
      note: 'Huỷ đơn sàn trên sàn.',
    });
    expect(act('in_transit', 'marketplace').note).toBe('Trạng thái giao lấy từ sàn.');
    expect(act('delivered', 'marketplace').note).toBeNull();
  });

  it('chỉ có quyền xem đơn thì không có nút', () => {
    expect(act('pending_confirmation', 'manual', viewOnly)).toEqual({
      confirm: false,
      cancel: false,
      delivery: false,
      note: null,
    });
    expect(act('issued', 'manual', viewOnly).delivery).toBe(false);
  });
});

describe('deliveryOptions (AC-G1)', () => {
  it('đã xuất chọn được đang giao, đã giao, không thành công', () => {
    expect(deliveryOptions('issued')).toEqual(['in_transit', 'delivered', 'delivery_failed']);
  });
  it('đang giao không quay lại đang giao', () => {
    expect(deliveryOptions('in_transit')).toEqual(['delivered', 'delivery_failed']);
  });
  it('trạng thái khác không cập nhật giao', () => {
    expect(deliveryOptions('packing')).toEqual([]);
    expect(deliveryOptions('delivered')).toEqual([]);
  });
});

describe('issueFailureLabel (AC-X3)', () => {
  it('nhãn theo mã lỗi, mã lạ có nhãn chung', () => {
    expect(issueFailureLabel('payment_required')).toBe('Chưa thanh toán');
    expect(issueFailureLabel('invalid_transition')).toBe('Đơn đã đổi trạng thái');
    expect(issueFailureLabel('xyz')).toBe('Không xuất được');
  });
});
