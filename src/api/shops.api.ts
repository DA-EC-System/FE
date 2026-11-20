/**
 * API gian hàng của công ty đang làm việc (module channel, UC-CH-01, UC-CH-02).
 * Không truyền companyId lên URL: BE lấy công ty từ token đã chọn (RLS theo company_id).
 * companyId chỉ nằm trong query key để cache không lẫn giữa các công ty.
 * Hợp đồng Documents/21 §18.1: danh sách không phân trang, FE lọc tại client.
 */

import { queryOptions, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMutation } from './useMutation';
import { apiClient } from './client';
import { salesKeys } from './sales.api';
import { useAuthStore } from '@/stores/authStore';
import type {
  ApplyCategoryResult,
  CascadeOptionList,
  CategorySuggestionList,
  ChannelListing,
  OutsideChangeAction,
  MappingDecision,
  ListingMatchInput,
  ListingMatchPreview,
  ListingRow,
  Marketplace,
  ListingSyncResult,
  PlatformCategoryDetail,
  PlatformCategoryList,
  PlatformCategorySyncResult,
  ProductSpecInput,
  ProductSpecResult,
  PushListingsInput,
  PushResult,
  RemoteSkuList,
  Shop,
  ShopList,
  ShopPlatformList,
  ShopAuthorizeUrl,
  ShopCallbackInput,
  ShopCallbackResult,
  ShopConnectInput,
  ShopDeleteInput,
  ProductListingRow,
  ShopDeleteResult,
  ShopDisconnectInput,
  ShopOpeningStocktakeRestart,
  ShopSetupInput,
  ShopSetupPreview,
  ShopSetupResult,
  ShopTokenInput,
  ShopUpdateInput,
} from '@/types/shop';

export const shopKeys = {
  all: (companyId: string) => ['company', companyId, 'shops'] as const,
  list: (companyId: string) => [...shopKeys.all(companyId), 'list'] as const,
  platforms: (companyId: string) => [...shopKeys.all(companyId), 'platforms'] as const,
  detail: (companyId: string, id: string) => [...shopKeys.all(companyId), 'detail', id] as const,
  listings: (companyId: string, id: string) => [...shopKeys.all(companyId), 'listings', id] as const,
  remoteSkus: (companyId: string, id: string) => [...shopKeys.all(companyId), 'remote-skus', id] as const,
  remoteSkusRefresh: (companyId: string, id: string) => [...shopKeys.all(companyId), 'remote-skus-refresh', id] as const,
  setup: (companyId: string, id: string) => [...shopKeys.all(companyId), 'setup', id] as const,
  platformCategories: (companyId: string, platform: string) =>
    [...shopKeys.all(companyId), 'platform-categories', platform] as const,
  platformCategoryList: (companyId: string, platform: string, params: PlatformCategoryParams) =>
    [...shopKeys.platformCategories(companyId, platform), 'list', params.search ?? '', params.parentId ?? ''] as const,
  platformCategory: (companyId: string, platform: string, externalId: string) =>
    [...shopKeys.platformCategories(companyId, platform), 'detail', externalId] as const,
  cascade: (companyId: string, platform: string, externalId: string, code: string, path: string) =>
    [...shopKeys.platformCategories(companyId, platform), 'cascade', externalId, code, path] as const,
  suggestions: (companyId: string, shopId: string, productId: string) =>
    [...shopKeys.all(companyId), 'category-suggestions', shopId, productId] as const,
  productSpec: (companyId: string, productId: string, platform: string) =>
    [...shopKeys.all(companyId), 'product-spec', productId, platform] as const,
  productListings: (companyId: string, productId: string) => [...shopKeys.all(companyId), 'product-listings', productId] as const,
};

/** `search` (≥ 2 ký tự) hoặc `parentId`; không gửi gì là cấp gốc (Documents/21 §18.5) */
export interface PlatformCategoryParams {
  search?: string;
  parentId?: string;
}

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

