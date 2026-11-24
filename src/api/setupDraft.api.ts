/**
 * Bản nháp thiết lập gian hàng và danh sách SKU sàn gom theo sản phẩm sàn (Documents/21 §18.7.5 "Bản nháp thiết lập",
 * §18.12, §18.5 `category-sync`). Wizard onboarding (FE#468 bước 4–6) và trang `/channel/shops/:id/setup` dùng chung.
 *
 * Bản nháp sống trong cache của `GET /setup`: mọi lần ghi trả `{ draft, draftVersion }` mới, hook ghi thẳng vào cache
 * nên mọi bước đọc cùng một bản, không gọi lại GET.
 */

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMutation } from './useMutation';
import { apiClient } from './client';
import { shopKeys } from './shops.api';
import { useAuthStore } from '@/stores/authStore';
import type {
  CategorySyncState,
  CreateGroup,
  DecisionFilter,
  RemoteProductList,
  RemoteProductStatus,
  SetupDraftInput,
  SetupDraftSaved,
  ShopSetupDraftView,
  SkuLinkDraftResult,
} from '@/types/setupDraft';
import type { ShopSetupResult } from '@/types/shop';

const useCompanyId = () => useAuthStore((s) => s.companyContext?.companyId ?? '');

export const setupDraftKeys = {
  /**
   * Ngoài `shopKeys.all`: sự kiện SSE `channel.*`, nối lại SSE và mọi lần làm mới gian hàng không gọi lại GET /setup (GET
   * này còn đọc sàn), và không có lượt đọc cũ nào ghi đè nháp mới hơn trong cache
   */
  view: (companyId: string, shopId: string) => ['setup-draft', companyId, shopId] as const,
  remoteProducts: (companyId: string, shopId: string) => [...shopKeys.all(companyId), 'remote-products', shopId] as const,
  categorySync: (companyId: string, shopId: string) => [...shopKeys.all(companyId), 'category-sync', shopId] as const,
};

/** Hỏi lại `category-sync` khi cây hoặc quyền đang `queued`/`running` (như 18.7.7) */
export const CATEGORY_SYNC_POLL_MS = 3000;

/** GET /setup: mốc kéo đơn đề xuất, gian hàng đầu tiên, bản nháp. Chỉ gọi khi gian hàng `connecting` */
export function useSetupDraftView(shopId: string, enabled: boolean) {
  const companyId = useCompanyId();
  const qc = useQueryClient();
  return useQuery({
    queryKey: setupDraftKeys.view(companyId, shopId),
    enabled: Boolean(companyId && shopId) && enabled,
    retry: false,
    queryFn: async () => {
      const { data } = await apiClient.get<ShopSetupDraftView>(`/channel/shops/${shopId}/setup`);
      // Lượt đọc bắt đầu trước một lần ghi mà về sau lần ghi đó: giữ nháp mới hơn, không lùi draftVersion (sẽ ra 409 giả)
      const old = qc.getQueryData<ShopSetupDraftView>(setupDraftKeys.view(companyId, shopId));
      return old && old.draftVersion > data.draftVersion ? { ...data, draft: old.draft, draftVersion: old.draftVersion } : data;
    },
  });
}

/** Ghi kết quả của một lần ghi nháp vào cache GET /setup */
export function useApplySavedDraft(shopId: string) {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return async (saved: SetupDraftSaved) => {
    const key = setupDraftKeys.view(companyId, shopId);
    // Huỷ lượt đọc đang chạy để nó không ghi bản cũ đè lên (cùng cách inventory.api.ts, FE#147)
    await qc.cancelQueries({ queryKey: key });
    qc.setQueryData<ShopSetupDraftView>(key, (old) => {
      if (!old) return old;
      // `changed` chỉ GET trả; xác nhận lại bước Liên kết SKU thì BE đặt lại baseline nên bỏ câu báo
      const sameBaseline = old.draft?.confirmed.link_skus === saved.draft.confirmed.link_skus;
      return { ...old, draft: { ...saved.draft, changed: sameBaseline ? (old.draft?.changed ?? null) : null }, draftVersion: saved.draftVersion };
    });
  };
}

/** PUT /setup/draft: lưu `openingStock`, `returnWindowDays`, hoặc xác nhận bước (`confirm`) */
export function useSaveSetupDraft(shopId: string) {
  const apply = useApplySavedDraft(shopId);
  return useMutation({
    mutationFn: async (input: SetupDraftInput) => {
      const { data } = await apiClient.put<SetupDraftSaved>(`/channel/shops/${shopId}/setup/draft`, input);
      return data;
    },
    onSuccess: apply,
  });
}

/**
 * POST sku-links chỉ với `groups` (bước 4 gán danh mục cho sản phẩm sắp tạo). `items` là quyết định từng SKU, thuộc danh
 * sách Liên kết SKU (FE#460), không gửi ở đây. Sản phẩm sàn đổi danh mục thì danh sách đọc lại để cột danh mục khớp nháp.
 */
