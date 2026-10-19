/**
 * Giao vận: lô nhặt, xuất kho đơn, cập nhật giao (UC-SF-06 đến UC-SF-09).
 * Hợp đồng API đề xuất ở commerio-backend#25.
 */

import type { PaymentStatus } from './payment';
import type { OrderShopRef, OrderSource, OrderStatus, OrderStatusChange, PaymentMethod, UserRef } from './sales';

export type BatchStatus = 'picking' | 'packed' | 'done';

export interface FulfillmentLine {
  variantId: string;
  sku: string;
  productName: string;
  attributesLabel: string;
  quantity: number;
}

/** Đơn ở màn Xử lý đơn: không có giá */
export interface FulfillmentOrder {
  id: string;
  code: string;
  source: OrderSource;
  shop: OrderShopRef | null;
  customerName: string | null;
  status: OrderStatus;
  /** null với đơn sàn */
  paymentMethod: PaymentMethod | null;
  /** Trả trước mà `unpaid` thì chưa xuất được */
  paymentStatus: PaymentStatus | null;
  batch: { id: string; code: string } | null;
  lineCount: number;
  totalQty: number;
  createdAt: string;
  confirmedAt: string | null;
  version: number;
  lines: FulfillmentLine[];
}

export interface BatchSummary {
  id: string;
  code: string;
  status: BatchStatus;
  orderCount: number;
  totalQty: number;
  createdAt: string;
  createdBy: UserRef | null;
  version: number;
}

export interface PickListLine extends FulfillmentLine {
  /** Số đơn trong lô có biến thể này */
  orderCount: number;
}

/** Kho không có quyền xem đơn nên lịch sử trạng thái đi kèm lô (AC-L1) */
export interface BatchOrder extends FulfillmentOrder {
  statusHistory: OrderStatusChange[];
}

export interface Batch extends BatchSummary {
  /** Gộp theo biến thể, sắp theo SKU */
  pickList: PickListLine[];
  orders: BatchOrder[];
}

export interface DocRef {
  id: string;
  number: string;
}

export interface IssueOrderResult {
  order: FulfillmentOrder;
  issue: DocRef;
  invoice: DocRef | null;
}

export interface BatchIssueFailure {
  orderId: string;
  code: string;
  detail: string;
}

export interface BatchIssueResult {
  issued: { id: string; code: string; issue: DocRef }[];
  failed: BatchIssueFailure[];
  batch: BatchSummary;
}

export type DeliveryStatus = 'in_transit' | 'delivered' | 'delivery_failed';
