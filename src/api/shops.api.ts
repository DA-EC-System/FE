/**
 * API gian hàng của công ty đang làm việc (module channel, UC-CH-01, UC-CH-02).
 * Không truyền companyId lên URL: BE lấy công ty từ token đã chọn (RLS theo company_id).
 * companyId chỉ nằm trong query key để cache không lẫn giữa các công ty.
 * Hợp đồng Documents/21 §18.1: danh sách không phân trang, FE lọc tại client.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { useAuthStore } from '@/stores/authStore';
import type {
  CategoryAttribute,
  CategoryAttributeList,
  CategoryMap,
  CategoryMapInput,
  CategoryMapList,
  ChannelListing,
  MarketplaceCategory,
  MarketplaceCategoryList,
  ListingMatchInput,
  ListingRow,
  Marketplace,
  ListingSyncResult,
  PushListingsInput,
  PushResult,
  RemoteSku,
  Shop,
  ShopList,
  ShopPlatformList,
  ShopAuthorizeUrl,
  ShopCallbackInput,
  ShopCallbackResult,
  ShopConnectInput,
  ShopDisconnectInput,
  ShopSetupInput,
  ShopSetupPreview,
  ShopSetupResult,
  ShopTokenInput,
} from '@/types/shop';

export const shopKeys = {
  all: (companyId: string) => ['company', companyId, 'shops'] as const,
  list: (companyId: string) => [...shopKeys.all(companyId), 'list'] as const,
  platforms: (companyId: string) => [...shopKeys.all(companyId), 'platforms'] as const,
  detail: (companyId: string, id: string) => [...shopKeys.all(companyId), 'detail', id] as const,
  listings: (companyId: string, id: string) => [...shopKeys.all(companyId), 'listings', id] as const,
  remoteSkus: (companyId: string, id: string) => [...shopKeys.all(companyId), 'remote-skus', id] as const,
  setup: (companyId: string, id: string) => [...shopKeys.all(companyId), 'setup', id] as const,
  categoryMaps: (companyId: string, id: string) => [...shopKeys.all(companyId), 'category-maps', id] as const,
  marketCategories: (companyId: string, id: string, search: string) =>
    [...shopKeys.all(companyId), 'market-categories', id, search] as const,
  categoryAttributes: (companyId: string, id: string, externalId: string) =>
    [...shopKeys.all(companyId), 'category-attributes', id, externalId] as const,
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

export function useShops(options: { enabled?: boolean } = {}) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: shopKeys.list(companyId),
    enabled: Boolean(companyId) && (options.enabled ?? true),
    queryFn: async (): Promise<ShopList> => {
      const { data } = await apiClient.get<ShopList>('/channel/shops');
      return data;
    },
  });
}

export function useShopPlatforms(options: { enabled?: boolean } = {}) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: shopKeys.platforms(companyId),
    enabled: Boolean(companyId) && (options.enabled ?? true),
    retry: false,
    queryFn: async (): Promise<ShopPlatformList> => {
      const { data } = await apiClient.get<ShopPlatformList>('/channel/shops/platforms');
      return data;
    },
  });
}

/**
 * `poll` trả số ms giữa hai lần đọc lại, false để dừng; dùng cho tiến độ thiết lập (§18.7.7).
 * Tab ẩn thì ngừng đọc, hiện lại thì đọc ngay.
 */
export function useShop(id: string, poll?: (shop: Shop | undefined) => number | false) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: shopKeys.detail(companyId, id),
    enabled: Boolean(companyId && id),
    ...(poll
      ? {
          refetchInterval: (query: { state: { data?: Shop } }) => poll(query.state.data),
          refetchIntervalInBackground: false,
          refetchOnWindowFocus: 'always' as const,
        }
      : {}),
    queryFn: async () => {
      const { data } = await apiClient.get<Shop>(`/channel/shops/${id}`);
      return data;
    },
  });
}

/** Bắt đầu OAuth: BE sinh state và trả trang uỷ quyền của sàn (§18.4) */
export function useConnectShop() {
  return useMutation({
    mutationFn: async ({ platform, shopId }: ShopConnectInput) => {
      const { data } = await apiClient.get<ShopAuthorizeUrl>(`/channel/shops/${platform}/authorize-url`, {
        params: shopId ? { shopId } : undefined,
      });
      return data;
    },
  });
}

