import { formatDateTime } from '@/utils/format';
import type { StatusChange } from '@/lib/stateMachine';
import { StatusBadge, type StatusMeta } from './StatusBadge';

const actorOf = (h: StatusChange) => {
  if (h.by) return h.by.name;
  return h.source === 'marketplace' ? 'Sàn' : 'Hệ thống';
};

/** Dòng thời gian trạng thái, mới nhất trên cùng; dùng chung cho đơn, kiện, phiếu */
export function StatusTimeline<S extends string>({
  history,
  statuses,
}: {
  history: StatusChange<S>[];
  statuses: Record<S, StatusMeta>;
}) {
  return (
    <ol className="grid gap-3 text-sm" data-testid="status-history">
      {[...history].reverse().map((h, i) => (
        <li key={`${h.at}-${i}`} className="grid gap-1 border-s-2 ps-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2">
              <StatusBadge status={h.to} statuses={statuses} />
              <span className="text-muted-foreground">{actorOf(h)}</span>
            </span>
            <span className="text-muted-foreground">{formatDateTime(h.at)}</span>
          </div>
          {h.reason && <p data-testid="status-reason">Lý do: {h.reason}</p>}
        </li>
      ))}
    </ol>
  );
}
