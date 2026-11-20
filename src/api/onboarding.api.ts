/**
 * Checklist thiết lập ban đầu ở Tổng quan (commerio-backend#461, Documents/21 mục 23).
 * Làm mới khi vào Tổng quan (staleTime 0) và khi SSE làm mới nhóm `tasks` (`useRealtime`).
 */

import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';
import { useAuthStore } from '@/stores/authStore';
import type { Onboarding } from '@/types/onboarding';

export function useOnboarding() {
  const companyId = useAuthStore((s) => s.companyContext?.companyId ?? '');
  return useQuery({
    queryKey: ['company', companyId, 'onboarding'],
    enabled: Boolean(companyId),
    queryFn: async () => (await apiClient.get<Onboarding>('/onboarding')).data,
  });
}
