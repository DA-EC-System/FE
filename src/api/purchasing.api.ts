/**
 * Nhập hàng của công ty đang làm việc (sơ đồ A1, A2, B4; FE#17).
 * BE lấy công ty từ token; companyId chỉ nằm trong query key.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import type { PageResult } from './types';
import { inventoryKeys } from './inventory.api';
import { useAuthStore } from '@/stores/authStore';
import type {
  AddRequestLineInput,
  GoodsReceipt,
  GoodsReceiptAction,
  GoodsReceiptCreateInput,
  GoodsReceiptListParams,
  GoodsReceiptSummary,
  GoodsReceiptUpdateInput,
  PurchaseRequest,
  PurchaseRequestAction,
  PurchaseRequestInput,
  PurchaseRequestListParams,
  PurchaseRequestSummary,
  ShortResolutionInput,
  Supplier,
  SupplierInput,
  SupplierReport,
  SupplierReportParams,
  SupplierReturn,
  SupplierReturnAction,
  SupplierReturnActionInput,
  SupplierReturnInput,
  SupplierReturnListParams,
  SupplierReturnSummary,
} from '@/types/purchasing';

export const purchasingKeys = {
  all: (companyId: string) => ['company', companyId, 'purchasing'] as const,
  suppliers: (companyId: string, params: object = {}) => [...purchasingKeys.all(companyId), 'suppliers', params] as const,
  supplierReport: (companyId: string, params?: SupplierReportParams) =>
    [...purchasingKeys.all(companyId), 'supplier-report', params ?? {}] as const,
  requests: (companyId: string, params: PurchaseRequestListParams) =>
    [...purchasingKeys.all(companyId), 'requests', params] as const,
  request: (companyId: string, id: string) => [...purchasingKeys.all(companyId), 'request', id] as const,
  receipts: (companyId: string, params: GoodsReceiptListParams) =>
    [...purchasingKeys.all(companyId), 'receipts', params] as const,
  receipt: (companyId: string, id: string) => [...purchasingKeys.all(companyId), 'receipt', id] as const,
  returns: (companyId: string, params: SupplierReturnListParams) =>
    [...purchasingKeys.all(companyId), 'returns', params] as const,
  return: (companyId: string, id: string) => [...purchasingKeys.all(companyId), 'return', id] as const,
};

function useCompanyId(): string {
  return useAuthStore((s) => s.companyContext?.companyId ?? '');
}

/** Nhập hàng đổi tồn, đang về, chờ xử lý và việc cần làm → làm mới cả ba nhóm */
function useInvalidatePurchasing() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: purchasingKeys.all(companyId) }),
      qc.invalidateQueries({ queryKey: inventoryKeys.all(companyId) }),
      qc.invalidateQueries({ queryKey: ['company', companyId, 'tasks'] }),
    ]);
}

// ---------- Nhà cung cấp ----------

export function useSuppliers(params: { search?: string; active?: boolean } = {}, options: { enabled?: boolean } = {}) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: purchasingKeys.suppliers(companyId, params),
    enabled: Boolean(companyId) && options.enabled !== false,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data } = await apiClient.get<Supplier[]>('/purchasing/suppliers', { params });
      return data;
    },
  });
}

export function useSupplierReport(params: SupplierReportParams = {}) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: purchasingKeys.supplierReport(companyId, params),
    enabled: Boolean(companyId),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data } = await apiClient.get<SupplierReport[]>('/purchasing/suppliers/report', { params });
      return data;
    },
  });
}

export function useSaveSupplier() {
  const invalidate = useInvalidatePurchasing();
  return useMutation({
    mutationFn: async ({ id, ...body }: SupplierInput & { id?: string }) => {
      const { data } = id
        ? await apiClient.put<Supplier>(`/purchasing/suppliers/${id}`, body)
        : await apiClient.post<Supplier>('/purchasing/suppliers', body);
      return data;
    },
    onSuccess: invalidate,
  });
}

// ---------- Đề nghị nhập (sơ đồ A1) ----------

export function usePurchaseRequests(params: PurchaseRequestListParams, options: { enabled?: boolean } = {}) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: purchasingKeys.requests(companyId, params),
    enabled: Boolean(companyId) && options.enabled !== false,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data } = await apiClient.get<PageResult<PurchaseRequestSummary>>('/purchasing/requests', { params });
      return data;
    },
  });
}

export function usePurchaseRequest(id: string | undefined) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: purchasingKeys.request(companyId, id ?? ''),
    enabled: Boolean(companyId && id),
    queryFn: async () => {
      const { data } = await apiClient.get<PurchaseRequest>(`/purchasing/requests/${id}`);
      return data;
    },
  });
}

export function useSavePurchaseRequest() {
  const invalidate = useInvalidatePurchasing();
  return useMutation({
    mutationFn: async ({ id, ...body }: PurchaseRequestInput & { id?: string }) => {
      const { data } = id
        ? await apiClient.put<PurchaseRequest>(`/purchasing/requests/${id}`, body)
        : await apiClient.post<PurchaseRequest>('/purchasing/requests', body);
      return data;
    },
    onSuccess: invalidate,
  });
}

