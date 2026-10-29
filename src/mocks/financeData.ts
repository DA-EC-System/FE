/**
 * Dữ liệu giả finance.* cho MSW: hoá đơn, phiếu thu, phiếu chi, khoản thu chưa khớp (UC-PF-04..07).
 * Nối với đơn ở salesData và trạng thái tiền, giao dịch cổng ở paymentData. Dữ liệu giả, cổng chỉ sandbox.
 */

import type { Gateway } from '@/types/payment';
import type { DocStatus, ReceiptSource, UnmatchedReason, UnmatchedStatus, VoucherPurpose, VoucherStatus } from '@/types/finance';
import { orders, seedPackages } from './salesData';

export interface MockInvoice {
  id: string;
  companyId: string;
  number: string;
  orderId: string;
  status: DocStatus;
  issuedAt: string;
  version: number;
}

export interface MockReceipt {
  id: string;
  companyId: string;
  number: string;
  source: ReceiptSource;
  orderId: string | null;
  amount: number;
  status: DocStatus;
  postedAt: string;
  gateway: Gateway | null;
  paymentTransactionId: string | null;
  settlementLineId: string | null;
  unmatchedReceiptId: string | null;
  version: number;
}

export interface MockVoucher {
  id: string;
  companyId: string;
  number: string;
  purpose: VoucherPurpose;
  orderId: string | null;
  unmatchedReceiptId: string | null;
  amount: number;
  paidOn: string;
  note: string;
  status: VoucherStatus;
  createdBy: string | null;
  createdAt: string;
  postedBy: string | null;
  postedAt: string | null;
  version: number;
}

export interface MockUnmatched {
  id: string;
  companyId: string;
  receivedAt: string;
  amount: number;
  transferContent: string | null;
  gateway: Gateway | null;
  paymentTransactionId: string | null;
  reason: UnmatchedReason;
  status: UnmatchedStatus;
  suggestedOrderId: string | null;
  assignedOrderId: string | null;
  version: number;
}

type DocKind = 'invoice' | 'receipt' | 'voucher';
const PREFIX: Record<DocKind, string> = { invoice: 'HD', receipt: 'PT', voucher: 'PC' };

/** Bộ đếm số chứng từ theo công ty (Documents/21 T2: HD-000001, PT-…, PC-…) */
export const docCounters: Record<string, Record<DocKind, number>> = {
  'cmp-001': { invoice: 0, receipt: 6, voucher: 3 },
};

export function nextFinanceNumber(companyId: string, kind: DocKind) {
  const counters = (docCounters[companyId] ??= { invoice: 0, receipt: 0, voucher: 0 });
  counters[kind] += 1;
  return `${PREFIX[kind]}-${String(counters[kind]).padStart(6, '0')}`;
}

/** Lần bàn giao kiện đầu tiên của đơn */
const issuedAtOf = (orderId: string) =>
  seedPackages
    .filter((p) => p.orderId === orderId && p.handedOverAt)
    .map((p) => p.handedOverAt!)
    .sort()[0] ?? null;

/** Hoá đơn tự sinh khi bàn giao kiện đầu tiên của đơn, đánh số theo lúc bàn giao */
export const invoices: MockInvoice[] = orders
  .filter((o) => issuedAtOf(o.id))
  .sort((a, b) => issuedAtOf(a.id)!.localeCompare(issuedAtOf(b.id)!))
  .map((o) => ({
    id: `inv-${o.id.slice(4)}`,
    companyId: o.companyId,
    number: nextFinanceNumber(o.companyId, 'invoice'),
    orderId: o.id,
    status: 'posted',
    issuedAt: issuedAtOf(o.id)!,
    version: 1,
  }));

const receipt = (
  n: number,
  fields: Pick<MockReceipt, 'source' | 'orderId' | 'amount' | 'postedAt'> & Partial<MockReceipt>,
): MockReceipt => ({
  id: `rct-${String(n).padStart(4, '0')}`,
  companyId: 'cmp-001',
  number: `PT-${String(n).padStart(6, '0')}`,
  status: 'posted',
  gateway: null,
  paymentTransactionId: null,
  settlementLineId: null,
  unmatchedReceiptId: null,
  version: 1,
  ...fields,
});

/** Đủ bốn nguồn: cổng, COD, đối soát sàn, gán khoản chưa khớp */
export const receipts: MockReceipt[] = [
  receipt(1, { source: 'gateway', orderId: 'ord-1024', amount: 180000, postedAt: '2026-10-06T02:20:00.000Z', gateway: 'momo', paymentTransactionId: 'txn-0003' }),
  receipt(2, { source: 'cod', orderId: 'ord-1021', amount: 330000, postedAt: '2026-10-08T03:00:00.000Z' }),
  receipt(3, { source: 'gateway', orderId: 'ord-1022', amount: 350000, postedAt: '2026-10-12T02:18:00.000Z', gateway: 'vnpay', paymentTransactionId: 'txn-0002' }),
  receipt(4, {
    source: 'unmatched_assignment',
    orderId: 'ord-1023',
    amount: 180000,
    postedAt: '2026-10-13T08:30:00.000Z',
    gateway: 'vietqr',
    paymentTransactionId: 'txn-0008',
    unmatchedReceiptId: 'um-0004',
  }),
  receipt(5, { source: 'settlement', orderId: 'ord-1012', amount: 330000, postedAt: '2026-10-14T05:00:00.000Z', settlementLineId: 'stl-line-0001' }),
  receipt(6, { source: 'gateway', orderId: 'ord-1006', amount: 320000, postedAt: '2026-10-15T02:09:00.000Z', gateway: 'vnpay', paymentTransactionId: 'txn-0001' }),
];

