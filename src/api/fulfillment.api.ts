/**
 * API giao vận: huỷ đơn, lô nhặt, xuất kho, cập nhật giao (UC-SF-06 đến UC-SF-09).
 * Hợp đồng đề xuất ở FE#10, chờ commerio-backend#25.
 */

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { useAuthStore } from '@/stores/authStore';
import type { PageResult } from './types';
import type { Order } from '@/types/sales';
import type {
  Batch,
  BatchIssueResult,
  BatchStatus,
  BatchSummary,
  DeliveryStatus,
  FulfillmentOrder,
  IssueOrderResult,
} from '@/types/fulfillment';

export type FulfillmentTab = 'confirmed' | 'picking' | 'packing' | 'issued';

export interface FulfillmentOrderParams {
  status: FulfillmentTab;
  page?: number;
  pageSize?: number;
  search?: string;
  source?: string;
  shopId?: string;
}

export interface BatchListParams {
  page?: number;
  pageSize?: number;
  status?: BatchStatus;
}

export const fulfillmentKeys = {
  all: (companyId: string) => ['company', companyId, 'fulfillment'] as const,
  orders: (companyId: string, params: FulfillmentOrderParams) =>
    [...fulfillmentKeys.all(companyId), 'orders', params] as const,
  batches: (companyId: string, params: BatchListParams) =>
    [...fulfillmentKeys.all(companyId), 'batches', params] as const,
  batch: (companyId: string, id: string) => [...fulfillmentKeys.all(companyId), 'batch', id] as const,
};

function useCompanyId(): string {
  return useAuthStore((s) => s.companyContext?.companyId ?? '');
}

/** Đổi trạng thái đơn chạm tới đơn, lô, tồn kho, thanh toán → làm mới mọi dữ liệu của công ty */
function useInvalidateCompany() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return () => qc.invalidateQueries({ queryKey: ['company', companyId] });
}

export function useFulfillmentOrders(params: FulfillmentOrderParams) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: fulfillmentKeys.orders(companyId, params),
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data } = await apiClient.get<PageResult<FulfillmentOrder>>('/fulfillment/orders', { params });
      return data;
    },
  });
}

/** Số đơn mỗi tab: hỏi từng tab với pageSize 1 rồi lấy total */
export function useFulfillmentCounts(tabs: FulfillmentTab[]) {
  const companyId = useCompanyId();
  const results = useQueries({
    queries: tabs.map((status) => {
      const params: FulfillmentOrderParams = { status, page: 1, pageSize: 1 };
      return {
        queryKey: fulfillmentKeys.orders(companyId, params),
        enabled: Boolean(companyId),
        queryFn: async () => {
          const { data } = await apiClient.get<PageResult<FulfillmentOrder>>('/fulfillment/orders', { params });
          return data;
        },
      };
    }),
  });
  return Object.fromEntries(tabs.map((tab, i) => [tab, results[i].data?.total])) as Record<
    FulfillmentTab,
    number | undefined
  >;
}

export function useBatches(params: BatchListParams) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: fulfillmentKeys.batches(companyId, params),
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data } = await apiClient.get<PageResult<BatchSummary>>('/fulfillment/batches', { params });
      return data;
    },
  });
}

export function useBatch(id: string) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: fulfillmentKeys.batch(companyId, id),
    enabled: Boolean(companyId && id),
    queryFn: async () => {
      const { data } = await apiClient.get<Batch>(`/fulfillment/batches/${id}`);
      return data;
    },
  });
}

/** 409 already_in_batch, invalid_transition, version_conflict kèm orderIds */
export function useCreateBatch() {
  const invalidate = useInvalidateCompany();
  return useMutation({
    mutationFn: async (orders: { id: string; version: number }[]) => {
      const { data } = await apiClient.post<Batch>('/fulfillment/batches', { orders });
      return data;
    },
    onSettled: invalidate,
  });
}

export function useMarkBatchPicked() {
  const invalidate = useInvalidateCompany();
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      const { data } = await apiClient.post<Batch>(`/fulfillment/batches/${id}/picked`, { version });
      return data;
    },
    onSettled: invalidate,
  });
}

export function useIssueBatch() {
  const invalidate = useInvalidateCompany();
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      const { data } = await apiClient.post<BatchIssueResult>(`/fulfillment/batches/${id}/issue`, { version });
      return data;
    },
    onSettled: invalidate,
  });
}

/** 409 payment_required với đơn trả trước chưa trả đủ */
export function useIssueOrder() {
  const invalidate = useInvalidateCompany();
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      const { data } = await apiClient.post<IssueOrderResult>(`/fulfillment/orders/${id}/issue`, { version });
      return data;
    },
    onSettled: invalidate,
  });
}

/** Nhả hàng đang giữ, huỷ mã thanh toán còn hiệu lực; đơn đã trả thì chờ hoàn tiền */
export function useCancelOrder() {
  const invalidate = useInvalidateCompany();
  return useMutation({
    mutationFn: async ({ id, version, reason }: { id: string; version: number; reason: string }) => {
      const { data } = await apiClient.post<Order>(`/sales/orders/${id}/cancel`, { version, reason });
      return data;
    },
    onSettled: invalidate,
  });
}

export function useUpdateDelivery() {
  const invalidate = useInvalidateCompany();
  return useMutation({
    mutationFn: async (input: { id: string; version: number; status: DeliveryStatus; reason?: string }) => {
      const { id, ...body } = input;
      const { data } = await apiClient.post<Order>(`/fulfillment/orders/${id}/delivery`, body);
      return data;
    },
    onSettled: invalidate,
  });
}