/** Sửa hạn trả hàng của gian hàng (§18.4, FE#273); trả Shop mới */
export function useUpdateShop() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  const invalidate = useInvalidateShops();
  return useMutation({
    mutationFn: async ({ id, ...input }: ShopUpdateInput & { id: string }) => {
      const { data } = await apiClient.patch<Shop>(`/channel/shops/${id}`, input);
      return data;
    },
    onSuccess: (shop) => {
      qc.setQueryData(shopKeys.detail(companyId, shop.id), shop);
      return invalidate();
    },
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

/**
 * Xoá hẳn gian hàng đã ngắt cùng đơn, kiện, sổ tiền (commerio-backend#398). Xong thì làm mới mọi truy vấn của công ty:
 * đơn, kiện, yêu cầu trả, sổ tiền, đối soát, báo cáo, tổng quan đều mất phần của gian hàng
 */
export function useDeleteShop() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return useMutation({
    mutationFn: async ({ id, ...input }: ShopDeleteInput & { id: string }) => {
      const { data } = await apiClient.delete<ShopDeleteResult>(`/channel/shops/${id}`, { data: input });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['company', companyId] }),
  });
}

/** Lập lại phiếu kiểm kê đầu kỳ khi phiếu cũ bị từ chối hoặc đã huỷ (§18.6.11) */
export function useRestartOpeningStocktake() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  const invalidate = useInvalidateShops();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post<ShopOpeningStocktakeRestart>(`/channel/shops/${id}/opening-stocktake`);
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(shopKeys.detail(companyId, data.shop.id), data.shop);
      return invalidate();
    },
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
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return useMutation({
    mutationFn: async (id: string) => {
      // Documents/21 §14: kéo đơn ngay, trả số đơn đã lấy chi tiết, số đơn mới, số đơn đổi
      const { data } = await apiClient.post<{ pulled: number; created: number; updated: number }>(
        `/channel/shops/${id}/orders/pull`,
      );
      return data;
    },
    onSuccess: () => {
      void invalidate();
      // Đơn mới, đơn đổi hiện ngay ở trang Đơn hàng
      void qc.invalidateQueries({ queryKey: salesKeys.all(companyId) });
    },
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

/** Khoảng hỏi lại `GET remote-skus` khi lượt tải SKU sàn đang chạy (§18.3, BE#361) */
export const REMOTE_REFRESH_POLL_MS = 3000;

/** Hỏi lại khi lượt tải đang chạy, thôi khi `refresh.status` khác `running` (FE#315) */
export const remoteSkusPollMs = (data: RemoteSkuList | undefined): number | false =>
  data?.refresh?.status === 'running' ? REMOTE_REFRESH_POLL_MS : false;

/**
 * SKU đang có trên sàn, đọc bản sao BE lưu (§18.3). Lượt tải nền đang chạy thì hỏi lại tới khi xong: dữ liệu mới về cùng
 * lần hỏi cuối, bảng tự cập nhật
 */
export function useRemoteSkus(id: string, enabled: boolean) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: shopKeys.remoteSkus(companyId, id),
    enabled: Boolean(companyId && id) && enabled,
    retry: false,
    refetchInterval: (query: { state: { data?: RemoteSkuList } }) => remoteSkusPollMs(query.state.data),
    queryFn: async () => {
      const { data } = await apiClient.get<RemoteSkuList>(`/channel/shops/${id}/remote-skus`);
      return data;
    },
  });
}

/**
 * Nút Tải lại (§18.3, BE#361): POST trả cùng hình `GET remote-skus`, 202 khi xếp lượt nền (hoặc đang có lượt chạy), 200
 * khi lần đọc trọn trước còn trong 60 giây. Ghi thẳng vào bản sao; lượt chạy thì `useRemoteSkus` hỏi lại tới khi xong
 */
export function useRefreshRemoteSkus() {
  const companyId = useCompanyId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (shopId: string) => {
      const { data } = await apiClient.post<RemoteSkuList>(`/channel/shops/${shopId}/remote-skus/refresh`);
      return data;
    },
    onSuccess: (data, shopId) => queryClient.setQueryData(shopKeys.remoteSkus(companyId, shopId), data),
  });
}

/** Xem trước số sẽ đẩy khi chọn một cặp trong hộp ghép (§18.3, commerio-backend#460); không gọi sàn, không ghi */
export function useMatchPreview(shopId: string, pair: { externalSkuId: string; variantId: string } | null) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: [...shopKeys.all(companyId), 'match-preview', shopId, pair?.externalSkuId, pair?.variantId] as const,
    enabled: Boolean(companyId && shopId && pair),
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await apiClient.get<ListingMatchPreview>(`/channel/shops/${shopId}/listings/match-preview`, {
        params: pair!,
      });
      return data;
    },
  });
}

