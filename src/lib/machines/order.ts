/**
 * Đơn bán (sơ đồ D1) và kiện (sơ đồ D2), FE#59. Mock kiểm bằng `check`, UI hiện thao tác bằng `available`.
 * Giai đoạn hiển thị, kết quả hoàn tất, điều kiện huỷ và hoàn tất suy từ kiện, gom ở đây để mock và UI dùng chung.
 */
import { defineMachine, type OwnedRecord } from '@/lib/stateMachine';
import { PERMISSIONS } from '@/utils/permissions';
import type { PackageAction, PackageStatus } from '@/types/fulfillment';
import type { OrderAction, OrderFlag, OrderOutcome, OrderSource, OrderStage, OrderStatus, PaymentMethod } from '@/types/sales';

// ---------- Kiện ----------

/** Kiện đang giữ hàng: tính vào Đang giữ của tồn kho */
export const HOLDING: readonly PackageStatus[] = ['reserved', 'packed', 'awaiting_pickup'];

/** Kiện đã rời kho: tồn thực đã trừ */
export const HANDED_OVER: readonly PackageStatus[] = [
  'in_transit',
  'self_delivering',
  'delivered',
  'delivery_failed',
  'returning',
  'returned',
  'lost',
];

/** Kiện đã dừng: không còn chuyển nữa trừ khi mở lại */
export const STOPPED: readonly PackageStatus[] = ['delivered', 'returned', 'lost', 'cancelled'];

/** Kiện đã đóng gói: huỷ, sửa, chia lại phải mở kiện trước */
export const SEALED: readonly PackageStatus[] = ['packed', 'awaiting_pickup'];

export const holdsStock = (s: PackageStatus) => HOLDING.includes(s);
export const isHandedOver = (s: PackageStatus) => HANDED_OVER.includes(s);
export const isStopped = (s: PackageStatus) => STOPPED.includes(s);
export const isSealed = (s: PackageStatus) => SEALED.includes(s);

export interface PackageRecord extends OwnedRecord {
  source: OrderSource;
  selfDelivery: boolean;
  orderStatus: OrderStatus;
  /** Sàn đẩy cập nhật: bỏ qua chặn theo nguồn */
  byPlatform?: boolean;
}

/** Đơn sàn: trạng thái giao lấy từ sàn, người dùng không cập nhật */
const carrierOnly = (r: PackageRecord) => (r.source === 'marketplace' && !r.byPlatform ? 'not_allowed_for_source' : null);
const process = PERMISSIONS.fulfillmentProcess;
const delivery = PERMISSIONS.deliveryUpdate;

/**
 * `createdBy` của bản ghi kiện là người báo thất lạc: người xác nhận phải là người khác.
 * Kiện tự giao còn phải khác người giao (mock kiểm thêm).
 */
export const packageMachine = defineMachine<PackageStatus, PackageAction, PackageRecord>([
  { from: 'backordered', to: 'reserved', action: 'hold', label: 'Giữ đủ hàng', system: true },
  { from: 'reserved', to: 'backordered', action: 'reclaim', label: 'Bị lấy lại hàng', system: true },
  {
    from: 'reserved',
    to: 'packed',
    action: 'pack',
    label: 'Đóng gói',
    permission: process,
    // Đơn chưa thanh toán vẫn giữ hàng nhưng chưa đóng gói
    guard: (r) => (r.orderStatus === 'processing' ? null : 'order_not_processing'),
  },
  {
    from: 'packed',
    to: 'awaiting_pickup',
    action: 'mark_ready',
    label: 'Báo sàn sẵn sàng',
    permission: process,
    guard: (r) => (r.selfDelivery ? 'self_delivery' : null),
  },
  { from: 'awaiting_pickup', to: 'in_transit', action: 'hand_over', label: 'Bàn giao', permission: process },
  {
    from: 'in_transit',
    to: 'awaiting_pickup',
    action: 'undo_handover',
    label: 'Đảo bàn giao',
    permission: PERMISSIONS.handoverRevert,
    needsReason: true,
  },
  { from: SEALED, to: 'reserved', action: 'open', label: 'Mở kiện', permission: process },
  { from: SEALED, to: 'cancelled', action: 'open_cancel', label: 'Mở kiện, huỷ', permission: process },
  { from: ['backordered', 'reserved'], to: 'cancelled', action: 'cancel', label: 'Huỷ kiện', system: true },
  {
    from: 'packed',
    to: 'self_delivering',
    action: 'self_deliver',
    label: 'Tự giao',
    permission: delivery,
    guard: (r) => (r.selfDelivery ? null : 'carrier_delivery'),
  },
  {
    from: ['in_transit', 'self_delivering', 'delivery_failed'],
    to: 'delivered',
    action: 'deliver',
    label: 'Đã giao',
    permission: delivery,
    guard: carrierOnly,
  },
  {
    from: ['in_transit', 'self_delivering'],
    to: 'delivery_failed',
    action: 'fail',
    label: 'Giao thất bại',
    permission: delivery,
    needsReason: true,
    guard: carrierOnly,
  },
  {
    from: 'delivery_failed',
    to: 'in_transit',
    action: 'redeliver',
    label: 'Giao lại',
    permission: delivery,
    guard: (r) => carrierOnly(r) ?? (r.selfDelivery ? 'self_delivery' : null),
  },
  {
    from: 'delivery_failed',
    to: 'self_delivering',
    action: 'redeliver_self',
    label: 'Giao lại',
    permission: delivery,
    guard: (r) => (r.selfDelivery ? null : 'carrier_delivery'),
  },
  {
    from: ['in_transit', 'delivery_failed', 'self_delivering'],
    to: 'returning',
    action: 'return',
    label: 'Hoàn về',
    permission: delivery,
    guard: carrierOnly,
  },
  { from: 'returning', to: 'returned', action: 'receive_return', label: 'Quét nhận hàng hoàn', permission: process },
  {
    from: ['awaiting_pickup', 'in_transit', 'delivery_failed', 'returning', 'self_delivering'],
    to: 'lost',
    action: 'lose',
    label: 'Xác nhận thất lạc',
    permission: process,
    needsSecondPerson: true,
    needsReason: true,
  },
  { from: 'lost', to: 'returned', action: 'found', label: 'Tìm thấy', permission: process },
]);

