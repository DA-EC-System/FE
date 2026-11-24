import { useCallback, useEffect } from 'react';
import { keepPreviousData, useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { useShopLabel } from './shops.api';
import { useAuthStore } from '@/stores/authStore';
import type { ProductReadiness, PushPreview, PushPreviewRow } from '@/types/blocker';

export const readinessKey = (companyId: string, productId: string) => ['company', companyId, 'readiness', productId] as const;

// Mỗi sản phẩm một lần theo dõi dù nhiều chỗ cùng đọc readiness (rail, nhãn tab, trình đăng)
const watching = new WeakMap<QueryClient, Map<string, { count: number; stop: () => void }>>();

/**
 * Bất kỳ truy vấn nào khác có `productId` trong khoá vừa nạp xong (sản phẩm, thông tin sàn, listing của sản phẩm) thì
 * readiness hỏi lại, để rail, nhãn tab và trình đăng không lệch bản vừa lưu. Không phải sửa từng mutation.
 */
function useWatchProduct(qc: QueryClient, companyId: string, productId: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let map = watching.get(qc);
    if (!map) watching.set(qc, (map = new Map()));
    const id = `${companyId}:${productId}`;
    let entry = map.get(id);
    if (!entry) {
      const key = readinessKey(companyId, productId);
      const stop = qc.getQueryCache().subscribe((e) => {
        if (e.type !== 'updated' || e.action.type !== 'success') return;
        const k = e.query.queryKey;
        if (k[2] === 'readiness' || !k.includes(productId)) return;
        void qc.invalidateQueries({ queryKey: key });
      });
      map.set(id, (entry = { count: 0, stop }));
    }
    entry.count += 1;
    const owner = map;
    return () => {
      const cur = owner.get(id);
      if (!cur) return;
      cur.count -= 1;
      if (cur.count <= 0) {
        cur.stop();
        owner.delete(id);
      }
    };
  }, [qc, companyId, productId, enabled]);
}

/**
 * Readiness đăng sản phẩm theo từng gian hàng chưa ngắt (Documents/21 §18.10, commerio-backend#564). Cùng hàm kiểm với
 * `push` và `push-preview`, nên rail, nhãn tab sàn và trình đăng báo cùng số mục, cùng lý do (FE#458).
 */
export function useProductReadiness(productId: string | null | undefined, enabled = true) {
  const companyId = useAuthStore((s) => s.companyContext?.companyId ?? '');
  const qc = useQueryClient();
  const on = Boolean(companyId && productId) && enabled;
  useWatchProduct(qc, companyId, productId ?? '', on);
  // Readiness chỉ có tên trên sàn: thay bằng tên hiển thị (FE#464) cho rail, ghi chú, tab sàn, lý do khoá Đăng
  const shopLabel = useShopLabel();
  const select = useCallback(
    (items: ProductReadiness['items']) =>
      items.map((s) => {
        const name = shopLabel(s.shopId, s.shopName);
        return name !== s.shopName ? { ...s, shopName: name } : s;
      }),
    [shopLabel],
  );
  return useQuery({
    queryKey: readinessKey(companyId, productId ?? ''),
    queryFn: async () => {
      const { data } = await apiClient.get<ProductReadiness>(`/channel/products/${productId}/readiness`);
      return data.items;
    },
    select,
    enabled: on,
  });
}

/** BE nhận tối đa 200 biến thể mỗi lần xem trước (`PushPreviewBody`) */
export const PUSH_PREVIEW_BATCH = 200;

export interface PushPreviewInput {
  shopId: string;
  variantIds: string[];
  /** Giá người bán gõ theo biến thể (chỉ biến thể có trong `variantIds`) */
  listPrices?: Record<string, number>;
}

/** Gọi `push-preview` theo lô 200, gộp dòng theo thứ tự `variantIds` */
export async function fetchPushPreview({ shopId, variantIds, listPrices }: PushPreviewInput): Promise<PushPreviewRow[]> {
  const rows: PushPreviewRow[] = [];
  for (let i = 0; i < variantIds.length; i += PUSH_PREVIEW_BATCH) {
    const ids = variantIds.slice(i, i + PUSH_PREVIEW_BATCH);
    const prices = Object.fromEntries(ids.filter((id) => listPrices?.[id] !== undefined).map((id) => [id, listPrices![id]!]));
    const body = { variantIds: ids, ...(Object.keys(prices).length ? { listPrices: prices } : {}) };
    const { data } = await apiClient.post<PushPreview>(`/channel/shops/${shopId}/listings/push-preview`, body);
    rows.push(...data.rows);
  }
  return rows;
}

const pushPreviewKey = (companyId: string, input: PushPreviewInput) =>
  ['company', companyId, 'push-preview', input.shopId, input.variantIds.join(','), JSON.stringify(input.listPrices ?? {})] as const;

/**
 * Kiểm trước khi đăng (Documents/21 §18.11, commerio-backend#566): mục chặn, giá sẽ gửi, thực nhận, tồn sẽ đẩy của từng
 * biến thể ở một gian hàng. Không ghi gì. Cùng hàm chặn với readiness và `push`, nên bước 3 trình đăng không lệch rail.
 */
export function usePushPreview(shopId: string | null, variantIds: string[], listPrices?: Record<string, number>) {
  return usePushPreviews(shopId ? [{ shopId, variantIds, ...(listPrices ? { listPrices } : {}) }] : [])[0];
}

/** `usePushPreview` cho nhiều gian hàng cùng lúc (bước 3 trình đăng) */
export function usePushPreviews(inputs: PushPreviewInput[]) {
  const companyId = useAuthStore((s) => s.companyContext?.companyId ?? '');
  return useQueries({
    queries: inputs.map((input) => ({
      queryKey: pushPreviewKey(companyId, input),
      queryFn: () => fetchPushPreview(input),
      enabled: Boolean(companyId) && input.variantIds.length > 0,
      // Gõ giá đổi khoá: giữ kết quả cũ tới khi có kết quả mới, dòng không nhảy về "Đang kiểm"
      placeholderData: keepPreviousData,
    })),
  });
}
