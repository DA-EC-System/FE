import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/utils/format';
import type { StatusChange } from '@/lib/stateMachine';
import { SelfApprovedTag } from './SelfApprovedTag';
import { StatusBadge, type StatusMeta } from './StatusBadge';

const actorOf = (h: StatusChange) => {
  if (h.by) return h.by.name;
  return h.source === 'marketplace' ? 'Sàn' : 'Hệ thống';
};

/** Mốc không đổi trạng thái xen vào dòng thời gian (vd huỷ món của đơn). `at` null: không có giờ, xếp ngay sau mốc đầu. */
export interface TimelineEvent {
  key: string;
  at: string | null;
  content: ReactNode;
}

type Item<S extends string> = { kind: 'status'; at: string; h: StatusChange<S> } | { kind: 'event'; at: string | null; e: TimelineEvent };

/**
 * Dòng thời gian trạng thái, mới nhất trên cùng; dùng chung cho đơn, kiện, phiếu. `events` xen theo thời gian.
 * Kiểu .tl của Test_UI (FE#129): trục dọc 1px, chấm tròn 10px viền 2px, mốc mới nhất viền xanh.
 */
export function StatusTimeline<S extends string>({
  history,
  statuses,
  events = [],
}: {
  history: StatusChange<S>[];
  statuses: Record<S, StatusMeta>;
  events?: TimelineEvent[];
}) {
  const first = history[0]?.at ?? '';
  // Cũ trước mới sau; cùng mốc thì trạng thái trước. Mốc không giờ lấy giờ của mốc đầu, nên đứng ngay sau nó.
  const items: Item<S>[] = [
    ...history.map((h) => ({ kind: 'status' as const, at: h.at, h })),
    ...events.map((e) => ({ kind: 'event' as const, at: e.at, e })),
  ];
  const sorted = items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (a.it.at ?? first).localeCompare(b.it.at ?? first) || a.i - b.i)
    .map(({ it }) => it)
    .reverse();
  return (
    <ol
      className="relative grid text-sm before:absolute before:start-[4.5px] before:top-2 before:bottom-2 before:w-px before:bg-border"
      data-testid="status-history"
    >
      {sorted.map((item, i) => (
        <li
          key={item.kind === 'status' ? `${item.at}-${i}` : item.e.key}
          data-current={i === 0 || undefined}
          className={cn(
            'relative ms-5 grid gap-1 pb-4 last:pb-0',
            'before:absolute before:-start-5 before:top-1.5 before:size-2.5 before:rounded-full before:border-2 before:bg-card',
            i === 0 ? 'before:border-primary' : 'before:border-input',
          )}
        >
          {item.kind === 'status' ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={item.h.to} statuses={statuses} />
                  <span className="text-muted-foreground">{actorOf(item.h)}</span>
                  {item.h.selfApproved && <SelfApprovedTag />}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">{formatDateTime(item.h.at)}</span>
              </div>
              {item.h.reason && <p data-testid="status-reason">Lý do: {item.h.reason}</p>}
            </>
          ) : (
            <div data-testid="timeline-event">{item.e.content}</div>
          )}
        </li>
      ))}
    </ol>
  );
}
