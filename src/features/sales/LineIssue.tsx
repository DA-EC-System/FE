import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import type { OrderLine } from '@/types/sales';
import { CANCEL_KIND_LABELS, initiatorLabel, lineHasIssue } from './shared';

/**
 * Dòng bị huỷ hoặc trả trên sàn: huỷ hay trả, do ai, lý do, mã đơn ngược.
 * `cancelPending`: khách đang xin huỷ, chưa trả lời (xem `lineCancelPending`), chỉ ghi Khách xin huỷ kèm lý do.
 * Có đơn ngược mà sàn không báo loại (Lazada không trả `cancel_return_initiator`) và món đã giao (`delivered`, xem
 * `lineDelivered`) là trả hàng, không phải huỷ (FE#252). Món chưa giao có đơn ngược là khách xin huỷ (`cancelPending`).
 * `returnHref` dẫn tới yêu cầu trả khi biết.
 */
export function LineIssue({
  line,
  cancelPending = false,
  delivered = false,
  returnHref = null,
}: {
  line: OrderLine;
  cancelPending?: boolean;
  delivered?: boolean;
  returnHref?: string | null;
}) {
  if (!lineHasIssue(line)) return null;
  const reverseOnly =
    delivered && !line.cancelKind && !line.returnStatus && Boolean(line.reverseOrderId) && !(line.cancelledQty ?? 0);
  const isReturn = line.cancelKind === 'return' || line.cancelKind === 'refund' || (!line.cancelKind && line.returnStatus) || reverseOnly;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 text-xs" data-testid="line-issue">
      {cancelPending ? (
        <Badge variant="warning">Yêu cầu huỷ</Badge>
      ) : isReturn ? (
        <Badge variant="warning" data-testid="line-return">
          {CANCEL_KIND_LABELS[line.cancelKind ?? 'return']}
          {line.returnStatus && `: ${line.returnStatus}`}
        </Badge>
      ) : line.cancelKind === 'failed_delivery' ? (
        <Badge variant="warning">
          {CANCEL_KIND_LABELS.failed_delivery}
          {line.returnStatus && `: ${line.returnStatus}`}
        </Badge>
      ) : (
        <Badge variant="destructive">Đã huỷ</Badge>
      )}
      {line.cancelInitiator && !cancelPending && <span className="text-muted-foreground">do {initiatorLabel(line.cancelInitiator)}</span>}
      {(line.cancelReason || line.cancelReasonDetail) && (
        <span className="text-muted-foreground">
          · Lý do: {line.cancelReason && line.cancelReasonDetail
            ? `${line.cancelReason} (${line.cancelReasonDetail})`
            : line.cancelReason || line.cancelReasonDetail}
        </span>
      )}
      {line.reverseOrderId && <span className="text-muted-foreground">· Mã yêu cầu trả hàng {line.reverseOrderId}</span>}
      {isReturn && returnHref && !cancelPending && (
        <Link className="text-primary underline-offset-4 hover:underline" to={returnHref} data-testid="line-return-link">
          Xem yêu cầu trả hàng
        </Link>
      )}
    </div>
  );
}
