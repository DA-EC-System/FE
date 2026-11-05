import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { lifecycleSteps, type LifecycleInput, type StepTone } from './lifecycle';

/*
 * Kiểu .steps của Test_UI (FE#129): số tròn 24px; bước xong nền xanh có dấu ✓; bước hiện tại viền vàng
 * nhấp nháy nhẹ (--warning); bước lỗi viền đỏ; vạch nối tô xanh chạy từ trái sang khi bước đã qua.
 * Chuyển động tắt khi người dùng chọn prefers-reduced-motion (styles/index.css).
 */
const DOT: Record<StepTone, string> = {
  done: 'border-primary bg-primary text-primary-foreground',
  cur: 'border-warning bg-card font-semibold text-foreground animate-step-ring',
  bad: 'border-destructive bg-destructive-soft text-destructive',
  next: 'border-input bg-card text-muted-foreground',
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
  /** Vạch nối: nền --border, lớp xanh phủ dần (background-size) khi bước bên phải đã tới */
  const line = (tone: StepTone | undefined) =>
    !tone
      ? 'invisible'
      : cn(
          'bg-[linear-gradient(var(--primary),var(--primary)),linear-gradient(var(--border),var(--border))] bg-no-repeat',
          tone === 'next' ? 'bg-size-[0%_100%,100%_100%]' : 'bg-size-[100%_100%,100%_100%] animate-step-fill',
        );
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
              <span className={cn('me-2 h-0.5 flex-1 rounded-full', k === 0 ? 'invisible' : line(tone))} />
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full border text-sm tabular-nums transition-colors duration-300',
                  DOT[tone],
                )}
              >
                {tone === 'done' ? (
                  <Check className="size-3.5" strokeWidth={3} aria-hidden />
                ) : tone === 'bad' ? (
                  <X className="size-3.5" strokeWidth={3} aria-hidden />
                ) : (
                  k + 1
                )}
              </span>
              <span className={cn('ms-2 h-0.5 flex-1 rounded-full', line(steps[k + 1]?.tone))} />
            </div>
            <span
              className={cn(
                'px-1 text-sm',
                tone === 'next' && 'text-muted-foreground',
                tone === 'done' && 'text-foreground-2',
                tone === 'cur' && 'font-semibold text-foreground',
                tone === 'bad' && 'font-semibold text-destructive',
              )}
            >
              {input.statuses[status]?.label ?? status}
            </span>
          </li>
        ))}
      </ol>
      {blocked.length > 0 && (
        <p
          className="rounded-lg border border-warning-border bg-warning-soft px-3 py-2 text-sm text-foreground"
          data-testid="lifecycle-blocked"
        >
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
