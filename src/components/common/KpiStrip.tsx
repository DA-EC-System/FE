import type { HTMLAttributes, ReactNode } from 'react';
import { HelpTip } from '@/components/common/HelpTip';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Dải chỉ số theo `.kpis` của Test_UI v4 (FE#134): các ô chung một khung, ngăn bằng vạch mảnh.
 * Ô co giãn và xuống dòng theo bề ngang, nên 3, 4 hay 7 ô đều kín hàng, không chừa ô trống.
 */
export function KpiStrip({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap overflow-hidden rounded-lg border bg-card', className)}>
      {children}
    </div>
  );
}

interface KpiProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  label: string;
  /** Cách tính chỉ số, hiện ở nút "?" cạnh tên thay cho câu chú thích dưới số */
  help?: ReactNode;
  value: ReactNode;
  /** Đơn vị nhỏ sau số: "tr₫", "việc" */
  unit?: string;
  /** Dòng nhỏ dưới số: so sánh kỳ trước, biên lãi, link */
  detail?: ReactNode;
  /** Chuỗi số vẽ sparkline góc phải */
  spark?: number[];
  loading?: boolean;
}

export function Kpi({ label, help, value, unit, detail, spark, loading, className, ...rest }: KpiProps) {
  return (
    <div
      className={cn('relative -mt-px -ms-px min-w-[160px] flex-1 basis-[200px] border-s border-t px-[18px] py-4', className)}
      {...rest}
    >
      {spark && spark.length > 1 && <Sparkline values={spark} className="absolute end-4 top-4" />}
      <div className="flex items-center gap-1 text-[12.5px] text-muted-foreground">
        <span>{label}</span>
        {help && <HelpTip content={help} topic={label} />}
      </div>
      {loading ? (
        <Skeleton className="mt-1.5 h-7 w-24" />
      ) : (
        <div className="mt-1 text-2xl leading-tight font-semibold tracking-tight [font-variant-numeric:tabular-nums]">
          {value}
          {unit && <small className="ms-0.5 text-[15px] font-medium text-muted-foreground">{unit}</small>}
        </div>
      )}
      {detail && <div className="mt-1 text-[12.5px] text-muted-foreground">{detail}</div>}
    </div>
  );
}

/** Đường xu hướng nhỏ 76×26 (`.spark`), điểm cuối tô đậm; chỉ để nhìn, số thật nằm ở ô */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const w = 76;
  const h = 26;
  const pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / (values.length - 1);
    const y = h - pad - ((v - min) * (h - pad * 2)) / span;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as const;
  });
  const [lx, ly] = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn('h-[26px] w-[76px] overflow-visible', className)} aria-hidden data-testid="sparkline">
      <polyline
        points={points.map((p) => p.join(',')).join(' ')}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lx} cy={ly} r={2.5} fill="var(--chart-2)" />
    </svg>
  );
}
