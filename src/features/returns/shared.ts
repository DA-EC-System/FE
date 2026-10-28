import { z } from 'zod';
import type { StatusMeta } from '@/components/common/StatusBadge';
import { MAX_QTY, qtyText } from '@/features/inventory/shared';
import type { ReturnAction, ReturnCloseResult, ReturnStatus, UnmatchedStatus } from '@/types/returns';

export const RETURN_STATUS: Record<ReturnStatus, StatusMeta> = {
  requested: { label: 'Chờ xử lý', variant: 'warning' },
  awaiting_return: { label: 'Chờ hàng về', variant: 'info' },
  received: { label: 'Đã nhận hàng', variant: 'info' },
  closed: { label: 'Đã đóng', variant: 'secondary' },
  rejected: { label: 'Đã từ chối', variant: 'destructive' },
  refund_only: { label: 'Chỉ hoàn tiền', variant: 'success' },
};

export const CLOSE_RESULT_LABELS: Record<ReturnCloseResult, string> = {
  inspected: 'Đã kiểm hàng về',
  no_show: 'Khách không gửi hàng',
  buyer_cancelled: 'Khách rút yêu cầu',
};

export const UNMATCHED_STATUS: Record<UnmatchedStatus, StatusMeta> = {
  open: { label: 'Chờ xử lý', variant: 'warning' },
  attached: { label: 'Đã gắn yêu cầu', variant: 'success' },
  dismissed: { label: 'Đã xử lý khác', variant: 'secondary' },
};

/** Tab danh sách theo trạng thái; "Không khớp" là khu chờ xử lý kiện lạ */
export const RETURN_TABS: { value: ReturnStatus | 'all' | 'unmatched'; label: string }[] = [
  { value: 'requested', label: 'Chờ xử lý' },
  { value: 'awaiting_return', label: 'Chờ hàng về' },
  { value: 'received', label: 'Đã nhận hàng' },
  { value: 'rejected', label: 'Đã từ chối' },
  { value: 'refund_only', label: 'Chỉ hoàn tiền' },
  { value: 'closed', label: 'Đã đóng' },
  { value: 'all', label: 'Tất cả' },
  { value: 'unmatched', label: 'Không khớp' },
];

/** Thao tác dẫn tới lý do bắt buộc thì mở hộp lý do; còn lại hỏi xác nhận */
export const ACTION_MESSAGES: Partial<Record<ReturnAction, string>> = {
  accept: 'Khách gửi hàng về. Khi kho quét nhận, yêu cầu sang Đã nhận hàng và lập phiếu kiểm hàng về.',
  refund_only: 'Hoàn tiền cho khách, khách giữ hàng. Yêu cầu kết thúc, không có hàng về kho.',
  platform_reopen: 'Ghi nhận sàn xử cho khách: yêu cầu mở lại, chờ khách gửi hàng về.',
  platform_refund: 'Ghi nhận sàn xử cho khách: hoàn tiền, khách giữ hàng.',
};

export const MAX_REASON = 500;

export const receiveSchema = z.object({
  code: z.string().trim().min(1, 'Quét hoặc nhập mã').max(100, 'Mã tối đa 100 ký tự'),
  note: z.string().trim().max(MAX_REASON, `Ghi chú tối đa ${MAX_REASON} ký tự`),
});

export type ReceiveForm = z.infer<typeof receiveSchema>;

/** Lập yêu cầu trả cho đơn tạo tay: số trả từng dòng không vượt số còn trả được */
export const createReturnSchema = z
  .object({
    reason: z.string().trim().min(1, 'Nhập lý do trả').max(MAX_REASON, `Lý do tối đa ${MAX_REASON} ký tự`),
    lines: z.array(
      z.object({
        variantId: z.string(),
        returnable: z.number(),
        quantity: qtyText(0, MAX_QTY, 'Số trả'),
      }),
    ),
  })
  .superRefine((v, ctx) => {
    v.lines.forEach((l, i) => {
      if (l.quantity > l.returnable) {
        ctx.addIssue({ code: 'custom', path: ['lines', i, 'quantity'], message: `Còn trả được ${l.returnable}` });
      }
    });
    if (!v.lines.some((l) => l.quantity > 0)) {
      ctx.addIssue({ code: 'custom', path: ['lines'], message: 'Chọn ít nhất một dòng trả' });
    }
  });

export type CreateReturnInputForm = z.input<typeof createReturnSchema>;
export type CreateReturnOutput = z.output<typeof createReturnSchema>;