/** Sàn chuyển về FE kèm code và state; BE đổi code lấy token và lưu gian hàng */
export function useShopCallback() {
  const invalidate = useInvalidateShops();
  return useMutation({
    mutationFn: async ({ platform, ...input }: ShopCallbackInput & { platform: Marketplace }) => {
      const { data } = await apiClient.post<ShopCallbackResult>(`/channel/shops/${platform}/callback`, input);
      return data;
    },
    onSuccess: invalidate,
  });
}

/** Shop thử không đi OAuth được: dán token, BE lấy thông tin shop rồi tạo (201) hoặc nối lại (200) */
export function useConnectShopByToken() {
  const invalidate = useInvalidateShops();
  return useMutation({
    mutationFn: async ({ platform, ...input }: ShopTokenInput & { platform: string }) => {
      const { data } = await apiClient.post<ShopCallbackResult>(`/channel/shops/${platform}/token`, input);
      return data;
    },
    onSuccess: invalidate,
  });
}

/** Ngắt mềm; zeroStock: đặt tồn trên sàn về 0 trước khi ngắt */
export function useDisconnectShop() {
  const invalidate = useInvalidateShops();
  return useMutation({
    mutationFn: async ({ id, ...input }: ShopDisconnectInput & { id: string }) => {
      const { data } = await apiClient.post<Shop>(`/channel/shops/${id}/disconnect`, input);
      return data;
    },
    onSuccess: invalidate,
  });
}

/** Thiết lập lần đầu: gợi ý ghép listing có sẵn (chỉ khi gian hàng đang thiết lập) */
export function useShopSetup(id: string, enabled: boolean) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: shopKeys.setup(companyId, id),
    enabled: Boolean(companyId && id) && enabled,
    retry: false,
    queryFn: async () => {
      const { data } = await apiClient.get<ShopSetupPreview>(`/channel/shops/${id}/setup`);
      return data;
    },
  });
}

