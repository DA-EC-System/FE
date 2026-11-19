import type { StatusMeta } from '@/components/common/StatusBadge';
import type { TransitionActor } from '@/lib/stateMachine';
import { handoverConfirmed, isSealed, LOSE_FROM, packageMachine, type PackageRecord } from '@/lib/machines/order';
/** Gói giao của sàn (Lazada `shipping_provider_type`); giá trị lạ thì hiện nguyên */
const SHIPPING_PROVIDER_TYPE_LABELS: Record<string, string> = {
  standard: 'Tiêu chuẩn',
  economy: 'Tiết kiệm',
  express: 'Nhanh',
  instant: 'Hoả tốc',
  seller_own_fleet: 'Shop tự giao',
  pickup_in_store: 'Nhận tại cửa hàng',
  digital: 'Hàng số',
};

export function shippingProviderTypeLabel(v: string | null | undefined): string | null {
  if (!v) return null;
  const key = v.toLowerCase();
  return Object.prototype.hasOwnProperty.call(SHIPPING_PROVIDER_TYPE_LABELS, key) ? SHIPPING_PROVIDER_TYPE_LABELS[key]! : v;
}

import type { OpenPurpose, PackageAction, PackageFlag, PackageLine, PackageStatus, PackageSummary, PackageTab } from '@/types/fulfillment';

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
  needs_open: { label: 'Chờ mở kiện', variant: 'warning', hint: 'Kiện đã đóng nhưng cần mở lại: đơn huỷ, sửa hoặc chia lại kiện.' },
  needs_attention: { label: 'Cần xử lý', variant: 'destructive', hint: 'Kiện có vấn đề cần người xem, lý do ghi trong chi tiết kiện.' },
  lost_reported: { label: 'Báo thất lạc', variant: 'warning', hint: 'Đã báo thất lạc, cần một người khác xác nhận.' },
  label_error: { label: 'Lỗi lấy vận đơn', variant: 'destructive', hint: 'Lần báo sẵn sàng giao gần nhất gặp lỗi. Kiểm tra gian hàng rồi báo lại.' },
  cod_unconfirmed: { label: 'Chờ xác nhận COD', variant: 'warning', hint: 'Đã giao nhưng chưa xác nhận đã thu tiền COD.' },
  pickup_unconfirmed: { label: 'Chưa thấy sàn xác nhận lấy', variant: 'warning', hint: 'Đã bàn giao nhưng sàn chưa báo đơn vị vận chuyển lấy hàng.' },
};

/** Kiện chưa rời kho có hạn bàn giao đã qua hoặc còn dưới 24 giờ: chữ đỏ `.hot` của Test_UI */
const HOT_STATUSES: PackageStatus[] = ['backordered', 'reserved', 'packed', 'awaiting_pickup'];
export function isHotPackage(p: Pick<PackageSummary, 'status' | 'shipBy'>, now: number = Date.now()): boolean {
  if (!p.shipBy || !HOT_STATUSES.includes(p.status)) return false;
  return new Date(p.shipBy).getTime() - now < 24 * 3600 * 1000;
}

export const OPEN_PURPOSE_LABELS: Record<OpenPurpose, string> = {
  // Kiện chờ mở để huỷ có thể chỉ vì một món bị huỷ, đơn vẫn chạy tiếp (test đêm 18/11/2026, KH-B09)
  cancel: 'Hàng trong kiện đã huỷ, trả hàng về kệ',
  edit: 'Sửa kiện',
  resplit: 'Chia lại kiện',
  stocktake: 'Kiểm kê thiếu hàng',
};

/** Tổng số đơn vị chờ bỏ của kiện (sàn huỷ lẻ món sau khi đóng gói, 21 §19.2) */
export const pendingDropTotal = (lines: readonly Pick<PackageLine, 'pendingDropQty'>[]): number =>
  lines.reduce((sum, l) => sum + l.pendingDropQty, 0);

export const PENDING_DROP_HINT = 'Sàn đã huỷ phần này, hàng còn trong hộp: bỏ ra khi mở kiện.';

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
  awaiting_open: 'Kiện đang chờ mở',
};

export const handoverFailureLabel = (code: string) => HANDOVER_FAILURE_LABELS[code] ?? 'Không bàn giao được';

/**
 * Báo thất lạc được (commerio-backend#238): kiện đã rời kho chưa dừng, hoặc kiện đã đóng đang chờ mở
 * (dỡ kiện về kệ mà không thấy). Kiện đã đóng không chờ mở thì BE trả `not_awaiting_open`
 */
export function canReportLost(p: Pick<PackageSummary, 'status' | 'flags'>): boolean {
  return LOSE_FROM.includes(p.status) || (isSealed(p.status) && p.flags.includes('needs_open'));
}

/**
 * Kiện thay của lần sàn chia lại kiện mà kiện cũ chưa mở (còn đã đóng): chưa báo sẵn sàng, chưa bàn giao được,
 * BE trả `awaiting_open`
 */
