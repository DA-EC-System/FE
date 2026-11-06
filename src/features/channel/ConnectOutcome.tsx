import type { ComponentType, ReactNode } from 'react';
import { Check, Circle, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/* ---------- Các bước đang chạy (.ostep của Test_UI) ---------- */

/** Danh sách bước: bước trước `current` đã xong, bước `current` đang chạy, sau đó là chờ */
export function ConnectSteps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="grid" aria-label="Các bước kết nối" data-testid="connect-steps">
      {steps.map((label, k) => {
        const tone = k < current ? 'done' : k === current ? 'run' : 'next';
        return (
          <li
            key={label}
            data-tone={tone}
            aria-current={tone === 'run' ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2.5 py-2 text-sm',
              k > 0 && 'border-t',
              tone === 'next' && 'text-muted-foreground',
              tone === 'run' && 'text-foreground',
              tone === 'done' && 'text-foreground-2',
            )}
          >
            <span className="grid size-5 place-items-center" aria-hidden>
              {tone === 'done' ? (
                <Check className="size-4 text-success" strokeWidth={3} />
              ) : tone === 'run' ? (
                <Loader2 className="size-4 animate-spin text-primary" />
              ) : (
                <Circle className="size-3.5 text-faint" />
              )}
            </span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Màn kết quả (.result của Test_UI) ---------- */

type Tone = 'ok' | 'bad' | 'warn' | 'neutral';
const TONE: Record<Tone, string> = {
  ok: 'bg-success-soft text-success',
  bad: 'bg-destructive-soft text-destructive',
  warn: 'bg-warning-soft text-warning',
  neutral: 'bg-muted text-muted-foreground',
};

export interface ResultScreenProps {
  tone: Tone;
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: ReactNode;
  /** Ô thông tin dạng nhãn nhỏ / giá trị */
  facts?: { label: string; value: ReactNode }[];
  /** Phần riêng của từng tình huống (so sánh, các bước sửa) */
  children?: ReactNode;
  actions?: ReactNode;
  /** Mã tình huống cho kiểm thử */
  outcome: string;
}

export function ResultScreen({ tone, icon: Icon, title, description, facts, children, actions, outcome }: ResultScreenProps) {
  return (
    <Card className="mx-auto mt-2 w-full max-w-[600px] items-center px-4 py-7 text-center sm:px-7 sm:py-9" data-outcome={outcome}>
      <span aria-hidden className={cn('grid size-16 place-items-center rounded-full', TONE[tone])}>
        <Icon className="size-7" />
      </span>
      <div className="grid gap-1.5">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mx-auto max-w-[46ch] text-muted-foreground">{description}</p>
      </div>
      {facts && facts.length > 0 && (
        <dl className="grid w-full grid-cols-2 gap-3 rounded-lg bg-muted px-4 py-3.5 text-start sm:grid-cols-3">
          {facts.map((f) => (
            <div key={f.label} className="grid gap-0.5">
              <dt className="text-xs text-muted-foreground">{f.label}</dt>
              <dd className="font-medium break-words">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
      {actions && <div className="flex flex-wrap justify-center gap-2">{actions}</div>}
    </Card>
  );
}

/* ---------- Ô gian hàng khi so sánh (409 shop_mismatch) ---------- */

export interface ShopRef {
  name: string | null;
  externalShopId: string;
}

export function ShopBox({ label, shop, miss }: { label: string; shop: ShopRef; miss?: boolean }) {
  return (
    <div
      className={cn(
        'grid min-w-40 flex-1 gap-0.5 rounded-lg border px-4 py-3',
        miss ? 'border-warning-border bg-warning-soft' : 'bg-card',
      )}
    >
      <small className="text-xs text-muted-foreground">{label}</small>
      <b className="font-medium">{shop.name ?? shop.externalShopId}</b>
      <span className="font-mono text-xs text-muted-foreground">{shop.externalShopId}</span>
    </div>
  );
}
