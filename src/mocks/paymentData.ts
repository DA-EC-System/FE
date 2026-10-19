/**
 * Dữ liệu giả payment.* cho MSW: khoá cổng (payment.gateway_configs), mã thanh toán (payment.payment_links),
 * trạng thái tiền của đơn (payment.order_payments). Khoá chỉ là chuỗi giả; BE thật mã hoá AES-256-GCM.
 */

import type { Gateway, LinkStatus, PaymentStatus, RefundStatus, TransactionSource, TransactionStatus } from '@/types/payment';
import type { PaymentMethod } from '@/types/sales';

export const GATEWAYS: Gateway[] = ['vnpay', 'momo', 'zalopay', 'vietqr'];

/** Các ô khoá của từng cổng (Documents/21 mục 12.8) */
export const CREDENTIAL_FIELDS: Record<Gateway, string[]> = {
  vnpay: ['tmnCode', 'hashSecret'],
  momo: ['partnerCode', 'accessKey', 'secretKey'],
  zalopay: ['appId', 'key1', 'key2'],
  vietqr: ['bankBin', 'accountNo', 'accountName', 'sepayApiKey'],
};

export const BANK_NAMES: Record<string, string> = {
  '970436': 'Vietcombank',
  '970415': 'VietinBank',
  '970418': 'BIDV',
  '970422': 'MB Bank',
  '970407': 'Techcombank',
  '970416': 'ACB',
};

export interface MockGatewayConfig {
  companyId: string;
  gateway: Gateway;
  credentials: Record<string, string>;
  /** Chỉ vietqr: khoá trong URL webhook SePay, giữ nguyên khi thay khoá (T12) */
  receiverKey: string | null;
  version: number;
  updatedAt: string;
  updatedBy: string;
}

export interface MockPaymentLink {
  id: string;
  companyId: string;
  orderId: string;
  gateway: Gateway;
  paymentCode: string;
  amount: number;
  payUrl: string | null;
  qrContent: string;
  expiresAt: string;
  status: LinkStatus;
  createdAt: string;
  createdBy: string;
}

export interface MockOrderPayment {
  companyId: string;
  orderId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  refundStatus: RefundStatus;
  paidAt: string | null;
  /** Fulfillment ghi khi giao xong; đơn COD chỉ hiện ở tab Chờ thu khi đã có (#27 AC-25) */
  deliveredAt?: string | null;
  /** Lúc chuyển chờ hoàn tiền (BE lấy `updated_at` của dòng) */
  refundRequestedAt?: string | null;
}

/** payment.payment_transactions: giao dịch cổng báo về qua webhook, tra cứu hoặc SePay */
export interface MockTransaction {
  id: string;
  companyId: string;
  gateway: Gateway;
  gatewayTxnId: string;
  paymentCode: string | null;
  orderId: string | null;
  amount: number;
  source: TransactionSource;
  status: TransactionStatus;
  occurredAt: string;
  rawPayload: Record<string, unknown>;
}

export const gatewayConfigs: MockGatewayConfig[] = [
  {
    companyId: 'cmp-001',
    gateway: 'vnpay',
    credentials: { tmnCode: 'CMRABC26', hashSecret: 'SANDBOXHASHSECRET4821' },
    receiverKey: null,
    version: 1,
    updatedAt: '2026-10-01T03:00:00.000Z',
    updatedBy: 'acc-005',
  },
  {
    companyId: 'cmp-001',
    gateway: 'vietqr',
    credentials: {
      bankBin: '970436',
      accountNo: '0071000123456',
      accountName: 'CONG TY THOI TRANG ABC',
      sepayApiKey: 'SEPAYTESTAPIKEY7731',
    },
    receiverKey: 'k3v9q2m8x7w4t6p1r5s0n2b8c4d6f1g3',
    version: 2,
    updatedAt: '2026-10-02T04:00:00.000Z',
    updatedBy: 'acc-001',
  },
  {
    companyId: 'cmp-002',
    gateway: 'momo',
    credentials: { partnerCode: 'MOMOMP01', accessKey: 'F8BBA842ECF85', secretKey: 'K951B6PE1WAGKLOM' },
    receiverKey: null,
    version: 1,
    updatedAt: '2026-10-03T03:00:00.000Z',
    updatedBy: 'acc-001',
  },
];

