/**
 * Kho của công ty đang làm việc (UC-IN-01..03, commerio-backend#16).
 * BE lấy công ty từ token; companyId chỉ nằm trong query key.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import type { PageResult } from './types';
import { useAuthStore } from '@/stores/authStore';
import type {
  ReorderRuleInput,
  ReturnOrder,
  ReturnReceiptInput,
  StockDetail,
  StockDoc,
  StockDocCreateInput,
  StockDocListParams,
  StockDocSummary,
  StockDocUpdateInput,
  StockLevel,
  StockListParams,
  StockListResult,
} from '@/types/inventory';

export const inventoryKeys = {
  all: (companyId: string) => ['company', companyId, 'inventory'] as const,
  stock: (companyId: string, params: StockListParams) =>
    [...inventoryKeys.all(companyId), 'stock', params] as const,
  stockDetail: (companyId: string, variantId: string) =>
    [...inventoryKeys.all(companyId), 'stock-detail', variantId] as const,
  docs: (companyId: string, params: StockDocListParams) =>
    [...inventoryKeys.all(companyId), 'docs', params] as const,
  doc: (companyId: string, id: string) => [...inventoryKeys.all(companyId), 'doc', id] as const,
  returns: (companyId: string) => [...inventoryKeys.all(companyId), 'returns'] as const,
};

function useCompanyId(): string {
  return useAuthStore((s) => s.companyContext?.companyId ?? '');
}

/** Ghi sổ đổi tồn, lịch sử, danh sách phiếu và trạng thái đơn hoàn → làm mới cả nhóm */
function useInvalidateInventory() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return () => qc.invalidateQueries({ queryKey: inventoryKeys.all(companyId) });
}

// ---------- Tồn kho, ngưỡng (UC-IN-01, UC-IN-02) ----------

export function useStock(params: StockListParams, options: { enabled?: boolean } = {}) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: inventoryKeys.stock(companyId, params),
    enabled: Boolean(companyId) && options.enabled !== false,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data } = await apiClient.get<StockListResult>('/inventory/stock', { params });
      return data;
    },
  });
}

export function useStockDetail(variantId: string | null) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: inventoryKeys.stockDetail(companyId, variantId ?? ''),
    enabled: Boolean(companyId && variantId),
    queryFn: async () => {
      const { data } = await apiClient.get<StockDetail>(`/inventory/stock/${variantId}`);
      return data;
    },
  });
}

export function useSetReorderRule() {
  const invalidate = useInvalidateInventory();
  return useMutation({
    mutationFn: async ({ variantId, ...body }: ReorderRuleInput & { variantId: string }) => {
      const { data } = await apiClient.put<StockLevel>(`/inventory/stock/${variantId}/reorder-rule`, body);
      return data;
    },
    onSuccess: invalidate,
  });
}

// ---------- Phiếu nhập, phiếu xuất ----------

export function useStockDocs(params: StockDocListParams) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: inventoryKeys.docs(companyId, params),
    enabled: Boolean(companyId),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data } = await apiClient.get<PageResult<StockDocSummary>>('/inventory/documents', { params });
      return data;
    },
  });
}

export function useStockDoc(id: string | undefined) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: inventoryKeys.doc(companyId, id ?? ''),
    enabled: Boolean(companyId && id),
    queryFn: async () => {
      const { data } = await apiClient.get<StockDoc>(`/inventory/documents/${id}`);
      return data;
    },
  });
}

export function useCreateStockDoc() {
  const invalidate = useInvalidateInventory();
  return useMutation({
    mutationFn: async (body: StockDocCreateInput) => {
      const { data } = await apiClient.post<StockDoc>('/inventory/documents', body);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateStockDoc() {
  const invalidate = useInvalidateInventory();
  return useMutation({
    mutationFn: async ({ id, ...body }: StockDocUpdateInput & { id: string }) => {
      const { data } = await apiClient.put<StockDoc>(`/inventory/documents/${id}`, body);
      return data;
    },
    onSuccess: invalidate,
  });
}

/** Ghi sổ hoặc huỷ phiếu nháp */
export function useStockDocAction(action: 'post' | 'cancel') {
  const invalidate = useInvalidateInventory();
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      const { data } = await apiClient.post<StockDoc>(`/inventory/documents/${id}/${action}`, { version });
      return data;
    },
    onSuccess: invalidate,
  });
}

// ---------- Nhập hoàn (UC-IN-03) ----------

export function useReturnOrders(options: { enabled?: boolean } = {}) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: inventoryKeys.returns(companyId),
    enabled: Boolean(companyId) && options.enabled !== false,
    queryFn: async () => {
      const { data } = await apiClient.get<ReturnOrder[]>('/inventory/returns');
      return data;
    },
  });
}

export function useCreateReturnReceipt() {
  const invalidate = useInvalidateInventory();
  return useMutation({
    mutationFn: async (body: ReturnReceiptInput) => {
      const { data } = await apiClient.post<StockDoc>('/inventory/returns', body);
      return data;
    },
    onSuccess: invalidate,
  });
}
