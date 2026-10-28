import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { lifecycleSteps, type LifecycleInput, type StepTone } from './lifecycle';

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