/**
 * Ghép SKU sàn với biến thể hoặc "không quản tồn" (§18.6.5). `pending` (202): người làm không tự duyệt được, ghép chờ CEO
 * duyệt và ghép cũ giữ nguyên
 */
export function useMatchListing() {
  const invalidate = useInvalidateShops();
  return useMutation({
    mutationFn: async ({ shopId, ...input }: ListingMatchInput & { shopId: string }) => {
      const res = await apiClient.post<ChannelListing>(`/channel/shops/${shopId}/listings/match`, input);
      return { listing: res.data, pending: res.status === 202 };
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

/** CEO quyết thay đổi ngoài app của listing (§18.3, commerio-backend#360) */
/**
 * Ghi đè giá tay của listing (FE#274, BE#225, Documents/21 §18.6.7): `price` số nguyên đồng, null bỏ ghi đè. 422
 * `below_floor` khi dưới giá thấp nhất, 409 `version_conflict` khi listing vừa đổi
 */
export function useOverrideListingPrice() {
  const invalidate = useInvalidateShops();
  return useMutation({
    mutationFn: async ({
      shopId,
      listingId,
      version,
      price,
    }: {
      shopId: string;
      listingId: string;
      version: number;
      price: number | null;
    }) => {
      const { data } = await apiClient.put<ChannelListing>(`/channel/shops/${shopId}/listings/${listingId}/price`, {
        version,
        price,
      });
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useResolveOutsideChange() {
  const invalidate = useInvalidateShops();
  return useMutation({
    mutationFn: async ({
      shopId,
      listingId,
      action,
      version,
    }: {
      shopId: string;
      listingId: string;
      action: OutsideChangeAction;
      version: number;
    }) => {
      const { data } = await apiClient.post<ChannelListing>(
        `/channel/shops/${shopId}/listings/${listingId}/outside-change/${action}`,
        { version },
      );
      return data;
    },
    onSuccess: invalidate,
  });
}

/**
 * Đưa tên, mô tả, thuộc tính mới của sản phẩm lên listing đang bán (§18.3, commerio-backend#293). BE gọi sàn ngay;
 * sàn vẫn bán bản cũ thì listing giữ `live` kèm `pendingRevision` đang duyệt, sàn ngừng bán để duyệt thì `under_review`
 */
export function useUpdateListingContent() {
  const invalidate = useInvalidateShops();
  return useMutation({
    mutationFn: async ({ shopId, listingId, version }: { shopId: string; listingId: string; version: number }) => {
      const { data } = await apiClient.post<ChannelListing>(
        `/channel/shops/${shopId}/listings/${listingId}/update-content`,
        { version },
      );
      return data;
    },
    onSuccess: invalidate,
  });
}

export interface MappingDecisionInput {
  shopId: string;
  listingId: string;
  action: MappingDecision;
  version: number;
  /** Bắt buộc khi từ chối */
  reason?: string;
}

/** CEO duyệt hoặc từ chối ghép chờ (§18.6.5): duyệt thì ghép mới có hiệu lực, từ chối thì giữ ghép cũ */
export function useDecideMapping() {
  const invalidate = useInvalidateShops();
  return useMutation({
    mutationFn: async ({ shopId, listingId, action, version, reason }: MappingDecisionInput) => {
      const { data } = await apiClient.post<ChannelListing>(
        `/channel/shops/${shopId}/listings/${listingId}/mapping/${action}`,
        action === 'reject' ? { version, reason } : { version },
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
    mutationFn: async ({ shopId, variantIds }: PushListingsInput & { shopId: string }) => {
      const results: PushResult[] = [];
      for (let i = 0; i < variantIds.length; i += PUSH_BATCH) {
        const body: PushListingsInput = { variantIds: variantIds.slice(i, i + PUSH_BATCH) };
        const { data } = await apiClient.post<{ results: PushResult[] }>(`/channel/shops/${shopId}/listings/push`, body);
        results.push(...data.results);
      }
      return results;
    },
    onSettled: invalidate,
  });
}

/** Khoảng chờ trước lần tải lại thứ hai sau khi bấm Đồng bộ: lượt chạy nền thường xong trong vài giây tới vài chục giây. */
export const SYNC_RELOAD_DELAY_MS = 15_000;

/**
 * Đồng bộ tay với sàn (§18.5): BE xếp một lượt đồng bộ chạy nền, trả 202 `{ queued }` (quyền shop.sync). BE chưa phát
 * sự kiện khi lượt chạy xong (commerio-backend#223), nên tải lại ngay và thêm một lần sau `SYNC_RELOAD_DELAY_MS`.
 */
export function useSyncListings() {
  const invalidate = useInvalidateShops();
  return useMutation({
    mutationFn: async (shopId: string) => {
      const { data } = await apiClient.post<ListingSyncResult>(`/channel/shops/${shopId}/listings/sync`);
      return data;
    },
    onSuccess: () => {
      void invalidate();
      setTimeout(() => void invalidate(), SYNC_RELOAD_DELAY_MS);
    },
  });
}

// ---------- Category và attribute của sàn (commerio-backend#400, Documents/21 §18.5) ----------

export function usePlatformCategories(platform: string, params: PlatformCategoryParams, enabled = true) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: shopKeys.platformCategoryList(companyId, platform, params),
    enabled: Boolean(companyId) && enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await apiClient.get<PlatformCategoryList>(`/channel/platforms/${platform}/categories`, {
        params: params.search ? { search: params.search } : params.parentId ? { parentId: params.parentId } : undefined,
      });
      return data;
    },
  });
}

/**
 * Chi tiết leaf: BE có thể gọi sàn (lấy attribute khi chưa có hoặc quá 7 ngày) nên không thử lại khi lỗi.
 * `shopId`: gian hàng đang mở trang đẩy, TikTok gọi sàn bằng token của gian hàng đó
 */
export function usePlatformCategory(platform: string, externalId: string | null, shopId?: string | null) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: shopKeys.platformCategory(companyId, platform, externalId ?? ''),
    enabled: Boolean(companyId && externalId),
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data } = await apiClient.get<PlatformCategoryDetail>(
        `/channel/platforms/${platform}/categories/${encodeURIComponent(externalId ?? '')}`,
        { params: shopId ? { shopId } : undefined },
      );
      return data;
    },
  });
}

/** Xếp một lượt đồng bộ cây chạy nền; `queued = false` khi đã có lượt chờ */
export function useSyncPlatformCategories() {
  return useMutation({
    mutationFn: async (platform: string) => {
      const { data } = await apiClient.post<PlatformCategorySyncResult>(`/channel/platforms/${platform}/categories/sync`);
      return data;
    },
  });
}

/**
 * Gợi ý category của sàn cho một sản phẩm, gọi sàn bằng token của gian hàng (§18.5). Không thử lại: lỗi
 * `product_name_too_short`, `images_missing` không đổi khi gọi lại, sàn lỗi thì BE đã gọi lại một lần
 */
export function useCategorySuggestions(shopId: string | null, productId: string, enabled = true) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: shopKeys.suggestions(companyId, shopId ?? '', productId),
    enabled: Boolean(companyId && shopId && productId) && enabled,
    staleTime: 30 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data } = await apiClient.get<CategorySuggestionList>(`/channel/shops/${shopId}/category-suggestions`, {
        params: { productId },
      });
      return data;
    },
  });
}

