import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/utils/format';
import type { OrderStatusChange } from '@/types/sales';
import { ORDER_STATUS } from './shared';

const actorOf = (h: OrderStatusChange) => {
  if (h.by) return h.by.name;
  return h.source === 'marketplace' ? 'Sàn' : 'Hệ thống';
};

/** Dòng thời gian trạng thái đơn, mới nhất trên cùng (AC-L1) */
export function StatusTimeline({ history }: { history: OrderStatusChange[] }) {
  return (
    <ol className="grid gap-3 text-sm" data-testid="status-history">
      {[...history].reverse().map((h, i) => {
        const s = ORDER_STATUS[h.to];
        return (
          <li key={`${h.at}-${i}`} className="grid gap-1 border-s-2 ps-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant={s.variant}>{s.label}</Badge>
                <span className="text-muted-foreground">{actorOf(h)}</span>
              </span>
              <span className="text-muted-foreground">{formatDateTime(h.at)}</span>
            </div>
            {h.reason && <p data-testid="status-reason">Lý do: {h.reason}</p>}
          </li>
        );
      })}
    </ol>
  );
}
