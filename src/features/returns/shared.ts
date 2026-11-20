import { z } from 'zod';
import type { StatusMeta } from '@/components/common/StatusBadge';
import { MAX_QTY, qtyText } from '@/features/inventory/shared';
import type { ReturnAction, ReturnCloseResult, ReturnStatus, UnmatchedStatus } from '@/types/returns';

const DAY_MS = 24 * 3600 * 1000;

/**
 * Hạn người bán phải trả lời yêu cầu trả (commerio-backend#392): chỉ có nghĩa khi yêu cầu còn Chờ phản hồi. `urgent` khi còn
 * dưới 24 giờ, `overdue` khi đã qua hạn (sàn có thể tự quyết thay người bán).
 */
export function respondByState(
  status: ReturnStatus,
  respondBy: string | null | undefined,
  now: number = Date.now(),
): { at: string; urgent: boolean; overdue: boolean } | null {
  if (status !== 'requested' || !respondBy) return null;
  const left = new Date(respondBy).getTime() - now;
  if (Number.isNaN(left)) return null;
  return { at: respondBy, urgent: left > 0 && left < DAY_MS, overdue: left <= 0 };
}

export const RETURN_STATUS: Record<ReturnStatus, StatusMeta> = {
  requested: { label: 'Chờ phản hồi', variant: 'warning', hint: 'Người mua vừa gửi yêu cầu. Chấp nhận trả hàng, chỉ hoàn tiền hoặc từ chối trước hạn của sàn.' },
  awaiting_return: { label: 'Chờ hàng hoàn về', variant: 'info', hint: 'Đã chấp nhận, chờ hàng hoàn về kho để quét nhận.' },
  received: { label: 'Đã nhận hàng hoàn', variant: 'info', hint: 'Kho đã nhận hàng hoàn, đang kiểm và phân loại trên phiếu kiểm hàng hoàn.' },
  closed: { label: 'Hoàn thành', variant: 'secondary', hint: 'Yêu cầu đã xong, kết quả ghi bên cạnh.' },
  rejected: { label: 'Đã từ chối', variant: 'destructive', hint: 'Người bán đã từ chối; người mua có thể khiếu nại lên sàn.' },
  refund_only: { label: 'Chỉ hoàn tiền', variant: 'success', hint: 'Hoàn tiền cho người mua, không cần gửi hàng về.' },
};

export const CLOSE_RESULT_LABELS: Record<ReturnCloseResult, string> = {
  inspected: 'Đã kiểm hàng hoàn',
  no_show: 'Người mua không gửi hàng',
  buyer_cancelled: 'Người mua huỷ yêu cầu',
};

export const UNMATCHED_STATUS: Record<UnmatchedStatus, StatusMeta> = {
  open: { label: 'Cần xử lý', variant: 'warning' },
  attached: { label: 'Đã khớp yêu cầu', variant: 'success' },
  dismissed: { label: 'Đã xử lý riêng', variant: 'secondary' },
};

/** Tab danh sách theo trạng thái; "Hàng hoàn chưa rõ đơn" là khu chờ xử lý kiện lạ */
export const RETURN_TABS: { value: ReturnStatus | 'all' | 'unmatched'; label: string }[] = [
  { value: 'requested', label: 'Chờ phản hồi' },
  { value: 'awaiting_return', label: 'Chờ hàng hoàn về' },
  { value: 'received', label: 'Đã nhận hàng hoàn' },
  { value: 'rejected', label: 'Đã từ chối' },
  { value: 'refund_only', label: 'Chỉ hoàn tiền' },
  { value: 'closed', label: 'Hoàn thành' },
  { value: 'all', label: 'Tất cả' },
  { value: 'unmatched', label: 'Hàng hoàn chưa rõ đơn' },
];

/** Thao tác dẫn tới lý do bắt buộc thì mở hộp lý do; còn lại hỏi xác nhận */
export const ACTION_MESSAGES: Partial<Record<ReturnAction, string>> = {
  accept: 'Người mua sẽ gửi hàng về. Khi kho quét nhận, yêu cầu chuyển sang Đã nhận hàng hoàn và tạo phiếu kiểm hàng hoàn.',
  refund_only: 'Hoàn tiền cho người mua, người mua giữ hàng. Yêu cầu kết thúc, không có hàng về kho.',
  platform_reopen: 'Sàn đã duyệt cho người mua trả hàng: yêu cầu mở lại, chờ người mua gửi hàng về.',
  platform_refund: 'Sàn đã duyệt cho người mua chỉ hoàn tiền, người mua giữ hàng.',
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
