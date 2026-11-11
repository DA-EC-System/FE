import { cn } from '@/lib/utils';
import { formatDateTime } from '@/utils/format';
import type { StatusChange } from '@/lib/stateMachine';
import { SelfApprovedTag } from './SelfApprovedTag';
import { StatusBadge, type StatusMeta } from './StatusBadge';

const actorOf = (h: StatusChange) => {
  if (h.by) return h.by.name;
  return h.source === 'marketplace' ? 'Sàn' : 'Hệ thống';
};

/**
 * Dòng thời gian trạng thái, mới nhất trên cùng; dùng chung cho đơn, kiện, phiếu.
 * Kiểu .tl của Test_UI (FE#129): trục dọc 1px, chấm tròn 10px viền 2px, mốc mới nhất viền xanh.
 */
export function StatusTimeline<S extends string>({
  history,
  statuses,
}: {
  history: StatusChange<S>[];
  statuses: Record<S, StatusMeta>;
}) {
  return (
    <ol
      className="relative grid text-sm before:absolute before:start-[4.5px] before:top-2 before:bottom-2 before:w-px before:bg-border"
      data-testid="status-history"
    >
      {[...history].reverse().map((h, i) => (
        <li
          key={`${h.at}-${i}`}
          data-current={i === 0 || undefined}
          className={cn(
            'relative ms-5 grid gap-1 pb-4 last:pb-0',
            'before:absolute before:-start-5 before:top-1.5 before:size-2.5 before:rounded-full before:border-2 before:bg-card',
            i === 0 ? 'before:border-primary' : 'before:border-input',
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2">
              <StatusBadge status={h.to} statuses={statuses} />
              <span className="text-muted-foreground">{actorOf(h)}</span>
              {h.selfApproved && <SelfApprovedTag />}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">{formatDateTime(h.at)}</span>
          </div>
          {h.reason && <p data-testid="status-reason">Lý do: {h.reason}</p>}
        </li>
      ))}
    </ol>
  );
}
