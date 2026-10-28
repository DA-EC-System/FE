import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StatusChange } from '@/lib/stateMachine';
import type { StatusMeta } from './StatusBadge';

export type StepTone = 'done' | 'cur' | 'bad' | 'next';

export interface LifecycleInput<S extends string> {
  /** Các bước chính của chứng từ, theo PATHS của Test_UI */
  path: readonly S[];
  current: S;
  history?: readonly StatusChange<S>[];
  statuses: Record<S, StatusMeta>;
  /** Trạng thái kết thúc thì không vẽ các bước sau nó */
  isFinal?: (state: S) => boolean;
}

/**
 * Dựng các bước của thanh tiến trình (theo `lifecycle()` của Test_UI):
 * trạng thái nằm trên đường chính thì các bước trước là đã qua; trạng thái ngoài đường chính
 * (cần sửa, bị từ chối…) chen vào sau bước cuối đã qua, và dừng ở đó nếu là trạng thái kết thúc.
 */
export function lifecycleSteps<S extends string>({
  path,
  current,
  history = [],
  statuses,
  isFinal = () => false,
}: LifecycleInput<S>): { status: S; tone: StepTone }[] {
  const i = path.indexOf(current);
  if (i >= 0) {
    return path.map((status, k) => ({ status, tone: k < i ? 'done' : k === i ? 'cur' : 'next' }));
  }
  const seen = new Set<string>(history.map((h) => h.to));
  const last = path.reduce((acc, s, k) => (seen.has(s) ? k : acc), 0);
  const tone: StepTone = statuses[current]?.variant === 'destructive' ? 'bad' : 'cur';
  return [
    ...path.slice(0, last + 1).map((status) => ({ status, tone: 'done' as const })),
    { status: current, tone },
    ...(isFinal(current) ? [] : path.slice(last + 1).map((status) => ({ status, tone: 'next' as const }))),
  ];
}

const DOT: Record<StepTone, string> = {
  done: 'border-primary bg-primary text-primary-foreground',
  cur: 'border-primary bg-background ring-4 ring-primary/20',
  bad: 'border-destructive bg-background ring-4 ring-destructive/20',
  next: 'border-border bg-background',
};

/**
 * Thanh tiến trình trên trang chi tiết chứng từ. Dưới thanh liệt kê thao tác đang bị chặn kèm lý do,
 * để người xem biết vì sao chưa đi tiếp được.
 */
export function LifecycleSteps<S extends string>({
  blocked = [],
  ...input
}: LifecycleInput<S> & {
  /** Thao tác bị chặn: nhãn nút và lý do tiếng Việt */
  blocked?: { label: string; reason: string }[];
}) {
  const steps = lifecycleSteps(input);
  const line = (tone: StepTone | undefined) => (!tone ? 'invisible' : tone === 'next' ? 'bg-border' : 'bg-primary');
  return (
    <div className="grid gap-2" data-testid="lifecycle">
      <ol aria-label="Tiến trình" className="flex flex-wrap items-start gap-y-3">
        {steps.map(({ status, tone }, k) => (
          <li
            key={`${status}-${k}`}
            data-status={status}
            data-tone={tone}
            aria-current={tone === 'cur' || tone === 'bad' ? 'step' : undefined}
            className="flex min-w-24 flex-1 flex-col items-center gap-1.5 text-center"
          >
            <div className="flex w-full items-center">
              <span className={cn('h-0.5 flex-1', k === 0 ? 'invisible' : line(tone))} />
              <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border-2', DOT[tone])}>
                {tone === 'done' && <Check className="size-3" strokeWidth={3} />}
              </span>
              <span className={cn('h-0.5 flex-1', line(steps[k + 1]?.tone))} />
            </div>
            <span
              className={cn(
                'px-1 text-xs',
                tone === 'next' && 'text-muted-foreground',
                tone === 'cur' && 'font-semibold text-primary',
                tone === 'bad' && 'font-semibold text-destructive',
              )}
            >
              {input.statuses[status]?.label ?? status}
            </span>
          </li>
        ))}
      </ol>
      {blocked.length > 0 && (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning" data-testid="lifecycle-blocked">
          {blocked.map((b, k) => (
            <span key={b.label}>
              {k > 0 && ' · '}
              <b>{b.label}</b>: {b.reason}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