/** Thông tin sàn của sản phẩm: một bộ mỗi sàn, mọi gian hàng của sàn dùng chung (§18.5) */
const productSpecQuery = (companyId: string, productId: string, platform: string) =>
  queryOptions({
    queryKey: shopKeys.productSpec(companyId, productId, platform),
    queryFn: async () => {
      const { data } = await apiClient.get<ProductSpecResult>(`/channel/products/${productId}/specs/${platform}`);
      return data;
    },
  });

export function useProductSpec(productId: string, platform: string, enabled = true) {
  const companyId = useCompanyId();
  return useQuery({
    ...productSpecQuery(companyId, productId, platform),
    enabled: Boolean(companyId && productId && platform) && enabled,
  });
}

/** Thông tin sàn của sản phẩm ở nhiều sàn cùng lúc (thanh tab trang sản phẩm, FE#417); cùng cache với `useProductSpec` */
export function useProductSpecs(productId: string | undefined, platforms: readonly string[], enabled = true) {
  const companyId = useCompanyId();
  return useQueries({
    queries: platforms.map((platform) => ({
      ...productSpecQuery(companyId, productId ?? '', platform),
      enabled: Boolean(companyId && productId) && enabled,
    })),
  });
}

/** Lưu thông tin sàn; 409 `version_conflict` mang `current` (kiểu `ProductSpecResult`) để nạp lại */
export function useSaveProductSpec() {
  const companyId = useCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, platform, input }: { productId: string; platform: string; input: ProductSpecInput }) => {
      const { data } = await apiClient.put<ProductSpecResult>(`/channel/products/${productId}/specs/${platform}`, input);
      return data;
    },
    onSuccess: (data, { productId, platform }) => {
      qc.setQueryData(shopKeys.productSpec(companyId, productId, platform), data);
      // Danh sách "sản phẩm đang dùng" của leaf ở trang Nhóm hàng & thuộc tính đổi theo
      void qc.invalidateQueries({ queryKey: shopKeys.platformCategories(companyId, platform) });
    },
  });
}