export const vouchers: MockVoucher[] = [
  {
    id: 'pv-0001',
    companyId: 'cmp-001',
    number: 'PC-000001',
    purpose: 'customer_refund',
    orderId: 'ord-1024',
    unmatchedReceiptId: null,
    amount: 180000,
    paidOn: '2026-10-07',
    note: 'Chuyển khoản lại cho khách',
    status: 'posted',
    createdBy: 'acc-001',
    createdAt: '2026-10-07T03:00:00.000Z',
    postedBy: 'acc-001',
    postedAt: '2026-10-07T03:00:00.000Z',
    version: 2,
  },
  {
    id: 'pv-0002',
    companyId: 'cmp-001',
    number: 'PC-000002',
    purpose: 'unmatched_refund',
    orderId: null,
    unmatchedReceiptId: 'um-0005',
    amount: 250000,
    paidOn: '2026-10-10',
    note: 'Khách chuyển nhầm tài khoản',
    status: 'posted',
    createdBy: 'acc-001',
    createdAt: '2026-10-10T02:00:00.000Z',
    postedBy: 'acc-001',
    postedAt: '2026-10-10T02:00:00.000Z',
    version: 2,
  },
  {
    id: 'pv-0003',
    companyId: 'cmp-001',
    number: 'PC-000003',
    purpose: 'customer_refund',
    orderId: 'ord-1022',
    unmatchedReceiptId: null,
    amount: 350000,
    paidOn: '2026-10-18',
    note: '',
    status: 'draft',
    createdBy: 'acc-001',
    createdAt: '2026-10-18T02:00:00.000Z',
    postedBy: null,
    postedAt: null,
    version: 1,
  },
];

export const unmatched: MockUnmatched[] = [
  // Tổng bằng đơn DH-1007 (trả trước, chưa thu) để gán được
  {
    id: 'um-0001',
    companyId: 'cmp-001',
    receivedAt: '2026-10-18T07:30:00.000Z',
    amount: 170000,
    transferContent: 'CHUYEN TIEN MUA AO CHAU',
    gateway: 'vietqr',
    paymentTransactionId: 'txn-0006',
    reason: 'no_payment_code',
    status: 'open',
    suggestedOrderId: null,
    assignedOrderId: null,
    version: 1,
  },
  // Gợi ý DH-1014 nhưng thiếu tiền: chỉ hoàn lại được
  {
    id: 'um-0002',
    companyId: 'cmp-001',
    receivedAt: '2026-10-18T09:10:00.000Z',
    amount: 300000,
    transferContent: 'DH1014 TRAN MINH CHAU',
    gateway: 'vietqr',
    paymentTransactionId: 'txn-0007',
    reason: 'amount_mismatch',
    status: 'open',
    suggestedOrderId: 'ord-1014',
    assignedOrderId: null,
    version: 1,
  },
  {
    id: 'um-0003',
    companyId: 'cmp-001',
    receivedAt: '2026-10-16T05:00:00.000Z',
    amount: 115000,
    transferContent: null,
    gateway: null,
    paymentTransactionId: null,
    reason: 'order_cancelled',
    status: 'open',
    suggestedOrderId: 'ord-1009',
    assignedOrderId: null,
    version: 1,
  },
  {
    id: 'um-0004',
    companyId: 'cmp-001',
    receivedAt: '2026-10-13T08:00:00.000Z',
    amount: 180000,
    transferContent: 'GIA DUNG CK DON AO',
    gateway: 'vietqr',
    paymentTransactionId: 'txn-0008',
    reason: 'no_payment_code',
    status: 'assigned',
    suggestedOrderId: null,
    assignedOrderId: 'ord-1023',
    version: 2,
  },
  {
    id: 'um-0005',
    companyId: 'cmp-001',
    receivedAt: '2026-10-09T04:00:00.000Z',
    amount: 250000,
    transferContent: 'CK NHAM TAI KHOAN',
    gateway: 'vietqr',
    paymentTransactionId: null,
    reason: 'no_payment_code',
    status: 'refunded',
    suggestedOrderId: null,
    assignedOrderId: null,
    version: 2,
  },
  {
    id: 'um-0101',
    companyId: 'cmp-002',
    receivedAt: '2026-10-14T02:00:00.000Z',
    amount: 115000,
    transferContent: null,
    gateway: 'momo',
    paymentTransactionId: 'txn-0009',
    reason: 'no_payment_code',
    status: 'open',
    suggestedOrderId: null,
    assignedOrderId: null,
    version: 1,
  },
];
