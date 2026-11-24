import { useEffect } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { useAuthStore } from '@/stores/authStore';
import type { ProductReadiness } from '@/types/blocker';

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
  return useQuery({
    queryKey: readinessKey(companyId, productId ?? ''),
    queryFn: async () => {
      const { data } = await apiClient.get<ProductReadiness>(`/channel/products/${productId}/readiness`);
      return data.items;
    },
    enabled: on,
  });
}
