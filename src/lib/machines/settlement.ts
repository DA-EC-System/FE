import { defineMachine, type TransitionActor } from '@/lib/stateMachine';
import type { OrderPayment, SettlementStatus } from '@/types/settlement';
import { PERMISSIONS as P } from '@/utils/permissions';
export type SettlementAction = 'first_delivered' | 'settle' | 'mismatch' | 'late_adjust' | 'cancelled_charged' | 'resolve' | 'new_adjust';
export const settlementMachine = defineMachine<SettlementStatus, SettlementAction>([
  { from: 'none', to: 'pending', action: 'first_delivered', label: 'Giao kiện đầu', system: true },
  { from: 'pending', to: 'settled', action: 'settle', label: 'Khớp', system: true },
  { from: 'pending', to: 'mismatch', action: 'mismatch', label: 'Lệch', system: true },
  { from: 'settled', to: 'mismatch', action: 'late_adjust', label: 'Điều chỉnh muộn', system: true },
  { from: 'none', to: 'mismatch', action: 'cancelled_charged', label: 'Sàn thu đơn huỷ', system: true },
  { from: 'mismatch', to: 'resolved', action: 'resolve', label: 'Chốt lệch', permission: P.settlementResolve, needsReason: true },
  { from: 'resolved', to: 'mismatch', action: 'new_adjust', label: 'Lệch mới', system: true },
]);
export function resolveBlock(payment: OrderPayment, actor: TransitionActor): string | null {
  if (payment.status !== 'mismatch') return 'invalid_transition';
  if (!actor.permissions.includes(P.settlementResolve)) return 'forbidden';
  if (payment.feeConfigAuthor?.id === actor.accountId) return 'second_person_required';
  if (payment.needsCeoApproval && !payment.ceoApproval && !actor.permissions.includes(P.settlementApprove)) return 'ceo_approval_required';
  return null;
}
