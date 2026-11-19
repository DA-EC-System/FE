import { Badge } from '@/components/ui/badge';
import { isReplaced } from '@/utils/ledger';
import type { LedgerLine } from '@/types/finance';

export function LedgerStateBadge({ line }: { line: Pick<LedgerLine, 'estimated' | 'replacedBy'> }) {
  if (isReplaced(line)) return <Badge variant="outline">Đã thay thế</Badge>;
  return line.estimated ? <Badge variant="warning">Ước tính</Badge> : <Badge variant="success">Thực tế</Badge>;
}

export function ProfitStateBadge({ estimated }: { estimated: boolean }) {
  return estimated ? <Badge variant="warning">Chờ sàn thanh toán</Badge> : <Badge variant="success">Sàn thanh toán</Badge>;
}

/** Cờ của lãi theo đơn, theo SKU (§21.1): thiếu giá vốn, dưới giá thấp nhất thực tế */
export function ProfitFlags({ costMissing, belowFloor }: { costMissing: boolean; belowFloor?: boolean }) {
  return (
    <>
      {costMissing && (
        <Badge variant="outline" data-flag="cost_missing" title="Đơn có kiện giao trước khi Commerio bắt đầu đồng bộ đơn nên chưa có giá vốn; lợi nhuận đang thiếu phần giá vốn này.">
          Thiếu giá vốn
        </Badge>
      )}
      {belowFloor && (
        <Badge variant="destructive" data-flag="below_floor" title="Tiền thực nhận thấp hơn giá vốn hàng bán cộng lãi tối thiểu trên giá vốn">
          Dưới giá tối thiểu
        </Badge>
      )}
    </>
  );
}
