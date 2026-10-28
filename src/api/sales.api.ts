/**
 * API bán hàng của công ty đang làm việc: khách hàng, đơn (UC-SF-01, 02, 04).
 * Hợp đồng đề xuất ở FE#9, chờ commerio-backend#24.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { useAuthStore } from '@/stores/authStore';
import type { PageResult } from './types';
import type {
  CreateOrderInput,
  Customer,
  CustomerSummary,
  Order,
  OrderSummary,
  OrderVariantOption,
} from '@/types/sales';

export interface CustomerListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  channel?: string;
  from?: string;
  to?: string;
}

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
  customers: (companyId: string, params: CustomerListParams) =>
    [...salesKeys.all(companyId), 'customers', params] as const,
  customer: (companyId: string, id: string) => [...salesKeys.all(companyId), 'customer', id] as const,
  orders: (companyId: string, params: OrderListParams) => [...salesKeys.all(companyId), 'orders', params] as const,
  order: (companyId: string, id: string) => [...salesKeys.all(companyId), 'order', id] as const,
  variants: (companyId: string, search: string) => [...salesKeys.all(companyId), 'variants', search] as const,
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

export function useCustomers(params: CustomerListParams, options: { enabled?: boolean } = {}) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: salesKeys.customers(companyId, params),
    enabled: Boolean(companyId) && (options.enabled ?? true),
    queryFn: async () => {
      const { data } = await apiClient.get<PageResult<CustomerSummary>>('/sales/customers', { params });
      return data;
    },
  });
}

export function useCustomer(id: string) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: salesKeys.customer(companyId, id),
    enabled: Boolean(companyId && id),
    queryFn: async () => {
      const { data } = await apiClient.get<Customer>(`/sales/customers/${id}`);
      return data;
    },
  });
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

export function useOrderVariants(search: string) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: salesKeys.variants(companyId, search),
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data } = await apiClient.get<OrderVariantOption[]>('/sales/order-variants', {
        params: { search: search || undefined, limit: 20 },
      });
      return data;
    },
  });
}

export function useCreateOrder() {
  const invalidate = useInvalidateSales();
  return useMutation({
    mutationFn: async (input: CreateOrderInput) => {
      const { data } = await apiClient.post<Order>('/sales/orders', input);
      return data;
    },
    onSuccess: invalidate,
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
