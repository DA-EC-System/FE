import { defineMachine } from '@/lib/stateMachine';
import type { ConfigAction, ConfigStatus } from '@/types/finance';
import { PERMISSIONS as P } from '@/utils/permissions';

export interface ConfigRecord {
  createdBy: string | null; effectiveFrom: string | null; today: string; hasDryRun: boolean;
}
export const feeConfigMachine = defineMachine<ConfigStatus, ConfigAction, ConfigRecord>([
  { from: 'draft', to: 'pending_approval', action: 'submit', label: 'Gửi duyệt', permission: P.configManage,
    guard: (r) => r.hasDryRun ? null : 'dry_run_required' },
  { from: 'pending_approval', to: 'draft', action: 'request_changes', label: 'Trả về', permission: P.configApprove,
    needsSecondPerson: true, needsReason: true },
  { from: 'pending_approval', to: 'scheduled', action: 'approve', label: 'Duyệt', permission: P.configApprove,
    needsSecondPerson: true, allowSelfApproval: true },
  { from: 'pending_approval', to: 'rejected', action: 'reject', label: 'Từ chối', permission: P.configApprove,
    needsSecondPerson: true, needsReason: true },
  { from: ['draft', 'pending_approval', 'scheduled'], to: 'cancelled', action: 'cancel', label: 'Huỷ phiên bản', permission: P.configManage,
    guard: (r) => r.effectiveFrom && r.effectiveFrom <= r.today ? 'config_already_effective' : null },
  { from: 'scheduled', to: 'active', action: 'activate', label: 'Áp dụng', system: true },
  { from: 'active', to: 'expired', action: 'expire', label: 'Hết hiệu lực', system: true },
]);
