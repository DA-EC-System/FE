import { FlagChips } from '@/components/common/FlagChips';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Badge } from '@/components/ui/badge';
import type { OrderSummary } from '@/types/sales';
import { ORDER_FLAGS, ORDER_STAGE, OUTCOME_LABELS, isOverdue } from './shared';

/** Giai đoạn suy từ kiện, "x/y kiện đã giao" khi nhiều kiện, kết quả hoàn tất và cờ (sơ đồ D1) */
export function OrderStage({ order }: { order: OrderSummary }) {
  const { stage, delivered, packages } = order.display;
  // Đã qua hạn bàn giao: thay "Sắp trễ hạn" bằng "Đã trễ hạn bàn giao" (FE#252)
  const overdue = isOverdue(order);
  const flags = overdue ? order.flags.filter((f) => f !== 'due_soon') : order.flags;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <StatusBadge status={stage} statuses={ORDER_STAGE} />
      {packages > 1 && order.status === 'processing' && (
        <span className="text-xs text-muted-foreground">
          {delivered}/{packages} kiện hàng đã giao
        </span>
      )}
      {order.outcome && order.outcome !== 'full' && (
        <span className="text-xs text-muted-foreground">{OUTCOME_LABELS[order.outcome]}</span>
      )}
      {overdue && (
        <Badge variant="destructive" data-testid="order-overdue">
          Đã trễ hạn bàn giao
        </Badge>
      )}
      <FlagChips flags={flags} meta={ORDER_FLAGS} />
    </div>
  );
}
