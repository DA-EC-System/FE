import { formatCurrency } from '@/utils/format';

/** Tooltip biểu đồ theo `.tip` của Test_UI v4: nền chữ đậm, chữ nền sáng, số mono */
export function ChartTip({ active, label, rows }: { active?: boolean; label?: string; rows: { name: string; value: number; color?: string }[] }) {
  if (!active || rows.length === 0) return null;
  return (
    <div className="rounded-md bg-foreground px-2.5 py-1.5 text-xs whitespace-nowrap text-background shadow-sm">
      {label && <div className="mb-0.5 opacity-80">{label}</div>}
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-1.5">
          {r.color && <i className="inline-block size-2 rounded-[2px]" style={{ background: r.color }} />}
          {r.name} <b className="font-mono font-medium">{formatCurrency(r.value)}</b>
        </div>
      ))}
    </div>
  );
}