export function useFinishShopSetup() {
  const invalidate = useInvalidateShops();
  return useMutation({
    mutationFn: async ({ id, ...input }: ShopSetupInput & { id: string }) => {
      const { data } = await apiClient.post<ShopSetupResult>(`/channel/shops/${id}/setup`, input);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useSyncShop() {
  const invalidate = useInvalidateShops();
  return useMutation({
    mutationFn: async (id: string) => {
      // Documents/21 §14: kéo đơn ngay, trả số đơn đã lấy chi tiết, số đơn mới, số đơn đổi
      const { data } = await apiClient.post<{ pulled: number; created: number; updated: number }>(
        `/channel/shops/${id}/orders/pull`,
      );
      return data;
    },
    onSuccess: invalidate,
  });
}

/** Mọi biến thể đang bán kèm giá theo gian hàng và ghép SKU; lọc, phân trang phía client */
/**
 * `poll` trả số ms giữa hai lần đọc lại, false để dừng; dùng theo dõi listing đang đẩy (§18.6.4).
 * Tab ẩn thì ngừng đọc, hiện lại thì đọc ngay một lần.
 */
export function useShopListings(id: string, poll?: (items: ListingRow[] | undefined) => number | false) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: shopKeys.listings(companyId, id),
    enabled: Boolean(companyId && id),
    ...(poll
      ? {
          refetchInterval: (query: { state: { data?: ListingRow[] } }) => poll(query.state.data),
          refetchIntervalInBackground: false,
          refetchOnWindowFocus: 'always' as const,
        }
      : {}),
    queryFn: async () => {
      const { data } = await apiClient.get<{ items: ListingRow[] }>(`/channel/shops/${id}/listings`);
      return data.items;
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
      const { data } = await apiClient.get<{ items: RemoteSku[] }>(`/channel/shops/${id}/remote-skus`);
      return data.items;
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

/** Gỡ khỏi sàn: giữ ghép để đẩy lại sau */
export function useDelistListing() {
  const invalidate = useInvalidateShops();
  return useMutation({
    mutationFn: async ({ shopId, variantId, version }: { shopId: string; variantId: string; version: number }) => {
      const { data } = await apiClient.post<ChannelListing>(
        `/channel/shops/${shopId}/listings/${variantId}/delist`,
        { version },
      );
      return data;
    },
    onSuccess: invalidate,
  });
}

/** BE nhận tối đa 20 biến thể một lần đẩy (§18.5) */
export const PUSH_BATCH = 20;

/**
 * Đẩy sản phẩm lên sàn, chạy nền (§18.6.4): BE kiểm từng dòng, xếp việc rồi trả ngay.
 * Chọn hơn 20 biến thể thì gửi nhiều lần, gộp kết quả. Lô sau lỗi cả request thì ném lỗi, lô trước đã xếp việc vẫn giữ
 */
export function usePushListings() {
  const invalidate = useInvalidateShops();
  return useMutation({
    mutationFn: async ({ shopId, variantIds, imageUrls }: PushListingsInput & { shopId: string }) => {
      const results: PushResult[] = [];
      for (let i = 0; i < variantIds.length; i += PUSH_BATCH) {
        const body: PushListingsInput = { variantIds: variantIds.slice(i, i + PUSH_BATCH) };
        if (imageUrls && Object.keys(imageUrls).length) body.imageUrls = imageUrls;
        const { data } = await apiClient.post<{ results: PushResult[] }>(`/channel/shops/${shopId}/listings/push`, body);
        results.push(...data.results);
      }
      return results;
    },
    onSettled: invalidate,
  });
}

/** Đồng bộ tay với sàn (§18.5): BE xếp một lượt đồng bộ chạy nền, trả 202 `{ queued }` (quyền shop.sync) */
export function useSyncListings() {
  const invalidate = useInvalidateShops();
  return useMutation({
    mutationFn: async (shopId: string) => {
      const { data } = await apiClient.post<ListingSyncResult>(`/channel/shops/${shopId}/listings/sync`);
      return data;
    },
    onSuccess: invalidate,
  });
}

// ---------- Ghép danh mục với danh mục sàn (FE#146, Documents/21 §18.5) ----------

/** Danh mục Commerio đã ghép của gian hàng (quyền shop.view) */
export function useCategoryMaps(shopId: string) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: shopKeys.categoryMaps(companyId, shopId),
    enabled: Boolean(companyId && shopId),
    queryFn: async () => {
      const { data } = await apiClient.get<CategoryMapList>(`/channel/shops/${shopId}/category-maps`);
      return data.items;
    },
  });
}

/** Tìm danh mục lá trên sàn, BE trả tối đa 50 (quyền listing.manage, gọi sàn) */
export function useMarketplaceCategories(shopId: string, search: string, enabled: boolean) {
  const companyId = useCompanyId();
  return useQuery<MarketplaceCategory[]>({
    queryKey: shopKeys.marketCategories(companyId, shopId, search),
    enabled: Boolean(companyId && shopId && enabled),
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data } = await apiClient.get<MarketplaceCategoryList>(`/channel/shops/${shopId}/categories`, {
        params: search ? { search } : undefined,
      });
      return data.items;
    },
  });
}

/** Thuộc tính bắt buộc của một danh mục sàn */
export function useCategoryAttributes(shopId: string, externalId: string | null) {
  const companyId = useCompanyId();
  return useQuery<CategoryAttribute[]>({
    queryKey: shopKeys.categoryAttributes(companyId, shopId, externalId ?? ''),
    enabled: Boolean(companyId && shopId && externalId),
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data } = await apiClient.get<CategoryAttributeList>(
        `/channel/shops/${shopId}/categories/${encodeURIComponent(externalId ?? '')}/attributes`,
      );
      return data.items;
    },
  });
}

export function useSaveCategoryMap() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return useMutation({
    mutationFn: async ({ shopId, categoryId, input }: { shopId: string; categoryId: string; input: CategoryMapInput }) => {
      const { data } = await apiClient.put<CategoryMap>(`/channel/shops/${shopId}/category-maps/${categoryId}`, input);
      return data;
    },
    onSettled: (_data, _error, { shopId }) => qc.invalidateQueries({ queryKey: shopKeys.categoryMaps(companyId, shopId) }),
  });
}
