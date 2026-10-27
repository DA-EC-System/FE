import { Badge } from '@/components/ui/badge';
import type { StockLevel } from '@/types/inventory';
import { STOCK_STATE, formatQty } from './shared';

/** Nhãn suy ra của một dòng tồn (sơ đồ B2): Sắp hết, Hết hàng, Đang về N, Thiếu N, Chờ xử lý N, Tồn âm, Lệch tồn */
export function StockChips({ level }: { level: StockLevel }) {
  const chips: { label: string; variant: 'warning' | 'destructive' | 'info' | 'secondary' }[] = [];
  if (level.negative) chips.push({ label: 'Tồn âm', variant: 'destructive' });
  if (level.state !== 'in_stock') chips.push(STOCK_STATE[level.state] as (typeof chips)[number]);
  if (level.shortage) chips.push({ label: `Thiếu ${formatQty(level.shortage)}`, variant: 'destructive' });
  if (level.incoming) chips.push({ label: `Đang về ${formatQty(level.incoming)}`, variant: 'info' });
  if (level.quarantine) chips.push({ label: `Chờ xử lý ${formatQty(level.quarantine)}`, variant: 'secondary' });
  if (level.drift) chips.push({ label: 'Lệch tồn sàn', variant: 'warning' });
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-1" data-testid="stock-chips">
      {chips.map((c) => (
        <Badge key={c.label} variant={c.variant}>
          {c.label}
        </Badge>
      ))}
    </div>
  );
}
