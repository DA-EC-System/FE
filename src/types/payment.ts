/**
 * Payment types — cổng và mã thanh toán (UC-PF-01, UC-PF-11).
 * Hợp đồng theo Documents/21 mục 12.3, 12.8 (đã chốt), BE ở commerio-backend#23.
 */

import type { PaymentMethod, UserRef } from './sales';

export type Gateway = 'vnpay' | 'momo' | 'zalopay' | 'vietqr';

export type LinkStatus = 'active' | 'paid' | 'expired' | 'cancelled';

export type PaymentStatus = 'unpaid' | 'paid' | 'cod_pending' | 'cod_collected' | 'not_collected';

export type RefundStatus = 'none' | 'pending_refund' | 'refunded';

/** Các ô khoá của từng cổng; gửi đủ ô khi lưu (T11) */
export interface GatewayCredentialsInput {
  vnpay: { tmnCode: string; hashSecret: string };
  momo: { partnerCode: string; accessKey: string; secretKey: string };
  zalopay: { appId: string; key1: string; key2: string };
  vietqr: { bankBin: string; accountNo: string; accountName: string; sepayApiKey: string };
}

/** API không bao giờ trả khoá đầy đủ, mỗi ô chỉ có 4 ký tự cuối (T4) */
export interface GatewayConfig {
  gateway: Gateway;
  configured: boolean;
  /** Chưa cấu hình: 0 */
  version: number;
  updatedAt: string | null;
  updatedBy: UserRef | null;
  credentials: Record<string, { last4: string }> | null;
  /** Chỉ vietqr, không phải khoá */
  display: { bankBin: string; bankName: string; accountName: string } | null;
  /** Chỉ vietqr: URL SePay riêng của công ty */
  webhookUrl: string | null;
}

/** Người chỉ có payment.link.create chỉ thấy cổng nào đã cấu hình */
export type GatewayAvailability = Pick<GatewayConfig, 'gateway' | 'configured'> & Partial<GatewayConfig>;

export interface BankTransfer {
  bankBin: string;
  bankName: string;
  accountNo: string;
  accountName: string;
  content: string;
}

export interface PaymentLink {
  id: string;
  orderId: string;
  gateway: Gateway;
  paymentCode: string;
  amount: number;
  payUrl: string | null;
  /** Chuỗi để vẽ QR: VietQR là chuỗi EMVCo; cổng khác là QR của cổng hoặc payUrl */
  qrContent: string;
  bankTransfer: BankTransfer | null;
  expiresAt: string;
  status: LinkStatus;
  createdAt: string;
  createdBy: UserRef;
}

export type PaymentLinkHistory = Pick<
  PaymentLink,
  'id' | 'gateway' | 'paymentCode' | 'amount' | 'status' | 'expiresAt' | 'createdAt'
>;

export interface OrderPayment {
  orderId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  refundStatus: RefundStatus;
  amount: number;
  paidAt: string | null;
  activeLink: PaymentLink | null;
  /** Mới nhất trước, tối đa 20 */
  links: PaymentLinkHistory[];
}

export type TransactionStatus = 'pending' | 'succeeded' | 'failed' | 'needs_review';

export type TransactionSource = 'webhook' | 'query' | 'sepay';

/** Giao dịch cổng ghi nhận qua webhook, tra cứu hoặc SePay (UC-PF-03, chỉ xem) */
export interface PaymentTransaction {
  id: string;
  gateway: Gateway;
  gatewayTxnId: string;
  paymentCode: string | null;
  order: { id: string; code: string; customerName: string | null } | null;
  amount: number;
  source: TransactionSource;
  status: TransactionStatus;
  occurredAt: string;
  receipt: { id: string; number: string } | null;
  unmatchedReceiptId: string | null;
}

/** Payload của cổng, BE đã bỏ trường chữ ký */
export interface PaymentTransactionDetail extends PaymentTransaction {
  rawPayload: unknown;
}
