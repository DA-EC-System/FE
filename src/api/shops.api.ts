/**
 * API gian hàng của công ty đang làm việc (module channel, UC-CH-01).
 * Không truyền companyId lên URL: BE lấy công ty từ token đã chọn (RLS theo company_id).
 * companyId chỉ nằm trong query key để cache không lẫn giữa các công ty.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { useAuthStore } from '@/stores/authStore';
import type { PageResult } from './types';
import type {
  Shop,
  ShopCreateInput,
  ShopUpdateInput,
} from '@/types/shop';

export interface ShopListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  platform?: string;
}

export const shopKeys = {
  all: (companyId: string) => ['company', companyId, 'shops'] as const,
  list: (companyId: string, params: ShopListParams) =>
    [...shopKeys.all(companyId), 'list', params] as const,
};

function useCompanyId(): string {
  return useAuthStore((s) => s.companyContext?.companyId ?? '');
}

export function useShops(params: ShopListParams, options: { enabled?: boolean } = {}) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: shopKeys.list(companyId, params),
    enabled: Boolean(companyId) && (options.enabled ?? true),
    queryFn: async (): Promise<PageResult<Shop>> => {
      const { data } = await apiClient.get<PageResult<Shop>>('/channel/shops', {
        params,
      });
      return data;
    },
  });
}

export function useCreateShop() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return useMutation({
    mutationFn: async (input: Omit<ShopCreateInput, 'companyId'>) => {
      const { data } = await apiClient.post<Shop>('/channel/shops', input);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: shopKeys.all(companyId) }),
  });
}

export function useUpdateShop() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return useMutation({
    mutationFn: async ({ id, ...patch }: ShopUpdateInput & { id: string }) => {
      const { data } = await apiClient.patch<Shop>(`/channel/shops/${id}`, patch);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: shopKeys.all(companyId) }),
  });
}

export function useDeleteShop() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete<Shop>(`/channel/shops/${id}`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: shopKeys.all(companyId) }),
  });
}

export function useSyncShop() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post<{ ok: boolean; lastOrderSyncAt: string }>(
        `/channel/shops/${id}/sync`,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: shopKeys.all(companyId) }),
  });
}

export function useBulkDeleteShops() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { data } = await apiClient.post<{ deleted: number }>(
        '/channel/shops/bulk-delete',
        { ids },
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: shopKeys.all(companyId) }),
  });
}
