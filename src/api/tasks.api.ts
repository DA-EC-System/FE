/**
 * Việc cần làm theo hạn (FE#55). Hợp đồng ở Documents/21; BE gom từ các phân hệ.
 */

import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';
import { useAuthStore } from '@/stores/authStore';
import type { TaskItem } from '@/types/tasks';

export function useTasks() {
  const companyId = useAuthStore((s) => s.companyContext?.companyId ?? '');
  return useQuery({
    queryKey: ['company', companyId, 'tasks'],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data } = await apiClient.get<{ items: TaskItem[] }>('/tasks');
      return data.items;
    },
  });
}
