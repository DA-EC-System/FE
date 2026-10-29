/**
 * Kiện (sơ đồ D2, FE#59): đơn chia thành một hoặc nhiều kiện; giữ hàng, đóng gói, bàn giao, giao, hoàn theo kiện.
 * Thay lô nhặt và xuất kho theo đơn của FE#10. Hợp đồng API ở Documents/21 mục 19.
 */

import type { StatusChange } from '@/lib/stateMachine';
import type { PaymentStatus } from './payment';
import type { OrderShopRef, OrderSource, OrderStatus, PaymentMethod, UserRef } from './sales';

export type PackageStatus =
  | 'backordered'
  | 'reserved'
  | 'packed'
  | 'awaiting_pickup'
  | 'in_transit'
  | 'self_delivering'
  | 'delivered'
  | 'delivery_failed'
  | 'returning'
  | 'returned'
  | 'lost'
  | 'cancelled';

export type PackageAction =
  | 'hold'
  | 'reclaim'
  | 'pack'
  | 'mark_ready'
  | 'hand_over'
  | 'undo_handover'
  | 'open'
  | 'open_cancel'
  | 'cancel'
  | 'self_deliver'
  | 'deliver'
  | 'fail'
  | 'redeliver'
  | 'redeliver_self'
  | 'return'
  | 'receive_return'
  | 'lose'
  | 'found';

/**
 * Cờ trên kiện: Chờ mở kiện (kiện đã đóng cần huỷ, sửa, chia lại; vẫn giữ hàng),
 * Cần xử lý (sàn báo chuyển không có trong bảng), Báo thất lạc (chờ người thứ hai xác nhận)
 */
export type PackageFlag = 'needs_open' | 'needs_attention' | 'lost_reported';

/** Mở kiện để làm gì; sau khi mở: huỷ thì kiện huỷ, còn lại về Đã giữ */
export type OpenPurpose = 'cancel' | 'edit' | 'resplit';

export interface FulfillmentLine {
  variantId: string;
  sku: string;
  productName: string;
  attributesLabel: string;
  quantity: number;
}

export interface LostReport {
  by: UserRef;
  at: string;
  claimCode: string;
}

/** Kiện ở hàng đợi kho: không có giá */
export interface PackageSummary {
  id: string;
  code: string;
  order: { id: string; code: string; status: OrderStatus };
  source: OrderSource;
  shop: OrderShopRef | null;
  customerName: string | null;
  status: PackageStatus;
  flags: PackageFlag[];
  /** Ghi chú cho cờ Cần xử lý hoặc Chờ mở kiện */
  flagNote: string | null;
  openPurpose: OpenPurpose | null;
  /** Đơn tạo tay, hộp thư giao bằng người của cửa hàng */
  selfDelivery: boolean;
  paymentMethod: PaymentMethod | null;
  /** Đơn tạo tay trả trước chưa trả thì chưa bàn giao */
  paymentStatus: PaymentStatus | null;
  /** Mã vận đơn (in vận đơn giả khi báo sàn sẵn sàng) */
  trackingCode: string | null;
  /** Mã kiện trên sàn (`package_number` Shopee, package_id Lazada) */
  platformPackageCode: string | null;
  /** Đơn vị vận chuyển chọn lúc đóng gói kiện sàn (§19.3) */
  carrier: CarrierRef | null;
  /** Hạn bàn giao; kiện hạn sớm được chia hàng trước */
  shipBy: string | null;
  lines: FulfillmentLine[];
  totalQty: number;
  handedOverAt: string | null;
  deliveredAt: string | null;
  /** Người tự giao: người xác nhận thất lạc phải khác người này */
  deliveredBy: UserRef | null;
  lostReport: LostReport | null;
  createdAt: string;
  version: number;
}

export interface Package extends PackageSummary {
  statusHistory: StatusChange<PackageStatus>[];
}

export interface CarrierRef {
  code: string;
  name: string;
}

/** Đơn vị vận chuyển sàn cho phép với kiện; `isDefault` chọn sẵn */
export interface Carrier extends CarrierRef {
  isDefault: boolean;
}

export interface CarrierList {
  items: Carrier[];
}

/** Loại chứng từ in từ sàn: vận đơn */
export type PackageDocumentKind = 'awb';

export interface PickListLine extends FulfillmentLine {
  /** Số kiện có biến thể này */
  packageCount: number;
}

export interface DocRef {
  id: string;
  number: string;
}

export interface BulkFailure {
  packageId: string;
  code: string;
  detail: string;
}

/** Bàn giao hàng loạt: từng kiện riêng, kiện bị chặn không làm hỏng kiện khác */
export interface HandOverResult {
  handedOver: { id: string; code: string; issue: DocRef }[];
  failed: BulkFailure[];
}

/** Chia đơn: mỗi kiện mới là một nhóm dòng; dòng không nêu ở lại kiện cũ */
export interface SplitInput {
  version: number;
  parts: { variantId: string; quantity: number }[][];
}

export type PackageTab =
  | 'backordered'
  | 'reserved'
  | 'packed'
  | 'awaiting_pickup'
  | 'shipping'
  | 'delivery_failed'
  | 'returning'
  | 'needs_open';

/** Hàng đợi kiện: kèm số kiện từng tab để hiện trên tab */
export interface PackageQueue {
  items: PackageSummary[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<PackageTab, number>;
}

/** Cập nhật giao của đơn tạo tay, hộp thư (đơn sàn lấy từ sàn) */
export type DeliveryAction = 'deliver' | 'fail' | 'redeliver' | 'return';
