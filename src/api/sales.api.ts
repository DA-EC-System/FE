/**
 * API bán hàng của công ty đang làm việc: đơn (UC-SF-01, 02, 04). Khách hàng, tạo đơn tay ngoài MVP, gỡ ở FE#249.
 * Hợp đồng đề xuất ở FE#9, chờ commerio-backend#24.
 */

import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { useAuthStore } from '@/stores/authStore';
import type { PageResult } from './types';
import type { Order, OrderSummary } from '@/types/sales';

export interface OrderListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  source?: string;
  shopId?: string;
  paymentMethod?: string;
  /** Giai đoạn hiển thị (OrderStage) */
  stage?: string;
  flag?: string;
  customerId?: string;
  from?: string;
  to?: string;
}

export const salesKeys = {
  all: (companyId: string) => ['company', companyId, 'sales'] as const,
  orders: (companyId: string, params: OrderListParams) => [...salesKeys.all(companyId), 'orders', params] as const,
  order: (companyId: string, id: string) => [...salesKeys.all(companyId), 'order', id] as const,
};

function useCompanyId(): string {
  return useAuthStore((s) => s.companyContext?.companyId ?? '');
}

/** Đơn, khách và tồn khả dụng liên quan nhau → làm mới cả nhóm */
function useInvalidateSales() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return () => qc.invalidateQueries({ queryKey: salesKeys.all(companyId) });
}

export function useOrders(params: OrderListParams, options: { enabled?: boolean } = {}) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: salesKeys.orders(companyId, params),
    enabled: Boolean(companyId) && (options.enabled ?? true),
    queryFn: async () => {
      const { data } = await apiClient.get<PageResult<OrderSummary>>('/sales/orders', { params });
      return data;
    },
  });
}

/**
 * Số đơn của từng tab trạng thái theo bộ lọc đang chọn (FE#138): mỗi tab một lần gọi danh sách với pageSize 1,
 * đọc `total`. Tab `all` không lọc trạng thái.
 */
export function useOrderTabCounts<S extends string>(
  filters: Omit<OrderListParams, 'status' | 'page' | 'pageSize'>,
  tabs: readonly S[],
) {
  const companyId = useCompanyId();
  const results = useQueries({
    queries: tabs.map((tab) => {
      const params: OrderListParams = { ...filters, status: tab === 'all' ? undefined : tab, page: 1, pageSize: 1 };
      return {
        queryKey: salesKeys.orders(companyId, params),
        enabled: Boolean(companyId),
        queryFn: async () => {
          const { data } = await apiClient.get<PageResult<OrderSummary>>('/sales/orders', { params });
          return data;
        },
      };
    }),
  });
  return Object.fromEntries(tabs.map((tab, i) => [tab, results[i].data?.total])) as Record<S, number | undefined>;
}

export function useOrder(id: string) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: salesKeys.order(companyId, id),
    enabled: Boolean(companyId && id),
    queryFn: async () => {
      const { data } = await apiClient.get<Order>(`/sales/orders/${id}`);
      return data;
    },
  });
}

/** Số hoá đơn của đơn (≤ 50 ký tự); đơn sàn BE gửi lên sàn (§19.3) */
export function useSetInvoiceNumber() {
  const invalidate = useInvalidateSales();
  return useMutation({
    mutationFn: async ({ id, version, invoiceNumber }: { id: string; version: number; invoiceNumber: string }) => {
      const { data } = await apiClient.put<Order>(`/sales/orders/${id}/invoice-number`, { version, invoiceNumber });
      return data;
    },
    onSettled: invalidate,
  });
}

/** Xác nhận đơn COD tạo tay: unpaid → processing (sơ đồ D1); hàng đã giữ theo kiện từ lúc tạo */
export function useConfirmOrder() {
  const invalidate = useInvalidateSales();
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      const { data } = await apiClient.post<Order>(`/sales/orders/${id}/confirm`, { version });
      return data;
    },
    onSettled: invalidate,
  });
}

