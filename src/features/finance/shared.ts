import dayjs from 'dayjs';
import { z } from 'zod';
import { formatCurrency } from '@/utils/format';
import { GATEWAY_LABELS, type BadgeVariant } from '@/features/sales/shared';
import type {
  CodStatus,
  ReceiptSource,
  RefundListStatus,
  UnmatchedReason,
  UnmatchedStatus,
  VoucherPurpose,
  VoucherStatus,
} from '@/types/finance';
import type { Gateway, TransactionSource, TransactionStatus } from '@/types/payment';

type Labelled = { label: string; variant: BadgeVariant };

// ---------- Nhãn (AC-C2) ----------

export const DOC_STATUS: Record<VoucherStatus, Labelled> = {
  draft: { label: 'Nháp', variant: 'warning' },
  posted: { label: 'Đã ghi sổ', variant: 'success' },
  reversed: { label: 'Đã đảo', variant: 'secondary' },
};

export const RECEIPT_SOURCE_LABELS: Record<ReceiptSource, string> = {
  gateway: 'Cổng thanh toán',
  cod: 'Thu COD',
  settlement: 'Đối soát sàn',
  unmatched_assignment: 'Gán khoản chưa khớp',
};

/** `supplier_payment` thuộc UC-PF-08, FE#12 không lập nhưng vẫn cần nhãn khi BE trả về */
export const VOUCHER_PURPOSE_LABELS: Record<VoucherPurpose, string> = {
  customer_refund: 'Hoàn tiền khách',
  unmatched_refund: 'Hoàn khoản thu chưa khớp',
  supplier_payment: 'Trả nhà cung cấp',
};

/** Mục đích lập được ở FE#12 */
export const CREATABLE_PURPOSES = ['customer_refund', 'unmatched_refund'] as const;

export const COD_STATUS: Record<CodStatus, Labelled> = {
  cod_pending: { label: 'Chờ thu', variant: 'info' },
  cod_collected: { label: 'Đã thu', variant: 'success' },
  not_collected: { label: 'Không thu', variant: 'secondary' },
};

export const REFUND_STATUS: Record<RefundListStatus, Labelled> = {
  pending_refund: { label: 'Chờ hoàn tiền', variant: 'warning' },
  refunded: { label: 'Đã hoàn', variant: 'success' },
};

export const UNMATCHED_STATUS: Record<UnmatchedStatus, Labelled> = {
  open: { label: 'Chưa xử lý', variant: 'warning' },
  assigned: { label: 'Đã gán', variant: 'success' },
  refunded: { label: 'Đã hoàn lại', variant: 'secondary' },
};

export const UNMATCHED_REASON_LABELS: Record<UnmatchedReason, string> = {
  no_payment_code: 'Không có mã thanh toán',
  amount_mismatch: 'Lệch số tiền',
  order_cancelled: 'Đơn đã huỷ',
};

export const TRANSACTION_STATUS: Record<TransactionStatus, Labelled> = {
  pending: { label: 'Đang chờ', variant: 'info' },
  succeeded: { label: 'Thành công', variant: 'success' },
  failed: { label: 'Thất bại', variant: 'destructive' },
  needs_review: { label: 'Cần xem lại', variant: 'warning' },
};

export const TRANSACTION_SOURCE_LABELS: Record<TransactionSource, string> = {
  webhook: 'Webhook',
  query: 'Tra cứu',
  sepay: 'SePay',
};

export { GATEWAY_LABELS };

/** "Trả qua" của đơn chờ hoàn: mã cổng, hoặc đơn được trả bằng gán khoản thu */
export function paidViaLabel(paidVia: string | null): string {
  if (!paidVia) return '—';
  if (paidVia === 'unmatched_assignment') return RECEIPT_SOURCE_LABELS.unmatched_assignment;
  return GATEWAY_LABELS[paidVia as Gateway] ?? paidVia;
}

export const labelOptions = <K extends string>(labels: Record<K, string | Labelled>, keys?: readonly K[]) =>
  (keys ?? (Object.keys(labels) as K[])).map((value) => {
    const l = labels[value];
    return { value, label: typeof l === 'string' ? l : l.label };
  });

// ---------- Biểu mẫu ----------

export const MAX_NOTE = 500;
export const MAX_COD_BATCH = 100;

/** Hôm nay theo giờ máy (yyyy-mm-dd), mặc định cho Ngày chi */
export const today = () => dayjs().format('YYYY-MM-DD');

// BE không chặn ngày chi tương lai nên FE cũng không chặn (AC mục "Cần chốt" 3)
const paidOnSchema = z
  .string()
  .min(1, 'Chọn ngày chi')
  .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && dayjs(v).isValid(), 'Ngày chi không hợp lệ');

const noteSchema = z.string().trim().max(MAX_NOTE, `Ghi chú tối đa ${MAX_NOTE} ký tự`);

/** Lập phiếu chi nháp (AC-V1); số tiền tự điền theo chứng từ gốc nên không có ô nhập */
export const voucherSchema = z.object({
  purpose: z.enum(CREATABLE_PURPOSES, { message: 'Chọn mục đích chi' }),
  sourceId: z.string().min(1, 'Chọn chứng từ gốc'),
  paidOn: paidOnSchema,
  note: noteSchema,
});
export type VoucherForm = z.input<typeof voucherSchema>;

/** Sửa phiếu nháp (AC-V2), hoàn tiền một bước (AC-R2), hoàn khoản thu (AC-U3) */
export const payoutSchema = z.object({ paidOn: paidOnSchema, note: noteSchema });
export type PayoutForm = z.input<typeof payoutSchema>;

// ---------- Tính toán ----------

/** Tổng tiền các đơn COD đang chọn và có vượt giới hạn mỗi lần không (AC-K2) */
export function codSelection(amounts: number[]) {
  return {
    count: amounts.length,
    total: amounts.reduce((sum, a) => sum + a, 0),
    tooMany: amounts.length > MAX_COD_BATCH,
  };
}

/** Lệch giữa tổng đơn và số tiền khoản thu; null là khớp (AC-U2) */
export function amountGap(orderTotal: number, amount: number): string | null {
  const diff = orderTotal - amount;
  return diff === 0 ? null : `Lệch ${formatCurrency(Math.abs(diff))}`;
}

/** "PT-000007" hoặc "PT-000007 đến PT-000009" cho toast xác nhận COD */
export function numberRange(numbers: string[]): string {
  if (numbers.length <= 1) return numbers[0] ?? '';
  const sorted = [...numbers].sort();
  return `${sorted[0]} đến ${sorted[sorted.length - 1]}`;
}
