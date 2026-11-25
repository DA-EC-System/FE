import type { StatusMeta } from '@/components/common/StatusBadge';
import { RTS_CODE_MISSING } from '@/api/problemMessages';
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
  digital: 'Hàng kỹ thuật số',
};

export function shippingProviderTypeLabel(v: string | null | undefined): string | null {
  if (!v) return null;
  const key = v.toLowerCase();
  return Object.prototype.hasOwnProperty.call(SHIPPING_PROVIDER_TYPE_LABELS, key) ? SHIPPING_PROVIDER_TYPE_LABELS[key]! : v;
}

import type { OpenPurpose, PackageAction, PackageFlag, PackageLine, PackageStatus, PackageSummary, PackageTab } from '@/types/fulfillment';

export const PACKAGE_STATUS: Record<PackageStatus, StatusMeta> = {
  backordered: { label: 'Thiếu hàng', variant: 'destructive' },
  reserved: { label: 'Chờ đóng gói', variant: 'info' },
  packed: { label: 'Đã đóng gói', variant: 'info' },
  awaiting_pickup: { label: 'Chờ lấy hàng', variant: 'info' },
  in_transit: { label: 'Đang vận chuyển', variant: 'info' },
  self_delivering: { label: 'Shop tự giao', variant: 'info' },
  delivered: { label: 'Đã giao', variant: 'success' },
  delivery_failed: { label: 'Giao thất bại', variant: 'destructive' },
  returning: { label: 'Đang hoàn hàng', variant: 'warning' },
  returned: { label: 'Đã hoàn về kho', variant: 'secondary' },
  lost: { label: 'Thất lạc', variant: 'destructive' },
  cancelled: { label: 'Đã huỷ', variant: 'secondary' },
};

export const PACKAGE_FLAGS: Record<PackageFlag, StatusMeta> = {
  needs_open: { label: 'Cần mở lại kiện', variant: 'warning', hint: 'Kiện đã đóng nhưng cần mở lại: đơn huỷ, sửa, tách lại kiện, kiểm kho thiếu hoặc đổi liên kết SKU.' },
  needs_attention: { label: 'Cần xử lý', variant: 'destructive', hint: 'Kiện có vấn đề cần người xem, lý do ghi trong chi tiết kiện.' },
  cancel_requested: { label: 'Người mua xin huỷ', variant: 'warning', hint: 'Người mua đang xin huỷ đơn, chờ Sale trả lời. Chưa bấm Sẵn sàng giao được.' },
  lost_reported: { label: 'Đã báo thất lạc', variant: 'warning', hint: 'Đã báo thất lạc, cần một người khác xác nhận.' },
  label_error: { label: 'Lỗi lấy mã vận đơn', variant: 'destructive', hint: 'Lần bấm Sẵn sàng giao gần nhất bị lỗi. Kiểm tra kết nối gian hàng rồi bấm lại.' },
  cod_unconfirmed: { label: 'Chờ xác nhận COD', variant: 'warning', hint: 'Đã giao nhưng chưa xác nhận đã thu tiền COD.' },
  pickup_unconfirmed: { label: 'Sàn chưa xác nhận lấy hàng', variant: 'warning', hint: 'Đã bàn giao nhưng sàn chưa báo đơn vị vận chuyển lấy hàng.' },
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
  resplit: 'Tách lại kiện',
  stocktake: 'Kiểm kho thiếu hàng',
  remap: 'Đổi liên kết SKU',
};

/** Vì sao kiện chờ mở lại; `null` khi kiện không chờ mở hoặc BE không gửi mục đích */
export const openPurposeLabel = (p: Pick<PackageSummary, 'flags' | 'openPurpose'>): string | null =>
  p.flags.includes('needs_open') && p.openPurpose ? OPEN_PURPOSE_LABELS[p.openPurpose] : null;

/** Tổng số đơn vị chờ bỏ của kiện (sàn huỷ lẻ món sau khi đóng gói, 21 §19.2) */
export const pendingDropTotal = (lines: readonly Pick<PackageLine, 'pendingDropQty'>[]): number =>
  lines.reduce((sum, l) => sum + l.pendingDropQty, 0);

