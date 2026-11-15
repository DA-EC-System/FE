import { Badge } from '@/components/ui/badge';
import { isReplaced } from '@/utils/ledger';
import type { LedgerLine } from '@/types/finance';

export function LedgerStateBadge({ line }: { line: Pick<LedgerLine, 'estimated' | 'replacedBy'> }) {
  if (isReplaced(line)) return <Badge variant="outline">Đã thay</Badge>;
  return line.estimated ? <Badge variant="warning">Ước tính</Badge> : <Badge variant="success">Thực tế</Badge>;
}

export function ProfitStateBadge({ estimated }: { estimated: boolean }) {
  return estimated ? <Badge variant="warning">Ước tính</Badge> : <Badge variant="success">Theo quyết toán</Badge>;
}

/** Cờ của lãi theo đơn, theo SKU (§21.1): thiếu giá vốn, dưới giá thấp nhất thực tế */
export function ProfitFlags({ costMissing, belowFloor }: { costMissing: boolean; belowFloor?: boolean }) {
  return (
    <>
      {costMissing && (
        <Badge variant="outline" data-flag="cost_missing" title="Có kiện giao trước khi bắt đầu lấy đơn, không có giá vốn: lãi gộp thiếu phần đó">
          Thiếu giá vốn
        </Badge>
      )}
      {belowFloor && (
        <Badge variant="destructive" data-flag="below_floor" title="Thực nhận thấp hơn giá vốn cộng lãi tối thiểu">
          Dưới đáy
        </Badge>
      )}
    </>
  );
}
