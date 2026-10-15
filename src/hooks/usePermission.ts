import { useCallback } from 'react';
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

export function useModuleEnabled(module: ModuleKey): boolean {
  const context = useAuthStore((s) => s.companyContext);
  return isModuleEnabled(context, module);
}
