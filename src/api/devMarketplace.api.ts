/**
 * Sàn giả lập (FE#55): chỉ có với mock, BE không làm. Dùng để phát sự kiện của sàn khi trình bày.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { useAuthStore } from '@/stores/authStore';
import type {
  FireMarketplaceEventInput,
  MarketplaceEventLog,
  MarketplaceEventsResponse,
} from '@/types/devMarketplace';

function useCompanyId(): string {
  return useAuthStore((s) => s.companyContext?.companyId ?? '');
}

export function useMarketplaceEvents() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: ['company', companyId, 'dev', 'marketplace'],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data } = await apiClient.get<MarketplaceEventsResponse>('/dev/marketplace/events');
      return data;
    },
  });
}

/** Sự kiện có thể đổi bất kỳ dữ liệu nào của công ty nên làm mới toàn bộ */
export function useFireMarketplaceEvent() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return useMutation({
    mutationFn: async (input: FireMarketplaceEventInput) => {
      const { data } = await apiClient.post<MarketplaceEventLog>('/dev/marketplace/events', input);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['company', companyId] }),
  });
}
