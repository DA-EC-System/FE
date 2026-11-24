import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WizardStep, WizardView } from './wizardState';

/**
 * Thanh bước ngang của wizard (FE#468, design v2.html `stepper`): số tròn, dấu tích bước đã xong, bước đang xem tô
 * sáng. Bước mở được (đã xong, hoặc bước kế đang làm) bấm vào để xem; bước sau bị khoá. Màn hẹp chỉ còn một dòng
 * "Bước n/7: tên bước".
 */
export function WizardStepper({ steps, view, onPick }: { steps: WizardStep[]; view: WizardView; onPick: (view: WizardView) => void }) {
  const doneCount = steps.filter((s) => s.done).length;
  const cur = steps.find((s) => s.key === view);
  return (
    <nav aria-label="Các bước thiết lập" className="border-b bg-card" data-testid="wizard-stepper">
      <div className="mx-auto w-full max-w-6xl px-4 py-3 sm:px-6">
        <ol className="hidden grid-flow-col gap-2 lg:grid" style={{ gridAutoColumns: 'minmax(0,1fr)' }}>
          {steps.map((s) => {
            const current = s.key === view;
            const state = current ? ' (đang xem)' : s.done ? ' (đã xong)' : ' (chưa xong)';
            return (
              <li key={s.key} aria-current={current ? 'step' : undefined} data-key={s.key} data-done={s.done}>
                <button
                  type="button"
                  disabled={!s.reachable || current}
                  onClick={() => onPick(s.key)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-start text-[13px] leading-tight',
                    s.reachable && !current && 'hover:bg-accent',
                    !s.reachable && 'cursor-not-allowed text-muted-foreground',
                    current && 'font-semibold',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold tabular-nums',
                      s.done && 'border-success bg-success/15 text-success-text',
                      current && 'border-primary bg-primary text-primary-foreground',
                    )}
                  >
                    {s.done && !current ? <Check className="size-3.5" /> : s.index}
                  </span>
                  <span className="min-w-0">{s.label}</span>
                  <span className="sr-only">{state}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="flex items-center justify-between gap-3 text-sm lg:hidden">
          <b className="font-semibold">
            {cur ? `Bước ${cur.index}/${steps.length}: ${cur.label}` : 'Sẵn sàng bán'}
          </b>
          <span className="shrink-0 text-muted-foreground">Đã xong {doneCount}</span>
        </div>
      </div>
    </nav>
  );
}
