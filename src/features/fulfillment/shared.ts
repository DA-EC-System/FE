import type { BatchStatus, DeliveryStatus } from '@/types/fulfillment';
import type { OrderSource, OrderStatus } from '@/types/sales';
import { PERMISSIONS } from '@/utils/permissions';
import type { BadgeVariant } from '@/features/sales/shared';

export const BATCH_STATUS: Record<BatchStatus, { label: string; variant: BadgeVariant }> = {
  picking: { label: 'Đang nhặt', variant: 'warning' },
  packed: { label: 'Đã nhặt', variant: 'info' },
  done: { label: 'Hoàn tất', variant: 'success' },
};

export const DELIVERY_LABELS: Record<DeliveryStatus, string> = {
  in_transit: 'Đang giao',
  delivered: 'Đã giao',
  delivery_failed: 'Giao không thành công',
};

/** Lý do đơn chưa xuất trong kết quả xuất cả lô (AC-X3) */
export const ISSUE_FAILURE_LABELS: Record<string, string> = {
  payment_required: 'Chưa thanh toán',
  invalid_transition: 'Đơn đã đổi trạng thái',
  version_conflict: 'Đơn vừa được cập nhật',
  not_reserved: 'Chưa giữ hàng',
};

export const issueFailureLabel = (code: string) => ISSUE_FAILURE_LABELS[code] ?? 'Không xuất được';

export interface OrderActions {
  confirm: boolean;
  cancel: boolean;
  delivery: boolean;
  /** Ghi chú thay cho nút với đơn sàn */
  note: string | null;
}

const BEFORE_ISSUE: OrderStatus[] = ['confirmed', 'picking', 'packing'];
const SHIPPING: OrderStatus[] = ['issued', 'in_transit'];

/** Nút ở chi tiết đơn theo trạng thái, nguồn và quyền (AC-A1, AC-R2) */
export function orderActions(
  order: { status: OrderStatus; source: OrderSource },
  can: (permission: string) => boolean,
): OrderActions {
  const none: OrderActions = { confirm: false, cancel: false, delivery: false, note: null };
  const { status } = order;
  if (order.source === 'marketplace') {
    if (status === 'pending_confirmation') return { ...none, note: 'Đơn sàn tự xác nhận khi giữ được hàng.' };
    if (BEFORE_ISSUE.includes(status)) return { ...none, note: 'Huỷ đơn sàn trên sàn.' };
    if (SHIPPING.includes(status)) return { ...none, note: 'Trạng thái giao lấy từ sàn.' };
    return none;
  }
  return {
    confirm: status === 'pending_confirmation' && can(PERMISSIONS.orderCreate),
    cancel: (status === 'pending_confirmation' || BEFORE_ISSUE.includes(status)) && can(PERMISSIONS.orderCancel),
    delivery: SHIPPING.includes(status) && can(PERMISSIONS.deliveryUpdate),
    note: null,
  };
}

/** Trạng thái giao chọn được từ trạng thái hiện tại (AC-G1) */
export function deliveryOptions(status: OrderStatus): DeliveryStatus[] {
  if (status === 'issued') return ['in_transit', 'delivered', 'delivery_failed'];
  if (status === 'in_transit') return ['delivered', 'delivery_failed'];
  return [];
}
