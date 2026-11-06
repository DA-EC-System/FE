/**
 * Sales types — khớp với sales.customers, sales.orders, sales.order_lines trong DBML.
 * Khách hàng, tạo đơn tay (UC-SF-01, UC-SF-02). Đơn theo sơ đồ D1 (FE#59): 4 trạng thái lưu,
 * giai đoạn chi tiết suy từ kiện. Hợp đồng API ở Documents/21 mục 13 và 19.
 */

import type { StatusChange } from '@/lib/stateMachine';
import type { PackageStatus, PackageSummary } from './fulfillment';
import type { Marketplace } from './shop';

export type OrderSource = 'marketplace' | 'inbox' | 'manual';

export type PaymentMethod = 'prepaid' | 'cod';

/** Trạng thái lưu của đơn (sơ đồ D1) */
export type OrderStatus = 'unpaid' | 'processing' | 'completed' | 'cancelled';

export type OrderAction =
  | 'confirm'
  | 'pay'
  | 'complete'
  | 'cancel'
  | 'platform_cancel'
  | 'cancel_on_platform'
  | 'auto_cancel';

/**
 * Cờ trên đơn, không phải trạng thái. Đang huỷ: đã huỷ nhưng còn kiện đóng gói chờ mở.
 * Sàn đã huỷ: sàn huỷ khi kiện đã bàn giao, kiện chạy tiếp tới khi dừng.
 */
export type OrderFlag =
  | 'needs_attention'
  | 'unmapped_sku'
  | 'cancel_requested'
  | 'cancelling'
  | 'platform_cancelled'
  | 'due_soon'
  | 'return_requested'
  | 'payment_mismatch'
  | 'cod_mismatch'
  | 'shop_disconnected';

/** Kết quả khi hoàn tất: Giao đủ, Giao một phần, Không giao được */
export type OrderOutcome = 'full' | 'partial' | 'none';

/**
 * Giai đoạn hiển thị, suy từ trạng thái đơn và các kiện: nhánh lỗi trước (thất lạc, giao thất bại, đang hoàn),
 * rồi kiện chậm nhất
 */
export type OrderStage =
  | 'awaiting_payment'
  | 'awaiting_confirmation'
  | 'unmapped'
  | 'cancelling'
  | 'awaiting_completion'
  | 'completed'
  | 'cancelled'
  | Exclude<PackageStatus, 'cancelled'>;

export interface OrderDisplay {
  stage: OrderStage;
  /** Kiện đã giao / kiện chưa huỷ: "x/y kiện đã giao" khi đơn có nhiều kiện */
  delivered: number;
  packages: number;
}

/** Kênh của khách: sàn nơi khách mua, hoặc tạo tay */
export type CustomerChannel = Marketplace | 'manual';

export interface UserRef {
  id: string;
  name: string;
}

export interface CustomerSummary {
  id: string;
  name: string;
  phone: string;
  email: string;
  channels: CustomerChannel[];
  orderCount: number;
  /** Tổng các đơn chưa huỷ */
  totalSpent: number;
  lastOrderAt: string | null;
  createdAt: string;
}

export interface CustomerIdentity {
  channelKind: Marketplace;
  externalUserId: string;
  displayName: string;
}

export interface Customer extends CustomerSummary {
  address: string;
  note: string;
  identities: CustomerIdentity[];
  version: number;
}

export interface ShippingAddress {
  name: string;
  phone: string;
  address: string;
  /** Phường/xã của đơn sàn: phần duy nhất Lazada không che; tỉnh, đường bị che, không còn cấp quận (commerio-backend#260). null với đơn tạo tay */
  ward?: string | null;
  postCode?: string | null;
}

export interface OrderShopRef {
  id: string;
  shopName: string;
  platform: Marketplace;
}

export interface OrderSummary {
  paymentStatus?: import('./settlement').SettlementStatus;
  id: string;
  code: string;
  source: OrderSource;
  shop: OrderShopRef | null;
  /** null với đơn sàn chưa có khách */
  customer: { id: string; name: string; phone: string } | null;
  status: OrderStatus;
  display: OrderDisplay;
  flags: OrderFlag[];
  outcome: OrderOutcome | null;
  /** Trạng thái gốc trên sàn, hiện cạnh trạng thái của app */
  rawMarketplaceStatus: string | null;
  /** null với đơn sàn (sàn thu hộ) */
  paymentMethod: PaymentMethod | null;
  /** Phương thức khách trả trên sàn, giá trị gốc (`COD`, `MIXEDCARD`…); null với đơn tạo tay (commerio-backend#260) */
  platformPaymentMethod?: string | null;
  /** Hạn bàn giao; còn dưới 24 giờ mà chưa bàn giao thì cờ Sắp trễ hạn */
  shipBy: string | null;
  total: number;
  lineCount: number;
  /** Tổng số lượng mọi dòng */
  totalQty?: number;
  /** Mã đơn trên sàn; null với đơn tạo tay, hộp thư */
  externalOrderId?: string | null;
  /** Tên người nhận (sàn có thể che một phần), dùng khi đơn chưa gắn khách */
  recipientName?: string | null;
  /** Dòng đầu của đơn để hiện ở danh sách; null khi đơn không có dòng */
  itemsPreview?: OrderItemPreview | null;
  createdAt: string;
  createdBy: UserRef | null;
  version: number;
}