export const links: MockPaymentLink[] = [
  {
    id: 'pl-0001',
    companyId: 'cmp-001',
    orderId: 'ord-1006',
    gateway: 'vnpay',
    paymentCode: 'CMQ7H3K9TW2B',
    amount: 320000,
    payUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=CMQ7H3K9TW2B',
    qrContent: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=CMQ7H3K9TW2B',
    expiresAt: '2026-10-15T02:21:00.000Z',
    status: 'paid',
    createdAt: '2026-10-15T02:06:00.000Z',
    createdBy: 'acc-002',
  },
  {
    id: 'pl-0002',
    companyId: 'cmp-001',
    orderId: 'ord-1007',
    gateway: 'vietqr',
    paymentCode: 'CMR4XN8PAD6E',
    amount: 170000,
    payUrl: null,
    qrContent: '',
    expiresAt: '2026-10-16T02:19:00.000Z',
    status: 'expired',
    createdAt: '2026-10-16T02:04:00.000Z',
    createdBy: 'acc-002',
  },
  {
    id: 'pl-0003',
    companyId: 'cmp-001',
    orderId: 'ord-1022',
    gateway: 'vnpay',
    paymentCode: 'CMH8D2KQ4NZA',
    amount: 350000,
    payUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=CMH8D2KQ4NZA',
    qrContent: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=CMH8D2KQ4NZA',
    expiresAt: '2026-10-12T02:30:00.000Z',
    status: 'paid',
    createdAt: '2026-10-12T02:15:00.000Z',
    createdBy: 'acc-002',
  },
  {
    id: 'pl-0004',
    companyId: 'cmp-001',
    orderId: 'ord-1024',
    gateway: 'momo',
    paymentCode: 'CMP3W7XEY5RB',
    amount: 180000,
    payUrl: 'https://test-payment.momo.vn/v2/gateway/pay?orderId=CMP3W7XEY5RB',
    qrContent: 'https://test-payment.momo.vn/v2/gateway/pay?orderId=CMP3W7XEY5RB',
    expiresAt: '2026-10-06T02:30:00.000Z',
    status: 'paid',
    createdAt: '2026-10-06T02:15:00.000Z',
    createdBy: 'acc-002',
  },
];

/** Đơn chưa có dòng ở đây thì trạng thái suy từ đơn (A8) */
export const orderPayments: MockOrderPayment[] = [
  { companyId: 'cmp-001', orderId: 'ord-1001', method: 'cod', status: 'not_collected', refundStatus: 'none', paidAt: null },
  { companyId: 'cmp-001', orderId: 'ord-1006', method: 'prepaid', status: 'paid', refundStatus: 'none', paidAt: '2026-10-15T02:09:00.000Z' },
  { companyId: 'cmp-001', orderId: 'ord-1007', method: 'prepaid', status: 'unpaid', refundStatus: 'none', paidAt: null },
  { companyId: 'cmp-001', orderId: 'ord-1008', method: 'cod', status: 'cod_pending', refundStatus: 'none', paidAt: null },
  { companyId: 'cmp-001', orderId: 'ord-1010', method: 'cod', status: 'cod_pending', refundStatus: 'none', paidAt: null },
  { companyId: 'cmp-001', orderId: 'ord-1011', method: 'cod', status: 'cod_pending', refundStatus: 'none', paidAt: null },
  { companyId: 'cmp-001', orderId: 'ord-1013', method: 'cod', status: 'cod_pending', refundStatus: 'none', paidAt: null },
  { companyId: 'cmp-001', orderId: 'ord-1014', method: 'prepaid', status: 'unpaid', refundStatus: 'none', paidAt: null },
  { companyId: 'cmp-001', orderId: 'ord-1016', method: 'cod', status: 'cod_pending', refundStatus: 'none', paidAt: null },
  { companyId: 'cmp-001', orderId: 'ord-1017', method: 'cod', status: 'cod_pending', refundStatus: 'none', paidAt: null },
  { companyId: 'cmp-002', orderId: 'ord-2001', method: 'cod', status: 'not_collected', refundStatus: 'none', paidAt: null },
  // FE#12: COD đã giao chờ thu, đã thu
  ...(['ord-1018', 'ord-1019', 'ord-1020'] as const).map<MockOrderPayment>((orderId, i) => ({
    companyId: 'cmp-001',
    orderId,
    method: 'cod',
    status: 'cod_pending',
    refundStatus: 'none',
    paidAt: null,
    deliveredAt: `2026-10-${11 + i}T09:00:00.000Z`,
  })),
  {
    companyId: 'cmp-001',
    orderId: 'ord-1021',
    method: 'cod',
    status: 'cod_collected',
    refundStatus: 'none',
    paidAt: '2026-10-08T03:00:00.000Z',
    deliveredAt: '2026-10-07T09:00:00.000Z',
  },
  // FE#12: trả trước đã thu rồi huỷ
  {
    companyId: 'cmp-001',
    orderId: 'ord-1022',
    method: 'prepaid',
    status: 'paid',
    refundStatus: 'pending_refund',
    paidAt: '2026-10-12T02:18:00.000Z',
    refundRequestedAt: '2026-10-13T03:00:00.000Z',
  },
  {
    companyId: 'cmp-001',
    orderId: 'ord-1023',
    method: 'prepaid',
    status: 'paid',
    refundStatus: 'pending_refund',
    paidAt: '2026-10-13T08:30:00.000Z',
    refundRequestedAt: '2026-10-14T03:00:00.000Z',
  },
  {
    companyId: 'cmp-001',
    orderId: 'ord-1024',
    method: 'prepaid',
    status: 'paid',
    refundStatus: 'refunded',
    paidAt: '2026-10-06T02:20:00.000Z',
  },
];