/** Giá trị cấp kế của attribute `input = 'cascade'` (Lazada propCascade); BE gọi sàn, không lưu */
export function usePlatformCascade(
  platform: string,
  externalId: string,
  code: string,
  path: string,
  shopId: string | null,
  enabled = true,
) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: shopKeys.cascade(companyId, platform, externalId, code, path),
    enabled: Boolean(companyId && externalId && code) && enabled,
    staleTime: 30 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data } = await apiClient.get<CascadeOptionList>(
        `/channel/platforms/${platform}/categories/${encodeURIComponent(externalId)}/cascade`,
        { params: { code, ...(path ? { path } : {}), ...(shopId ? { shopId } : {}) } },
      );
      return data;
    },
  });
}

/**
 * Dòng listing của một sản phẩm ở mọi gian hàng của sàn: không có route riêng theo sản phẩm nên đọc danh sách listing của
 * từng gian hàng (cùng khoá với `useShopListings`, dùng chung cache) rồi lọc theo `productId`. `poll` trả số ms hỏi lại
 * hoặc false (theo dõi `categoryChange.queued`, §18.5)
 */
/**
 * Listing của sản phẩm ở mọi gian hàng chưa ngắt, mỗi biến thể chưa lưu trữ × gian hàng một dòng (Documents/21 §18.5,
 * commerio-backend#467). Trang sản phẩm dùng; cùng nhóm khoá `shops` nên thao tác listing làm mới luôn
 */
export function useProductListingRows(productId: string | undefined, enabled = true) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: shopKeys.productListings(companyId, productId ?? ''),
    enabled: Boolean(companyId && productId) && enabled,
    queryFn: async () => {
      const { data } = await apiClient.get<{ items: ProductListingRow[] }>(`/channel/products/${productId}/listings`);
      return data.items;
    },
  });
}

export function useProductListings(shopIds: string[], productId: string, poll?: (rows: ListingRow[]) => number | false) {
  const companyId = useCompanyId();
  const results = useQueries({
    queries: shopIds.map((id) => ({
      queryKey: shopKeys.listings(companyId, id),
      enabled: Boolean(companyId && id),
      refetchInterval: poll
        ? (query: { state: { data?: ListingRow[] } }) => poll((query.state.data ?? []).filter((r) => r.productId === productId))
        : false,
      refetchIntervalInBackground: false,
      queryFn: async () => {
        const { data } = await apiClient.get<{ items: ListingRow[] }>(`/channel/shops/${id}/listings`);
        return data.items;
      },
    })),
  });
  const rows = results.flatMap((r, k) =>
    (r.data ?? []).filter((row) => row.productId === productId).map((row) => ({ shopId: shopIds[k]!, row })),
  );
  return { rows, isLoading: results.some((r) => r.isLoading) };
}

/**
 * Đổi category của sản phẩm đã đăng lên sàn (TikTok), chạy nền: 202 kèm danh sách sản phẩm trên sàn sẽ đổi (§18.5
 * `apply-category`). Lỗi 409 `version_conflict` mang `current` để nạp lại spec
 */
export function useApplyCategory() {
  const invalidate = useInvalidateShops();
  return useMutation({
    mutationFn: async ({ productId, platform, version }: { productId: string; platform: string; version: number }) => {
      const { data } = await apiClient.post<ApplyCategoryResult>(
        `/channel/products/${productId}/specs/${platform}/apply-category`,
        { version },
      );
      return data;
    },
    onSettled: invalidate,
  });
}