export function useSaveCreateGroups(shopId: string) {
  const apply = useApplySavedDraft(shopId);
  return useMutation({
    mutationFn: async ({ groups, draftVersion }: { groups: CreateGroup[]; draftVersion: number }) => {
      const { data } = await apiClient.post<SkuLinkDraftResult>(`/channel/shops/${shopId}/sku-links`, { groups, draftVersion });
      return data;
    },
    // Cột danh mục đọc `draft.createGroups`, không đọc danh sách: không cần tải lại các trang sản phẩm
    onSuccess: apply,
  });
}

export interface RemoteProductQuery {
  status?: RemoteProductStatus;
  search?: string;
  decision?: DecisionFilter;
  page: number;
  pageSize?: number;
}

/** GET remote-products: phân trang theo sản phẩm sàn, mỗi sản phẩm đủ SKU khớp lọc (§18.12) */
export function useRemoteProducts(shopId: string, query: RemoteProductQuery, enabled = true) {
  const companyId = useCompanyId();
  const search = query.search && query.search.trim().length >= 2 ? query.search.trim() : undefined;
  const params = { ...query, search };
  return useQuery({
    queryKey: [...setupDraftKeys.remoteProducts(companyId, shopId), params],
    enabled: Boolean(companyId && shopId) && enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data } = await apiClient.get<RemoteProductList>(`/channel/shops/${shopId}/remote-products`, { params });
      return data;
    },
  });
}

/** Trần số trang đọc liền một lượt (50 sản phẩm mỗi trang): 4.000 sản phẩm sẽ tạo */
const ALL_PAGES_MAX = 80;

/**
 * Mọi sản phẩm sàn có SKU mang quyết định `decision` (bước 4 dùng `create`): đọc liền các trang 50 sản phẩm. Bước 4 cần cả
 * danh sách vì lọc "Chưa có danh mục" và ghi danh mục gợi ý xét theo nháp, BE không lọc được theo danh mục.
 */
export function useAllRemoteProducts(shopId: string, decision: DecisionFilter, enabled = true) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: [...setupDraftKeys.remoteProducts(companyId, shopId), 'all', decision],
    enabled: Boolean(companyId && shopId) && enabled,
    queryFn: async () => {
      const items: RemoteProductList['items'] = [];
      for (let page = 1; page <= ALL_PAGES_MAX; page += 1) {
        const { data } = await apiClient.get<RemoteProductList>(`/channel/shops/${shopId}/remote-products`, {
          params: { status: 'all', decision, page, pageSize: 50 },
        });
        items.push(...data.items);
        if (items.length >= data.total || !data.items.length) break;
      }
      return items;
    },
  });
}

/** GET category-sync: trạng thái cây category của sàn và quyền theo gian hàng (§18.5) */
export function useCategorySync(shopId: string, enabled = true) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: setupDraftKeys.categorySync(companyId, shopId),
    enabled: Boolean(companyId && shopId) && enabled,
    retry: false,
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d) return false;
      const busy = (s: string | undefined) => s === 'queued' || s === 'running';
      return busy(d.tree.state) || busy(d.permissions?.state) ? CATEGORY_SYNC_POLL_MS : false;
    },
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data } = await apiClient.get<CategorySyncState>(`/channel/shops/${shopId}/category-sync`);
      return data;
    },
  });
}

/** Nút "Thử lại" của khối category: xếp lại lượt đồng bộ cây rồi đọc lại trạng thái */
export function useRetryCategorySync(shopId: string, platform: string) {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{ queued: boolean }>(`/channel/platforms/${platform}/categories/sync`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: setupDraftKeys.categorySync(companyId, shopId) }),
  });
}

/** POST /setup { draftVersion }: BE đọc nháp đã lưu, tạo listing, SKU kho, phiếu đầu kỳ trong một giao dịch */
export function useFinishSetupFromDraft(shopId: string) {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return useMutation({
    mutationFn: async (draftVersion: number) => {
      const { data } = await apiClient.post<ShopSetupResult>(`/channel/shops/${shopId}/setup`, { draftVersion });
      return data;
    },
    onSuccess: (data) => {
      // Gian hàng đã active: bỏ nháp và danh sách SKU sàn của lần thiết lập (GET /setup giờ trả 409), chỉ làm mới gian hàng
      qc.removeQueries({ queryKey: setupDraftKeys.view(companyId, shopId) });
      qc.removeQueries({ queryKey: setupDraftKeys.remoteProducts(companyId, shopId) });
      qc.setQueryData(shopKeys.detail(companyId, data.shop.id), data.shop);
      return qc.invalidateQueries({ queryKey: shopKeys.list(companyId) });
    },
  });
}