const sandbox = (fields: Record<string, unknown>) => ({ ...fields, sandbox: true });

/** Đủ bốn cổng, bốn trạng thái; giao dịch `needs_review` nối với khoản thu chưa khớp ở financeData */
export const transactions: MockTransaction[] = [
  {
    id: 'txn-0001',
    companyId: 'cmp-001',
    gateway: 'vnpay',
    gatewayTxnId: '14612345',
    paymentCode: 'CMQ7H3K9TW2B',
    orderId: 'ord-1006',
    amount: 320000,
    source: 'webhook',
    status: 'succeeded',
    occurredAt: '2026-10-15T02:09:00.000Z',
    rawPayload: sandbox({ vnp_TxnRef: 'CMQ7H3K9TW2B', vnp_Amount: '32000000', vnp_ResponseCode: '00', vnp_TransactionNo: '14612345', vnp_BankCode: 'NCB' }),
  },
  {
    id: 'txn-0002',
    companyId: 'cmp-001',
    gateway: 'vnpay',
    gatewayTxnId: '14600871',
    paymentCode: 'CMH8D2KQ4NZA',
    orderId: 'ord-1022',
    amount: 350000,
    source: 'webhook',
    status: 'succeeded',
    occurredAt: '2026-10-12T02:18:00.000Z',
    rawPayload: sandbox({ vnp_TxnRef: 'CMH8D2KQ4NZA', vnp_Amount: '35000000', vnp_ResponseCode: '00', vnp_TransactionNo: '14600871', vnp_BankCode: 'NCB' }),
  },
  {
    id: 'txn-0003',
    companyId: 'cmp-001',
    gateway: 'momo',
    gatewayTxnId: '4088123456',
    paymentCode: 'CMP3W7XEY5RB',
    orderId: 'ord-1024',
    amount: 180000,
    source: 'webhook',
    status: 'succeeded',
    occurredAt: '2026-10-06T02:20:00.000Z',
    rawPayload: sandbox({ orderId: 'CMP3W7XEY5RB', amount: 180000, resultCode: 0, transId: 4088123456, payType: 'qr' }),
  },
  {
    id: 'txn-0004',
    companyId: 'cmp-001',
    gateway: 'momo',
    gatewayTxnId: '4088200001',
    paymentCode: 'CMR4XN8PAD6E',
    orderId: 'ord-1007',
    amount: 170000,
    source: 'query',
    status: 'failed',
    occurredAt: '2026-10-16T02:12:00.000Z',
    rawPayload: sandbox({ orderId: 'CMR4XN8PAD6E', amount: 170000, resultCode: 1006, message: 'Người dùng từ chối giao dịch' }),
  },
  {
    id: 'txn-0005',
    companyId: 'cmp-001',
    gateway: 'zalopay',
    gatewayTxnId: '261018_000123',
    paymentCode: null,
    orderId: 'ord-1014',
    amount: 350000,
    source: 'query',
    status: 'pending',
    occurredAt: '2026-10-18T04:00:00.000Z',
    rawPayload: sandbox({ app_trans_id: '261018_000123', amount: 350000, return_code: 3, return_message: 'Giao dịch đang xử lý' }),
  },
  {
    id: 'txn-0006',
    companyId: 'cmp-001',
    gateway: 'vietqr',
    gatewayTxnId: 'SP-91822',
    paymentCode: null,
    orderId: null,
    amount: 170000,
    source: 'sepay',
    status: 'needs_review',
    occurredAt: '2026-10-18T07:30:00.000Z',
    rawPayload: sandbox({ id: 91822, gateway: 'Vietcombank', transferAmount: 170000, content: 'CHUYEN TIEN MUA AO CHAU', transferType: 'in' }),
  },
  {
    id: 'txn-0007',
    companyId: 'cmp-001',
    gateway: 'vietqr',
    gatewayTxnId: 'SP-91840',
    paymentCode: null,
    orderId: null,
    amount: 300000,
    source: 'sepay',
    status: 'needs_review',
    occurredAt: '2026-10-18T09:10:00.000Z',
    rawPayload: sandbox({ id: 91840, gateway: 'Vietcombank', transferAmount: 300000, content: 'DH1014 TRAN MINH CHAU', transferType: 'in' }),
  },
  {
    id: 'txn-0008',
    companyId: 'cmp-001',
    gateway: 'vietqr',
    gatewayTxnId: 'SP-91512',
    paymentCode: null,
    orderId: null,
    amount: 180000,
    source: 'sepay',
    status: 'needs_review',
    occurredAt: '2026-10-13T08:00:00.000Z',
    rawPayload: sandbox({ id: 91512, gateway: 'Vietcombank', transferAmount: 180000, content: 'GIA DUNG CK DON AO', transferType: 'in' }),
  },
  {
    id: 'txn-0009',
    companyId: 'cmp-002',
    gateway: 'momo',
    gatewayTxnId: '4099000001',
    paymentCode: null,
    orderId: null,
    amount: 115000,
    source: 'webhook',
    status: 'needs_review',
    occurredAt: '2026-10-14T02:00:00.000Z',
    rawPayload: sandbox({ orderId: 'CMZZZZZZZZZZ', amount: 115000, resultCode: 0 }),
  },
];