/** Gợi ý nhập lại → thêm vào đề nghị nháp */
export function useAddRequestLine() {
  const invalidate = useInvalidatePurchasing();
  return useMutation({
    mutationFn: async (body: AddRequestLineInput) => {
      const { data } = await apiClient.post<PurchaseRequest>('/purchasing/requests/add-line', body);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useExcludeRequestLine() {
  const invalidate = useInvalidatePurchasing();
  return useMutation({
    mutationFn: async ({ id, lineId, ...body }: { id: string; lineId: string; excluded: boolean; version: number }) => {
      const { data } = await apiClient.post<PurchaseRequest>(`/purchasing/requests/${id}/lines/${lineId}/exclude`, body);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function usePurchaseRequestAction() {
  const invalidate = useInvalidatePurchasing();
  return useMutation({
    mutationFn: async ({
      id,
      action,
      ...body
    }: {
      id: string;
      action: PurchaseRequestAction;
      version: number;
      reason?: string;
    }) => {
      const { data } = await apiClient.post<PurchaseRequest>(`/purchasing/requests/${id}/${action}`, body);
      return data;
    },
    onSuccess: invalidate,
  });
}

// ---------- Phiếu nhận (sơ đồ A2) ----------

export function useGoodsReceipts(params: GoodsReceiptListParams) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: purchasingKeys.receipts(companyId, params),
    enabled: Boolean(companyId),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data } = await apiClient.get<PageResult<GoodsReceiptSummary>>('/purchasing/goods-receipts', { params });
      return data;
    },
  });
}

export function useGoodsReceipt(id: string | undefined) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: purchasingKeys.receipt(companyId, id ?? ''),
    enabled: Boolean(companyId && id),
    queryFn: async () => {
      const { data } = await apiClient.get<GoodsReceipt>(`/purchasing/goods-receipts/${id}`);
      return data;
    },
  });
}

export function useCreateGoodsReceipt() {
  const invalidate = useInvalidatePurchasing();
  return useMutation({
    mutationFn: async (body: GoodsReceiptCreateInput) => {
      const { data } = await apiClient.post<GoodsReceipt>('/purchasing/goods-receipts', body);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateGoodsReceipt() {
  const invalidate = useInvalidatePurchasing();
  return useMutation({
    mutationFn: async ({ id, ...body }: GoodsReceiptUpdateInput & { id: string }) => {
      const { data } = await apiClient.put<GoodsReceipt>(`/purchasing/goods-receipts/${id}`, body);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useGoodsReceiptAction() {
  const invalidate = useInvalidatePurchasing();
  return useMutation({
    mutationFn: async ({
      id,
      action,
      ...body
    }: {
      id: string;
      action: GoodsReceiptAction;
      version: number;
      reason?: string;
    }) => {
      const { data } = await apiClient.post<GoodsReceipt>(`/purchasing/goods-receipts/${id}/${action}`, body);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useShortResolution() {
  const invalidate = useInvalidatePurchasing();
  return useMutation({
    mutationFn: async ({ id, ...body }: ShortResolutionInput & { id: string }) => {
      const { data } = await apiClient.post<GoodsReceipt>(`/purchasing/goods-receipts/${id}/short-resolution`, body);
      return data;
    },
    onSuccess: invalidate,
  });
}

// ---------- Phiếu trả NCC (sơ đồ B4) ----------

export function useSupplierReturns(params: SupplierReturnListParams) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: purchasingKeys.returns(companyId, params),
    enabled: Boolean(companyId),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data } = await apiClient.get<PageResult<SupplierReturnSummary>>('/purchasing/supplier-returns', { params });
      return data;
    },
  });
}

export function useSupplierReturn(id: string | undefined) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: purchasingKeys.return(companyId, id ?? ''),
    enabled: Boolean(companyId && id),
    queryFn: async () => {
      const { data } = await apiClient.get<SupplierReturn>(`/purchasing/supplier-returns/${id}`);
      return data;
    },
  });
}

export function useSaveSupplierReturn() {
  const invalidate = useInvalidatePurchasing();
  return useMutation({
    mutationFn: async ({ id, ...body }: SupplierReturnInput & { id?: string }) => {
      const { data } = id
        ? await apiClient.put<SupplierReturn>(`/purchasing/supplier-returns/${id}`, body)
        : await apiClient.post<SupplierReturn>('/purchasing/supplier-returns', body);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useSupplierReturnAction() {
  const invalidate = useInvalidatePurchasing();
  return useMutation({
    mutationFn: async ({ id, action, ...body }: SupplierReturnActionInput & { id: string; action: SupplierReturnAction }) => {
      const { data } = await apiClient.post<SupplierReturn>(`/purchasing/supplier-returns/${id}/${action}`, body);
      return data;
    },
    onSuccess: invalidate,
  });
}