export const PENDING_DROP_HINT = 'Sàn đã huỷ phần này, hàng còn trong hộp: bỏ ra khi mở kiện.';

/** Dòng `remapPending`: CEO đã đổi liên kết SKU sau khi kiện đóng (commerio-backend#237 PR 2) */
export const REMAP_PENDING_HINT = 'Món trong hộp theo liên kết SKU cũ. Mở kiện để đổi sang SKU mới.';

/**
 * Câu thêm vào hộp xác nhận Mở kiện khi kiện còn dòng `remapPending`: BE áp liên kết mới lúc mở, SKU mới thiếu hàng thì
 * kiện về `backordered` chứ không về Chờ đóng gói (21 §19.2, commerio-backend#237 PR 2)
 */
export const remapOpenNote = (p: { lines: readonly Pick<PackageLine, 'remapPending'>[] }): string =>
  p.lines.some((l) => l.remapPending)
    ? ' Mở ra sẽ áp liên kết SKU mới: lấy món cũ ra, nhặt món theo SKU mới. SKU mới thiếu hàng thì kiện về Thiếu hàng.'
    : '';

/** Hàng đợi kho theo bước làm việc; Chờ đóng gói là tab mặc định */
export const PACKAGE_TABS: { value: PackageTab; label: string }[] = [
  { value: 'reserved', label: 'Chờ đóng gói' },
  { value: 'packed', label: 'Đã đóng gói' },
  { value: 'awaiting_pickup', label: 'Chờ lấy hàng' },
  { value: 'shipping', label: 'Đang vận chuyển' },
  { value: 'delivery_failed', label: 'Giao thất bại' },
  { value: 'returning', label: 'Đang hoàn hàng' },
  { value: 'backordered', label: 'Thiếu hàng' },
  { value: 'needs_open', label: 'Cần mở lại kiện' },
];

/** Lý do kiện không bàn giao được trong kết quả bàn giao hàng loạt */
export const HANDOVER_FAILURE_LABELS: Record<string, string> = {
  invalid_transition: 'Kiện không còn ở trạng thái Chờ lấy hàng',
  version_conflict: 'Kiện vừa có người sửa, tải lại rồi thử lại',
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

/**
 * In vận đơn khi sàn đã cấp vận đơn: có mã kiện sàn và mã vận đơn (Documents/21 §19.3, commerio-backend#239 KH-B03).
 * Lazada có từ lúc đóng gói, TikTok sau khi báo sàn sẵn sàng giao. Chỉ hiện trước khi bàn giao.
 */
export const canPrintLabel = (p: Pick<PackageSummary, 'status' | 'platformPackageCode' | 'trackingCode'>): boolean =>
  Boolean(p.platformPackageCode && p.trackingCode) && (p.status === 'packed' || p.status === 'awaiting_pickup');

const CANCEL_REQUESTED_BLOCK = 'Người mua đang xin huỷ đơn, chờ Sale trả lời yêu cầu huỷ rồi mới bấm Sẵn sàng giao.';

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
  // BE trả `cancel_requested`, `rts_package_not_found` (commerio-backend#239 KH-B07, TRA-B06)
  const cancelRequested = p.flags.includes('cancel_requested');
  const codeMissing = p.source === 'marketplace' && !p.platformPackageCode;
  const actions = available.filter((a) => {
    if (a === 'mark_ready' && (cancelRequested || codeMissing)) return false;
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
  const note = p.source === 'marketplace' && shipping ? 'Trạng thái giao hàng cập nhật tự động từ sàn.' : null;
  const blocked = !isSealed(p.status)
    ? null
    : opening
      ? 'Kiện đang chờ mở: mở kiện xong mới bấm Sẵn sàng giao hay bàn giao được.'
      : waiting
        ? `Chờ mở kiện ${p.replaces!.code} (kiện cũ sàn đã tách lại) rồi mới bấm Sẵn sàng giao hay bàn giao được.`
        : p.status !== 'packed'
          ? null
          : cancelRequested
            ? CANCEL_REQUESTED_BLOCK
            : codeMissing
              ? RTS_CODE_MISSING
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
