import { Badge } from '@/components/ui/badge';
import type { OrderLine } from '@/types/sales';
import { CANCEL_KIND_LABELS, initiatorLabel, lineHasIssue } from './shared';

/** Dòng bị huỷ hoặc trả trên sàn: huỷ hay trả, do ai, lý do, mã đơn ngược */
export function LineIssue({ line }: { line: OrderLine }) {
  if (!lineHasIssue(line)) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 text-xs" data-testid="line-issue">
      {line.cancelKind === 'return' || line.cancelKind === 'refund' || (!line.cancelKind && line.returnStatus) ? (
        <Badge variant="warning">
          {CANCEL_KIND_LABELS[line.cancelKind ?? 'return']}
          {line.returnStatus && `: ${line.returnStatus}`}
        </Badge>
      ) : (
        <Badge variant="destructive">Đã huỷ</Badge>
      )}
      {line.cancelInitiator && <span className="text-muted-foreground">do {initiatorLabel(line.cancelInitiator)}</span>}
      {line.cancelReason && (
        <span className="text-muted-foreground">
          · Lý do: {line.cancelReason}
          {line.cancelReasonDetail && ` (${line.cancelReasonDetail})`}
        </span>
      )}
      {line.reverseOrderId && <span className="text-muted-foreground">· Mã đơn ngược {line.reverseOrderId}</span>}
    </div>
  );
}