/** Đường chính của kiện: sàn báo nhảy cóc trên đường này thì áp và bù tồn một lần */
export const MAIN_PATH: readonly PackageStatus[] = ['reserved', 'packed', 'awaiting_pickup', 'in_transit', 'delivered'];

/**
 * Sàn đẩy trạng thái kiện: `direct` khi có mũi tên trong bảng, `jump` khi nhảy tới trên đường chính,
 * `invalid` khi không áp được (kiện gắn cờ Cần xử lý)
 */
export function platformUpdate(from: PackageStatus, to: PackageStatus): 'direct' | 'jump' | 'invalid' {
  if (packageMachine.transitions.some((t) => t.to === to && (typeof t.from === 'string' ? [t.from] : t.from).includes(from))) {
    return 'direct';
  }
  const a = MAIN_PATH.indexOf(from);
  const b = MAIN_PATH.indexOf(to);
  return a >= 0 && b > a ? 'jump' : 'invalid';
}

/** Chuyển này làm hàng rời kho (trừ tồn thực) hay quay lại kho (cộng lại) */
export function stockEffect(from: PackageStatus, to: PackageStatus): 'leave' | 'back' | null {
  if (!isHandedOver(from) && isHandedOver(to)) return 'leave';
  if (isHandedOver(from) && !isHandedOver(to)) return 'back';
  return null;
}

// ---------- Đơn ----------

export interface OrderRecord extends OwnedRecord {
  source: OrderSource;
  paymentMethod: PaymentMethod | null;
  packages: readonly PackageStatus[];
}

/** Huỷ được khi chưa kiện nào rời kho */
const cancelGuard = (r: OrderRecord) =>
  r.source === 'marketplace' ? 'not_allowed_for_source' : r.packages.some(isHandedOver) ? 'already_handed_over' : null;

export const orderMachine = defineMachine<OrderStatus, OrderAction, OrderRecord>([
  {
    from: 'unpaid',
    to: 'processing',
    action: 'confirm',
    label: 'Xác nhận đơn',
    permission: PERMISSIONS.orderCreate,
    // Đơn COD tạo tay: người bán xác nhận; trả trước sang xử lý khi khách trả
    guard: (r) => (r.source === 'marketplace' ? 'not_allowed_for_source' : r.paymentMethod !== 'cod' ? 'payment_required' : null),
  },
  { from: 'unpaid', to: 'processing', action: 'pay', label: 'Đã trả', system: true },
  { from: 'processing', to: 'completed', action: 'complete', label: 'Hoàn tất', system: true },
  {
    from: ['unpaid', 'processing'],
    to: 'cancelled',
    action: 'cancel',
    label: 'Huỷ đơn',
    permission: PERMISSIONS.orderCancel,
    needsReason: true,
    guard: cancelGuard,
  },
  { from: ['unpaid', 'processing'], to: 'cancelled', action: 'platform_cancel', label: 'Sàn huỷ', system: true },
  {
    // Người bán huỷ đơn sàn: gửi lên sàn với lý do trong danh sách của sàn (§19.3)
    from: ['unpaid', 'processing'],
    to: 'cancelled',
    action: 'cancel_on_platform',
    label: 'Huỷ đơn sàn',
    permission: PERMISSIONS.orderCancel,
    guard: (r) =>
      r.source !== 'marketplace' ? 'not_allowed_for_source' : r.packages.some(isHandedOver) ? 'already_handed_over' : null,
  },
]);