export interface OrderItemPreview {
  productName: string;
  attributesLabel: string | null;
  thumbnailUrl: string | null;
  quantity: number;
}

export interface OrderLine {
  id: string;
  /** null khi dòng sàn chưa ghép SKU */
  variantId: string | null;
  sku: string;
  productName: string;
  attributesLabel: string;
  quantity: number;
  /** Giá chuẩn lúc tạo đơn, ghi cứng vào dòng (QT-12) */
  unitPrice: number;
  lineTotal: number;
  /** Tồn khả dụng hiện tại của biến thể */
  available: number;
  /** SKU sàn khi dòng chưa ghép (cờ Chưa ghép SKU); variantId rỗng */
  externalSku: string | null;
  /** Ảnh của SKU trên sàn, hoặc ảnh biến thể trong app khi sàn không trả */
  thumbnailUrl?: string | null;
  /** Định danh phía sàn (Lazada `sku_id`, `shop_sku`, `product_id`); null với đơn tạo tay */
  externalSkuId?: string | null;
  externalShopSku?: string | null;
  externalProductId?: string | null;
  /** Số tiền khách trả cho dòng sau giảm giá */
  paidPrice?: number | null;
  taxAmount?: number | null;
  /** Dòng bị huỷ hoặc trả trên sàn */
  cancelReason?: string | null;
  cancelReasonDetail?: string | null;
  cancelInitiator?: LineCancelInitiator | null;
  /** Huỷ, trả, hoàn tiền hay giao thất bại (không ai huỷ, cancelInitiator null); null khi dòng không có */
  cancelKind?: LineCancelKind | null;
  reverseOrderId?: string | null;
  returnStatus?: string | null;
}

/** Ai huỷ hoặc yêu cầu trả dòng trên sàn; adapter BE chuẩn hoá, giá trị lạ thành null */
export type LineCancelInitiator = 'buyer' | 'seller' | 'platform';
export type LineCancelKind = 'cancellation' | 'return' | 'refund' | 'failed_delivery';

/** Ai đổi trạng thái: người dùng, sàn đẩy về, hay hệ thống tự làm */
export type StatusChangeSource = 'user' | 'marketplace' | 'system';

export type OrderStatusChange = StatusChange<OrderStatus>;

export interface Order extends OrderSummary {
  /** null khi sàn chưa trả địa chỉ */
  shippingAddress: ShippingAddress | null;
  subtotal: number;
  shippingFee: number;
  /** Phí ship gốc và hai khoản giảm phí ship của đơn sàn; null với đơn tạo tay */
  shippingFeeOriginal?: number | null;
  shippingFeeDiscountSeller?: number | null;
  shippingFeeDiscountPlatform?: number | null;
  note: string;
  /** Ghi chú khách để lại trên sàn */
  buyerNote?: string | null;
  cancelReason: string | null;
  /** Số hoá đơn gửi lên sàn (Lazada SetInvoiceNumber), §19.3 */
  invoiceNumber: string | null;
  lines: OrderLine[];
  packages: PackageSummary[];
  /** Hết hạn trả hàng (tính từ kiện giao cuối); null khi chưa giao kiện nào */
  returnWindowEndsAt: string | null;
  /** Lý do chưa hoàn tất được khi mọi kiện đã dừng */
  completionBlocker: string | null;
  statusHistory: OrderStatusChange[];
}

/** Biến thể đang bán để chọn khi tạo đơn; price null là chưa có giá chuẩn */
export interface OrderVariantOption {
  variantId: string;
  productName: string;
  sku: string;
  attributesLabel: string;
  thumbnailUrl: string | null;
  price: number | null;
  available: number;
}

export type CreateOrderCustomer =
  | { id: string }
  | { name: string; phone: string; email?: string; address?: string };

export interface CreateOrderInput {
  customer: CreateOrderCustomer;
  shippingAddress: ShippingAddress;
  lines: { variantId: string; quantity: number }[];
  shippingFee: number;
  paymentMethod: PaymentMethod;
  /** Người của cửa hàng tự giao, không qua đơn vị vận chuyển */
  selfDelivery?: boolean;
  note?: string;
}

/** Huỷ đơn: huỷ ngay, hay chờ mở các kiện đã đóng gói (cờ Đang huỷ) */
export interface CancelOrderResult {
  order: Order;
  pendingOpen: number;
}

/** Lý do huỷ do sàn trả về sau khi kiểm đơn huỷ được (§19.3) */
export interface CancelReason {
  id: string;
  label: string;
}

export interface CancelReasonList {
  items: CancelReason[];
}

/** Trả lời khách xin huỷ (cờ `cancel_requested`) */
export type CancelRequestDecision = 'accept' | 'reject';
