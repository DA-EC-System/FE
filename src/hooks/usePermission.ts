import { useCallback, useMemo } from 'react';
import type { TransitionActor } from '@/lib/stateMachine';
import { useAuthStore } from '@/stores/authStore';
import { hasPermission, isModuleEnabled } from '@/utils/permissions';
import type { ModuleKey } from '@/utils/modules';

/** `const can = useCan(); can(PERMISSIONS.shopConnect)` */
export function useCan() {
  const context = useAuthStore((s) => s.companyContext);
  return useCallback(
    (permission: string) => hasPermission(context, permission),
    [context],
  );
}

/** Người đang thao tác, để hỏi bảng chuyển trạng thái (lib/stateMachine) nút nào hiện */
export function useTransitionActor(): TransitionActor {
  const accountId = useAuthStore((s) => s.account?.id ?? '');
  const permissions = useAuthStore((s) => s.companyContext?.permissions);
  return useMemo(() => ({ accountId, permissions: permissions ?? [] }), [accountId, permissions]);
}

export function useModuleEnabled(module: ModuleKey): boolean {
  const context = useAuthStore((s) => s.companyContext);
  return isModuleEnabled(context, module);
}