/** Huỷ ngay, hay còn kiện đã đóng gói phải mở trước (cờ Đang huỷ) */
export function cancelPlan(packages: readonly PackageStatus[]): 'now' | 'after_open' {
  return packages.some(isSealed) ? 'after_open' : 'now';
}

/** Số ngày khách được trả hàng, tính từ kiện giao cuối */
export const RETURN_WINDOW_DAYS = 7;
/** Còn dưới bấy nhiêu giờ tới hạn bàn giao thì cờ Sắp trễ hạn */
export const DUE_SOON_HOURS = 24;

export interface CompletionInput {
  packages: readonly PackageStatus[];
  /** Kiện giao cuối; null khi chưa giao kiện nào */
  lastDeliveredAt: string | null;
  openReturnRequests: number;
  /** Đơn COD của người bán (tạo tay, hộp thư) đã giao mà kế toán chưa xác nhận tiền */
  codUnconfirmed: boolean;
  now: number;
}

/** Lý do chưa hoàn tất; null là hoàn tất được */
export function completionBlocker(i: CompletionInput): string | null {
  if (!i.packages.length || !i.packages.every(isStopped)) return 'packages_open';
  if (i.lastDeliveredAt && Date.parse(i.lastDeliveredAt) + RETURN_WINDOW_DAYS * 24 * 3600_000 > i.now) {
    return 'return_window';
  }
  if (i.openReturnRequests > 0) return 'return_requested';
  if (i.codUnconfirmed) return 'cod_unconfirmed';
  return null;
}

/** Kết quả khi hoàn tất, tính trên kiện chưa huỷ */
export function outcomeOf(packages: readonly PackageStatus[]): OrderOutcome {
  const live = packages.filter((s) => s !== 'cancelled');
  const delivered = live.filter((s) => s === 'delivered').length;
  if (!delivered) return 'none';
  return delivered === live.length ? 'full' : 'partial';
}

/** Thứ tự tiến độ để tìm kiện chậm nhất */
const PROGRESS: Partial<Record<PackageStatus, number>> = {
  backordered: 0,
  reserved: 1,
  packed: 2,
  awaiting_pickup: 3,
  in_transit: 4,
  self_delivering: 4,
  delivered: 5,
  returned: 5,
};

/** Nhánh lỗi hiện trước kiện chậm nhất */
const ERROR_FIRST: readonly PackageStatus[] = ['lost', 'delivery_failed', 'returning'];

export interface StageInput {
  status: OrderStatus;
  source: OrderSource;
  paymentMethod: PaymentMethod | null;
  flags: readonly OrderFlag[];
  packages: readonly PackageStatus[];
}

/** Giai đoạn hiển thị của đơn (sơ đồ D1, ô "Hiển thị") */
export function stageOf(o: StageInput): OrderStage {
  if (o.status === 'cancelled' || o.status === 'completed') return o.status;
  if (o.flags.includes('unmapped_sku')) return 'unmapped';
  if (o.status === 'unpaid') return o.source !== 'marketplace' && o.paymentMethod === 'cod' ? 'awaiting_confirmation' : 'awaiting_payment';
  if (o.flags.includes('cancelling')) return 'cancelling';
  const live: PackageStatus[] = o.packages.filter((s) => s !== 'cancelled');
  for (const s of ERROR_FIRST) if (live.includes(s)) return s as OrderStage;
  if (!live.length || live.every(isStopped)) return 'awaiting_completion';
  const slowest = live
    .filter((s) => !isStopped(s))
    .reduce((a, b) => ((PROGRESS[b] ?? 9) < (PROGRESS[a] ?? 9) ? b : a));
  return slowest as OrderStage;
}

/** Cờ suy ra lúc đọc: Sắp trễ hạn khi còn kiện chưa rời kho và sắp tới hạn bàn giao */
export function isDueSoon(shipBy: string | null, packages: readonly PackageStatus[], now: number) {
  if (!shipBy) return false;
  const waiting = packages.some((s) => s === 'backordered' || holdsStock(s));
  return waiting && Date.parse(shipBy) - now < DUE_SOON_HOURS * 3600_000;
}
