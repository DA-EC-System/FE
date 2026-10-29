import { cn } from '@/lib/utils';
import { formatCurrency } from '@/utils/format';

/** Tiền dạng `1.250.000 ₫`; số âm chữ đỏ (FE#13 AC-C1) */
export function Money({ value, className }: { value: number; className?: string }) {
  return <span className={cn('tabular-nums', value < 0 && 'text-destructive', className)}>{formatCurrency(value)}</span>;
}
