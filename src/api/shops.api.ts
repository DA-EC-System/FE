import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, getErrorMessage } from './client';
import type { Company } from '@/types/company';
import type {
  Shop,
  ShopCreateInput,
  ShopUpdateInput,
} from '@/types/shop';
import type { PageResult } from './companies.api';

export interface ShopListParams {
  companyId: string;
  page?: number;
  pageSize?: number;
  search?: string;
  platform?: string;
}

export const shopKeys = {
  all: ['shops'] as const,
  list: (params: ShopListParams) => [...shopKeys.all, 'list', params] as const,
};

export function useShops(params: ShopListParams) {
  return useQuery({
    queryKey: shopKeys.list(params),
    enabled: Boolean(params.companyId),
    queryFn: async (): Promise<PageResult<Shop>> => {
      const { companyId, ...rest } = params;
      const { data } = await apiClient.get<PageResult<Shop>>(
        `/admin/companies/${companyId}/shops`,
        { params: rest },
      );
      return data;
    },
  });
}

export function useCreateShop(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<ShopCreateInput, 'companyId'>) => {
      const { data } = await apiClient.post<Shop>(
        `/admin/companies/${companyId}/shops`,
        input,
      );
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: shopKeys.all }),
    onError: (e) => {
      throw new Error(getErrorMessage(e));
    },
  });
}

export function useUpdateShop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: ShopUpdateInput & { id: string }) => {
      const { data } = await apiClient.patch<Shop>(`/admin/shops/${id}`, patch);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: shopKeys.all }),
    onError: (e) => {
      throw new Error(getErrorMessage(e));
    },
  });
}

export function useDeleteShop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete<Shop>(`/admin/shops/${id}`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: shopKeys.all }),
  });
}

export function useSyncShop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post<{ ok: boolean; lastOrderSyncAt: string }>(
        `/admin/shops/${id}/sync`,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: shopKeys.all }),
  });
}

export function useBulkDeleteShops() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { data } = await apiClient.post<{ deleted: number }>(
        '/admin/shops/bulk-delete',
        { ids },
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: shopKeys.all }),
  });
}

/** Helper lấy thông tin company (dùng ở trang Shop) */
export function useCompany(companyId: string | undefined) {
  return useQuery({
    queryKey: ['companies', 'detail', companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<Company> => {
      const { data } = await apiClient.get<Company>(
        `/admin/companies/${companyId}`,
      );
      return data;
    },
  });
}