/** Hạn của mã (T9) */
export const LINK_TTL_MS = 15 * 60_000;

// T3: CM + 10 ký tự base32 bỏ 0 O 1 I L
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newPaymentCode(): string {
  let code = 'CM';
  for (let i = 0; i < 10; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return links.some((l) => l.paymentCode === code) ? newPaymentCode() : code;
}

export function newReceiverKey() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let key = '';
  for (let i = 0; i < 32; i++) key += chars[Math.floor(Math.random() * chars.length)];
  return key;
}

// ---------- Chuỗi VietQR (EMVCo) ----------
const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;

function crc16(text: string) {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    crc &= 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** QR chuyển khoản NAPAS 247 có số tiền và nội dung */
export function vietQrContent(bankBin: string, accountNo: string, amount: number, content: string) {
  const beneficiary = tlv('00', bankBin) + tlv('01', accountNo);
  const merchant = tlv('00', 'A000000727') + tlv('01', beneficiary) + tlv('02', 'QRIBFTTA');
  const body =
    tlv('00', '01') +
    tlv('01', '12') +
    tlv('38', merchant) +
    tlv('53', '704') +
    tlv('54', String(amount)) +
    tlv('58', 'VN') +
    tlv('62', tlv('08', content)) +
    '6304';
  return body + crc16(body);
}
