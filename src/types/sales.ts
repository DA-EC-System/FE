/**
 * Sales types — khớp với sales.customers, sales.orders, sales.order_lines trong DBML.
 * Khách hàng, tạo đơn tay, xác nhận đơn (UC-SF-01, UC-SF-02, UC-SF-04).
 * Hợp đồng API đề xuất ở commerio-backend#24, chờ chốt vào Documents/21 mục 13.
 */

import type { Marketplace } from './shop';

export type OrderSource = 'marketplace' | 'inbox' | 'manual';

export type PaymentMethod = 'prepaid' | 'cod';

/** fulfillment_status trong DBML */
export type OrderStatus =
  | 'pending_confirmation'
  | 'confirmed'
  | 'picking'
  | 'packing'
  | 'issued'
  | 'in_transit'
  | 'delivered'
  | 'delivery_failed'
  | 'cancelled';

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
}

export interface OrderShopRef {
  id: string;
  shopName: string;
  platform: Marketplace;
}

export interface OrderSummary {
  id: string;
  code: string;
  source: OrderSource;
  shop: OrderShopRef | null;
  /** null với đơn sàn chưa có khách */
  customer: { id: string; name: string; phone: string } | null;
  status: OrderStatus;
  isShortStock: boolean;
  /** null với đơn sàn (sàn thu hộ) */
  paymentMethod: PaymentMethod | null;
  total: number;
  lineCount: number;
  createdAt: string;
  createdBy: UserRef | null;
  version: number;
}

export interface OrderLine {
  id: string;
  variantId: string;
  sku: string;
  productName: string;
  attributesLabel: string;
  quantity: number;
  /** Giá chuẩn lúc tạo đơn, ghi cứng vào dòng (QT-12) */
  unitPrice: number;
  lineTotal: number;
  /** Tồn khả dụng hiện tại của biến thể */
  available: number;
}

/** Ai đổi trạng thái: người dùng, sàn đẩy về, hay hệ thống tự làm */
export type StatusChangeSource = 'user' | 'marketplace' | 'system';

export interface OrderStatusChange {
  from: OrderStatus | null;
  to: OrderStatus;
  at: string;
  by: UserRef | null;
  source: StatusChangeSource;
  /** Lý do huỷ, giao không thành công */
  reason: string | null;
}

export interface Order extends OrderSummary {
  shippingAddress: ShippingAddress;
  subtotal: number;
  shippingFee: number;
  note: string;
  cancelReason: string | null;
  lines: OrderLine[];
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
  note?: string;
}

/** 409 insufficient_stock khi xác nhận */
export interface ShortLine {
  variantId: string;
  sku: string;
  requested: number;
  available: number;
}
