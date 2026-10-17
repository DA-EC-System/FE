/**
 * Bảng giá của công ty đang làm việc (UC-CP-03, commerio-backend#15).
 * BE lấy công ty từ token; companyId chỉ nằm trong query key.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { useAuthStore } from '@/stores/authStore';
import type {
  Pricelist,
  PricelistCreateInput,
  PricelistItem,
  PricelistItemsInput,
  PricelistUpdateInput,
} from '@/types/pricing';

export const pricingKeys = {
  all: (companyId: string) => ['company', companyId, 'pricing'] as const,
  list: (companyId: string) => [...pricingKeys.all(companyId), 'list'] as const,
  detail: (companyId: string, id: string) => [...pricingKeys.all(companyId), 'detail', id] as const,
  items: (companyId: string, id: string) => [...pricingKeys.all(companyId), 'items', id] as const,
};

function useCompanyId(): string {
  return useAuthStore((s) => s.companyContext?.companyId ?? '');
}

/** Số biến thể đã gán giá và giá chuẩn hiện trên mọi bảng → làm mới cả nhóm */
function useInvalidatePricing() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return () => qc.invalidateQueries({ queryKey: pricingKeys.all(companyId) });
}

export function usePricelists() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: pricingKeys.list(companyId),
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data } = await apiClient.get<Pricelist[]>('/pricing/pricelists');
      return data;
    },
  });
}

export function usePricelist(id: string) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: pricingKeys.detail(companyId, id),
    enabled: Boolean(companyId && id),
    queryFn: async () => {
      const { data } = await apiClient.get<Pricelist>(`/pricing/pricelists/${id}`);
      return data;
    },
  });
}

/** Mọi biến thể đang bán kèm giá; lưới lọc và phân trang phía client để sửa hàng loạt */
export function usePricelistItems(id: string) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: pricingKeys.items(companyId, id),
    enabled: Boolean(companyId && id),
    queryFn: async () => {
      const { data } = await apiClient.get<PricelistItem[]>(`/pricing/pricelists/${id}/items`);
      return data;
    },
  });
}

export function useCreatePricelist() {
  const invalidate = useInvalidatePricing();
  return useMutation({
    mutationFn: async (input: PricelistCreateInput) => {
      const { data } = await apiClient.post<Pricelist>('/pricing/pricelists', input);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdatePricelist() {
  const invalidate = useInvalidatePricing();
  return useMutation({
    mutationFn: async ({ id, ...body }: PricelistUpdateInput & { id: string }) => {
      const { data } = await apiClient.put<Pricelist>(`/pricing/pricelists/${id}`, body);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeletePricelist() {
  const invalidate = useInvalidatePricing();
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      await apiClient.delete(`/pricing/pricelists/${id}`, { params: { version } });
    },
    onSuccess: invalidate,
  });
}

export function useSavePrices() {
  const invalidate = useInvalidatePricing();
  return useMutation({
    mutationFn: async ({ id, ...body }: PricelistItemsInput & { id: string }) => {
      const { data } = await apiClient.put<Pricelist>(`/pricing/pricelists/${id}/items`, body);
      return data;
    },
    onSuccess: invalidate,
  });
}
