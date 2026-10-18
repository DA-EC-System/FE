/**
 * API gian hàng của công ty đang làm việc (module channel, UC-CH-01, UC-CH-02).
 * Không truyền companyId lên URL: BE lấy công ty từ token đã chọn (RLS theo company_id).
 * companyId chỉ nằm trong query key để cache không lẫn giữa các công ty.
 * Hợp đồng đề xuất ở FE#8, chờ commerio-backend#19.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { useAuthStore } from '@/stores/authStore';
import type { PageResult } from './types';
import type {
  ChannelListing,
  ListingMatchInput,
  ListingRow,
  PushResult,
  RemoteSku,
  Shop,
  ShopCallbackInput,
  ShopCallbackResult,
  ShopConnectInput,
} from '@/types/shop';

export interface ShopListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  platform?: string;
  status?: string;
}

export const shopKeys = {
  all: (companyId: string) => ['company', companyId, 'shops'] as const,
  list: (companyId: string, params: ShopListParams) =>
    [...shopKeys.all(companyId), 'list', params] as const,
  detail: (companyId: string, id: string) => [...shopKeys.all(companyId), 'detail', id] as const,
  listings: (companyId: string, id: string) => [...shopKeys.all(companyId), 'listings', id] as const,
  remoteSkus: (companyId: string, id: string) => [...shopKeys.all(companyId), 'remote-skus', id] as const,
};

function useCompanyId(): string {
  return useAuthStore((s) => s.companyContext?.companyId ?? '');
}

/** Gian hàng, số SKU đã ghép và SKU sàn liên quan nhau → làm mới cả nhóm */
function useInvalidateShops() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return () => qc.invalidateQueries({ queryKey: shopKeys.all(companyId) });
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

export function useShop(id: string) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: shopKeys.detail(companyId, id),
    enabled: Boolean(companyId && id),
    queryFn: async () => {
      const { data } = await apiClient.get<Shop>(`/channel/shops/${id}`);
      return data;
    },
  });
}

/** Bắt đầu OAuth: BE trả trang uỷ quyền của sàn */
export function useConnectShop() {
  return useMutation({
    mutationFn: async (input: ShopConnectInput) => {
      const { data } = await apiClient.post<{ authorizeUrl: string }>('/channel/shops/connect', input);
      return data;
    },
  });
}

/** Sàn chuyển về FE kèm code và state; BE đổi code lấy token và lưu gian hàng */
export function useShopCallback() {
  const invalidate = useInvalidateShops();
  return useMutation({
    mutationFn: async (input: ShopCallbackInput) => {
      const { data } = await apiClient.post<ShopCallbackResult>('/channel/shops/oauth/callback', input);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDisconnectShop() {
  const invalidate = useInvalidateShops();
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      const { data } = await apiClient.post<Shop>(`/channel/shops/${id}/disconnect`, { version });
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useSyncShop() {
  const invalidate = useInvalidateShops();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post<{ ok: boolean; lastOrderSyncAt: string }>(
        `/channel/shops/${id}/sync`,
      );
      return data;
    },
    onSuccess: invalidate,
  });
}

/** Mọi biến thể đang bán kèm giá theo gian hàng và ghép SKU; lọc, phân trang phía client */
export function useShopListings(id: string) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: shopKeys.listings(companyId, id),
    enabled: Boolean(companyId && id),
    queryFn: async () => {
      const { data } = await apiClient.get<ListingRow[]>(`/channel/shops/${id}/listings`);
      return data;
    },
  });
}

/** SKU đang có trên sàn; BE gọi API sàn nên chỉ tải khi gian hàng còn kết nối */
export function useRemoteSkus(id: string, enabled: boolean) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: shopKeys.remoteSkus(companyId, id),
    enabled: Boolean(companyId && id) && enabled,
    retry: false,
    queryFn: async () => {
      const { data } = await apiClient.get<RemoteSku[]>(`/channel/shops/${id}/remote-skus`);
      return data;
    },
  });
}

export function useMatchListing() {
  const invalidate = useInvalidateShops();
  return useMutation({
    mutationFn: async ({
      shopId,
      variantId,
      ...input
    }: ListingMatchInput & { shopId: string; variantId: string }) => {
      const { data } = await apiClient.put<ChannelListing>(
        `/channel/shops/${shopId}/listings/${variantId}`,
        input,
      );
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUnmatchListing() {
  const invalidate = useInvalidateShops();
  return useMutation({
    mutationFn: async ({ shopId, variantId, version }: { shopId: string; variantId: string; version: number }) => {
      await apiClient.delete(`/channel/shops/${shopId}/listings/${variantId}`, { params: { version } });
    },
    onSuccess: invalidate,
  });
}

/** Đẩy sản phẩm và giá; biến thể chưa có SKU sàn thì sàn tạo mới. Kết quả theo từng biến thể */
export function usePushListings() {
  const invalidate = useInvalidateShops();
  return useMutation({
    mutationFn: async ({ shopId, variantIds }: { shopId: string; variantIds: string[] }) => {
      const { data } = await apiClient.post<{ results: PushResult[] }>(
        `/channel/shops/${shopId}/listings/push`,
        { variantIds },
      );
      return data.results;
    },
    onSuccess: invalidate,
  });
}
