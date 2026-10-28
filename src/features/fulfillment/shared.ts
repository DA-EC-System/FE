import type { StatusMeta } from '@/components/common/StatusBadge';
import type { TransitionActor } from '@/lib/stateMachine';
import { packageMachine, type PackageRecord } from '@/lib/machines/order';
import type { OpenPurpose, PackageAction, PackageFlag, PackageStatus, PackageSummary, PackageTab } from '@/types/fulfillment';

export const PACKAGE_STATUS: Record<PackageStatus, StatusMeta> = {
  backordered: { label: 'Thiếu hàng', variant: 'destructive' },
  reserved: { label: 'Đã giữ hàng', variant: 'info' },
  packed: { label: 'Đã đóng gói', variant: 'info' },
  awaiting_pickup: { label: 'Chờ lấy hàng', variant: 'info' },
  in_transit: { label: 'Đang giao', variant: 'info' },
  self_delivering: { label: 'Đang tự giao', variant: 'info' },
  delivered: { label: 'Đã giao', variant: 'success' },
  delivery_failed: { label: 'Giao thất bại', variant: 'destructive' },
  returning: { label: 'Đang hoàn', variant: 'warning' },
  returned: { label: 'Đã hoàn về kho', variant: 'secondary' },
  lost: { label: 'Thất lạc', variant: 'destructive' },
  cancelled: { label: 'Đã huỷ', variant: 'secondary' },
};

export const PACKAGE_FLAGS: Record<PackageFlag, StatusMeta> = {
  needs_open: { label: 'Chờ mở kiện', variant: 'warning' },
  needs_attention: { label: 'Cần xử lý', variant: 'destructive' },
  lost_reported: { label: 'Báo thất lạc', variant: 'warning' },
};

export const OPEN_PURPOSE_LABELS: Record<OpenPurpose, string> = {
  cancel: 'Đơn đã huỷ, trả hàng về kệ',
  edit: 'Sửa kiện',
  resplit: 'Chia lại kiện',
};

/** Hàng đợi kho theo bước làm việc; Cần đóng gói là tab mặc định */
export const PACKAGE_TABS: { value: PackageTab; label: string }[] = [
  { value: 'reserved', label: 'Cần đóng gói' },
  { value: 'packed', label: 'Đã đóng gói' },
  { value: 'awaiting_pickup', label: 'Chờ lấy hàng' },
  { value: 'shipping', label: 'Đang giao' },
  { value: 'delivery_failed', label: 'Giao thất bại' },
  { value: 'returning', label: 'Đang hoàn' },
  { value: 'backordered', label: 'Thiếu hàng' },
  { value: 'needs_open', label: 'Cần xử lý' },
];

/** Lý do kiện không bàn giao được trong kết quả bàn giao hàng loạt */
export const HANDOVER_FAILURE_LABELS: Record<string, string> = {
  invalid_transition: 'Kiện không ở Chờ lấy hàng',
  version_conflict: 'Kiện vừa được cập nhật',
  not_found: 'Không tìm thấy kiện',
  forbidden: 'Không có quyền',
};

export const handoverFailureLabel = (code: string) => HANDOVER_FAILURE_LABELS[code] ?? 'Không bàn giao được';

/** Trạng thái báo thất lạc được (cũng là trạng thái xác nhận thất lạc được) */
export const LOSABLE: readonly PackageStatus[] = ['awaiting_pickup', 'in_transit', 'delivery_failed', 'returning', 'self_delivering'];

export const packageRecord = (p: PackageSummary): PackageRecord => ({
  source: p.source,
  selfDelivery: p.selfDelivery,
  orderStatus: p.order.status,
  // Người xác nhận thất lạc phải khác người báo
  createdBy: p.lostReport?.by.id ?? null,
});

/** Nút của kiện theo bảng chuyển (sơ đồ D2), quyền và cờ */
export interface PackageButtons {
  actions: PackageAction[];
  /** Báo thất lạc không đổi trạng thái, chờ người thứ hai */
  reportLost: boolean;
  /** Ghi chú thay cho nút với kiện của đơn sàn */
  note: string | null;
}

export function packageButtons(p: PackageSummary, actor: TransitionActor): PackageButtons {
  const available = packageMachine.available(p.status, actor, packageRecord(p)).map((t) => t.action);
  const opening = p.flags.includes('needs_open');
  const actions = available.filter((a) => {
    // Mở kiện để huỷ chỉ khi kiện chờ mở vì đơn huỷ; kiện thường mở về Đã giữ
    if (a === 'open_cancel') return opening && p.openPurpose === 'cancel';
    if (a === 'open') return !(opening && p.openPurpose === 'cancel');
    // Xác nhận thất lạc khi đã có người báo
    if (a === 'lose') return Boolean(p.lostReport);
    return true;
  });
  const canProcess = packageMachine.available('returning', actor, packageRecord(p)).length > 0;
  const reportLost = LOSABLE.includes(p.status) && !p.lostReport && canProcess;
  const shipping = ['in_transit', 'delivery_failed'].includes(p.status);
  const note = p.source === 'marketplace' && shipping ? 'Trạng thái giao lấy từ sàn.' : null;
  return { actions, reportLost, note };
}

/** Nhóm nút giao trong hộp thoại Cập nhật giao */
export const DELIVERY_ACTIONS: readonly PackageAction[] = ['deliver', 'fail', 'redeliver', 'redeliver_self', 'return'];

export const PACKAGE_ACTION_LABELS: Record<PackageAction, string> = Object.fromEntries(
  packageMachine.transitions.map((t) => [t.action, t.label]),
) as Record<PackageAction, string>;
