import { StatusBadge } from '@/components/common/StatusBadge';
import type { SettlementStatus } from '@/types/settlement';
import { PAYMENT_STATES } from './lifecycleShared';
export function PaymentStatusBadge({ status }: { status?: SettlementStatus }) {
  return status ? <StatusBadge status={status} statuses={PAYMENT_STATES} /> : <span className="text-muted-foreground">—</span>;
}