export const waitingReplacedOpen = (p: Pick<PackageSummary, 'replaces'>): boolean =>
  Boolean(p.replaces && isSealed(p.replaces.status));

export const packageRecord = (p: PackageSummary): PackageRecord => ({
  source: p.source,
  selfDelivery: p.selfDelivery,
  orderStatus: p.order.status,
  // Người xác nhận thất lạc phải khác người báo
  createdBy: p.lostReport?.by.id ?? null,
  // Ẩn Đảo bàn giao khi kiện không do kho quét hoặc sàn đã xác nhận lấy (21 §19.2)
  handoverConfirmed: handoverConfirmed(p),
  needsOpen: p.flags.includes('needs_open'),
});

/** Nút của kiện theo bảng chuyển (sơ đồ D2), quyền và cờ */
export interface PackageButtons {
  actions: PackageAction[];
  /** Báo thất lạc không đổi trạng thái, chờ người thứ hai */
  reportLost: boolean;
  /** Ghi chú thay cho nút với kiện của đơn sàn */
  note: string | null;
  /** Vì sao Báo sẵn sàng, Bàn giao bị ẩn (kiện chờ mở, hoặc kiện cũ chưa mở) */
  blocked: string | null;
  /** Ghi chú cạnh Xác nhận thất lạc: tự duyệt, hoặc vì sao người này không xác nhận được */
  lostNote: string | null;
}

export function packageButtons(p: PackageSummary, actor: TransitionActor): PackageButtons {
  const available = packageMachine.available(p.status, actor, packageRecord(p)).map((t) => t.action);
  const opening = p.flags.includes('needs_open');
  const waiting = waitingReplacedOpen(p);
  // Người tự giao kiện không tự xác nhận kiện mình giao bị mất (commerio-backend#238 D13)
  const courier = p.selfDelivery && Boolean(p.deliveredBy) && p.deliveredBy?.id === actor.accountId;
  const actions = available.filter((a) => {
    // Mở kiện để huỷ chỉ khi kiện chờ mở vì đơn huỷ; kiện thường mở về Đã giữ.
    // Kiện Chờ lấy hàng chỉ mở khi chờ mở (sàn chia lại kiện, kiểm kê thiếu): giữ vận đơn (D25)
    if (a === 'open_cancel') return opening && p.openPurpose === 'cancel';
    if (a === 'open') return (p.status === 'packed' || opening) && !(opening && p.openPurpose === 'cancel');
    // Kiện chờ mở, kiện thay chờ mở kiện cũ: BE trả `awaiting_open`
    if (a === 'mark_ready' || a === 'hand_over') return !opening && !waiting;
    // Xác nhận thất lạc (cả khi dỡ kiện không thấy) khi đã có người báo
    if (a === 'lose' || a === 'lose_on_unload') return Boolean(p.lostReport) && !courier;
    return true;
  });
  const canProcess = packageMachine.available('returning', actor, packageRecord(p)).length > 0;
  const reportLost = canReportLost(p) && !p.lostReport && canProcess;
  const shipping = ['in_transit', 'delivery_failed'].includes(p.status);
  const note = p.source === 'marketplace' && shipping ? 'Trạng thái giao lấy từ sàn.' : null;
  const blocked = !isSealed(p.status)
    ? null
    : opening
      ? 'Kiện đang chờ mở: mở kiện xong mới báo sẵn sàng hay bàn giao được.'
      : waiting
        ? `Chờ mở kiện ${p.replaces!.code} (kiện cũ sàn đã chia lại) rồi mới báo sẵn sàng hay bàn giao được.`
        : null;
  let lostNote: string | null = null;
  if (p.lostReport && canProcess) {
    if (courier) lostNote = 'Bạn là người tự giao kiện này nên cần người khác xác nhận thất lạc.';
    else if (p.lostReport.by.id === actor.accountId) {
      lostNote = actor.canSelfApprove
        ? 'Bạn là người báo. Xác nhận sẽ ghi là tự duyệt.'
        : 'Bạn là người báo nên cần một người khác xác nhận.';
    }
  }
  return { actions, reportLost, note, blocked, lostNote };
}

/** Nhóm nút giao trong hộp thoại Cập nhật giao */
export const DELIVERY_ACTIONS: readonly PackageAction[] = ['deliver', 'fail', 'redeliver', 'redeliver_self', 'return'];

export const PACKAGE_ACTION_LABELS: Record<PackageAction, string> = Object.fromEntries(
  packageMachine.transitions.map((t) => [t.action, t.label]),
) as Record<PackageAction, string>;

/**
 * Trang mở chi tiết kiện gửi kèm nơi quay về qua `location.state` (vd chi tiết đơn, yêu cầu trả).
 * Không có thì nút quay về đưa tới hàng đợi kiện.
 */
export interface PackageBackTo {
  path: string;
  label: string;
}

export const packageBackTo = (state: unknown): PackageBackTo | null => {
  const b = (state as { backTo?: Partial<PackageBackTo> } | null)?.backTo;
  return typeof b?.path === 'string' && typeof b.label === 'string' ? { path: b.path, label: b.label } : null;
};
