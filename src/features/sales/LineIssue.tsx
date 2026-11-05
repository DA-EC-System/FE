import { Badge } from '@/components/ui/badge';
import type { OrderLine } from '@/types/sales';
import { LINE_CANCEL_INITIATOR_LABELS } from './shared';

/** Dòng bị huỷ hoặc trả trên sàn: ai huỷ, lý do, trạng thái trả, mã đơn ngược */
export function LineIssue({ line }: { line: OrderLine }) {
  if (!line.cancelReason && !line.cancelInitiator && !line.returnStatus && !line.reverseOrderId) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 text-xs" data-testid="line-issue">
      {line.cancelInitiator && <Badge variant="destructive">{LINE_CANCEL_INITIATOR_LABELS[line.cancelInitiator]}</Badge>}
      {line.returnStatus && <Badge variant="warning">Trả hàng: {line.returnStatus}</Badge>}
      {line.cancelReason && <span className="text-muted-foreground">Lý do: {line.cancelReason}</span>}
      {line.reverseOrderId && <span className="text-muted-foreground">Mã đơn ngược {line.reverseOrderId}</span>}
    </div>
  );
}
