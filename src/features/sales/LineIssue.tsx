import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import type { OrderLine } from '@/types/sales';
import { CANCEL_KIND_LABELS, initiatorLabel, lineHasIssue } from './shared';

/**
 * Dòng bị huỷ hoặc trả trên sàn: huỷ hay trả, do ai, lý do, mã đơn ngược.
 * `cancelPending`: khách đang xin huỷ, chưa trả lời (xem `lineCancelPending`), chỉ ghi Khách xin huỷ kèm lý do.
 * Có đơn ngược mà sàn không báo loại (Lazada không trả `cancel_return_initiator`) là trả hàng, không phải huỷ (FE#252);
 * `returnHref` dẫn tới yêu cầu trả khi biết.
 */
export function LineIssue({
  line,
  cancelPending = false,
  returnHref = null,
}: {
  line: OrderLine;
  cancelPending?: boolean;
  returnHref?: string | null;
}) {
  if (!lineHasIssue(line)) return null;
  const reverseOnly = !line.cancelKind && !line.returnStatus && Boolean(line.reverseOrderId) && !(line.cancelledQty ?? 0);
  const isReturn = line.cancelKind === 'return' || line.cancelKind === 'refund' || (!line.cancelKind && line.returnStatus) || reverseOnly;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 text-xs" data-testid="line-issue">
      {cancelPending ? (
        <Badge variant="warning">Khách xin huỷ</Badge>
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
      {line.reverseOrderId && <span className="text-muted-foreground">· Mã đơn ngược {line.reverseOrderId}</span>}
      {isReturn && returnHref && !cancelPending && (
        <Link className="text-primary underline-offset-4 hover:underline" to={returnHref} data-testid="line-return-link">
          Xem yêu cầu trả
        </Link>
      )}
    </div>
  );
}
