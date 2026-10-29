import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/utils/format';
import type { LedgerLine } from '@/types/finance';

export function LedgerStateBadge({ line }: { line: Pick<LedgerLine, 'estimated' | 'replaced'> }) {
  if (line.replaced) return <Badge variant="outline">Đã thay</Badge>;
  return line.estimated ? <Badge variant="warning">Ước tính</Badge> : <Badge variant="success">Thực tế</Badge>;
}

export function ProfitStateBadge({ estimated }: { estimated: boolean }) {
  return estimated ? <Badge variant="warning">Ước tính</Badge> : <Badge variant="success">Theo quyết toán</Badge>;
}

/** Thuế khấu trừ theo quyết toán khác thuế ước tính */
export function TaxMismatchBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  return (
    <Badge variant="destructive" title={`Thuế thực tế lệch ${formatCurrency(value)} so với ước tính`}>
      Lệch thuế
    </Badge>
  );
}
