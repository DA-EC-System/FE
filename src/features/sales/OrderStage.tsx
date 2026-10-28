import { FlagChips } from '@/components/common/FlagChips';
import { StatusBadge } from '@/components/common/StatusBadge';
import type { OrderSummary } from '@/types/sales';
import { ORDER_FLAGS, ORDER_STAGE, OUTCOME_LABELS } from './shared';

/** Giai đoạn suy từ kiện, "x/y kiện đã giao" khi nhiều kiện, kết quả hoàn tất và cờ (sơ đồ D1) */
export function OrderStage({ order }: { order: OrderSummary }) {
  const { stage, delivered, packages } = order.display;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <StatusBadge status={stage} statuses={ORDER_STAGE} />
      {packages > 1 && order.status === 'processing' && (
        <span className="text-xs text-muted-foreground">
          {delivered}/{packages} kiện đã giao
        </span>
      )}
      {order.outcome && order.outcome !== 'full' && (
        <span className="text-xs text-muted-foreground">{OUTCOME_LABELS[order.outcome]}</span>
      )}
      <FlagChips flags={order.flags} meta={ORDER_FLAGS} />
    </div>
  );
}
