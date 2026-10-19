/**
 * API tài chính: chứng từ, phiếu chi, thu COD, hoàn tiền, khoản thu chưa khớp (UC-PF-04..07).
 * Hợp đồng theo Documents/21 mục 12.5, 12.8, BE ở commerio-backend#27.
 */

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { useAuthStore } from '@/stores/authStore';
import type { PageResult } from './types';
import type {
  AssignResult,
  CodConfirmationResult,
  CodOrder,
  CodStatus,
  DocStatus,
  Invoice,
  InvoiceSummary,
  PaymentVoucher,
  Receipt,
  ReceiptSource,
  RefundItem,
  RefundListStatus,
  UnmatchedReason,
  UnmatchedReceipt,
  UnmatchedStatus,
  VoucherPurpose,
  VoucherStatus,
} from '@/types/finance';

interface ListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  /** yyyy-mm-dd, trọn ngày giờ VN */
  from?: string;
  to?: string;
}

export interface InvoiceListParams extends ListParams {
  status?: DocStatus;
}

export interface ReceiptListParams extends ListParams {
  source?: ReceiptSource;
  status?: DocStatus;
  orderId?: string;
}

/** `from`/`to` lọc theo ngày chi `paidOn` */
export interface VoucherListParams extends ListParams {
  purpose?: VoucherPurpose;
  status?: VoucherStatus;
}

export interface CodListParams extends ListParams {
  status: CodStatus;
}

export interface RefundListParams extends Omit<ListParams, 'from' | 'to'> {
  status: RefundListStatus;
}

export interface UnmatchedListParams extends ListParams {
  status: UnmatchedStatus;
  reason?: UnmatchedReason;
}

export const financeKeys = {
  all: (companyId: string) => ['company', companyId, 'finance'] as const,
  list: (companyId: string, path: string, params: object) => [...financeKeys.all(companyId), path, params] as const,
  doc: (companyId: string, path: string, id: string) => [...financeKeys.all(companyId), path, 'detail', id] as const,
};

function useCompanyId(): string {
  return useAuthStore((s) => s.companyContext?.companyId ?? '');
}

/** Ghi tiền chạm tới chứng từ, trạng thái tiền của đơn, giao dịch → làm mới mọi dữ liệu của công ty */
function useInvalidateCompany() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return () => qc.invalidateQueries({ queryKey: ['company', companyId] });
}

function useList<T>(path: string, params: object, enabled = true) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: financeKeys.list(companyId, path, params),
    enabled: Boolean(companyId) && enabled,
    queryFn: async () => {
      const { data } = await apiClient.get<PageResult<T>>(`/finance/${path}`, { params });
      return data;
    },
  });
}

function useDoc<T>(path: string, id: string) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: financeKeys.doc(companyId, path, id),
    enabled: Boolean(companyId && id),
    retry: false,
    queryFn: async () => {
      const { data } = await apiClient.get<T>(`/finance/${path}/${id}`);
      return data;
    },
  });
}

/** Số dòng của từng tab trạng thái: gọi trang 1 cỡ 1 rồi lấy `total` */
export function useTabCounts<S extends string>(path: string, tabs: readonly S[]) {
  const companyId = useCompanyId();
  const results = useQueries({
    queries: tabs.map((status) => {
      const params = { status, page: 1, pageSize: 1 };
      return {
        queryKey: financeKeys.list(companyId, path, params),
        enabled: Boolean(companyId),
        queryFn: async () => {
          const { data } = await apiClient.get<PageResult<unknown>>(`/finance/${path}`, { params });
          return data;
        },
      };
    }),
  });
  return Object.fromEntries(tabs.map((tab, i) => [tab, results[i].data?.total])) as Record<S, number | undefined>;
}

export const useInvoices = (params: InvoiceListParams) => useList<InvoiceSummary>('invoices', params);
export const useInvoice = (id: string) => useDoc<Invoice>('invoices', id);
export const useReceipts = (params: ReceiptListParams) => useList<Receipt>('receipts', params);
export const useReceipt = (id: string) => useDoc<Receipt>('receipts', id);
export const useVouchers = (params: VoucherListParams) => useList<PaymentVoucher>('payment-vouchers', params);
export const useVoucher = (id: string) => useDoc<PaymentVoucher>('payment-vouchers', id);
export const useCodOrders = (params: CodListParams) => useList<CodOrder>('cod-orders', params);
export const useRefunds = (params: RefundListParams, enabled = true) => useList<RefundItem>('refunds', params, enabled);
export const useUnmatchedReceipts = (params: UnmatchedListParams, enabled = true) =>
  useList<UnmatchedReceipt>('unmatched-receipts', params, enabled);

export interface CreateVoucherInput {
  purpose: VoucherPurpose;
  orderId?: string;
  unmatchedReceiptId?: string;
  amount: number;
  paidOn: string;
  note: string;
}

export function useCreateVoucher() {
  const invalidate = useInvalidateCompany();
  return useMutation({
    mutationFn: async (input: CreateVoucherInput) => {
      const { data } = await apiClient.post<PaymentVoucher>('/finance/payment-vouchers', input);
      return data;
    },
    onSettled: invalidate,
  });
}

export function useUpdateVoucher() {
  const invalidate = useInvalidateCompany();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; amount: number; paidOn: string; note: string; version: number }) => {
      const { data } = await apiClient.put<PaymentVoucher>(`/finance/payment-vouchers/${id}`, body);
      return data;
    },
    onSettled: invalidate,
  });
}

export function useDeleteVoucher() {
  const invalidate = useInvalidateCompany();
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      await apiClient.delete(`/finance/payment-vouchers/${id}`, { params: { version } });
    },
    onSettled: invalidate,
  });
}

export function usePostVoucher() {
  const invalidate = useInvalidateCompany();
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      const { data } = await apiClient.post<PaymentVoucher>(`/finance/payment-vouchers/${id}/post`, { version });
      return data;
    },
    onSettled: invalidate,
  });
}

/** Tất cả hoặc không: một đơn đổi trạng thái thì 409 `payment_state_changed` kèm `orders` */
export function useConfirmCod() {
  const invalidate = useInvalidateCompany();
  return useMutation({
    mutationFn: async (orderIds: string[]) => {
      const { data } = await apiClient.post<CodConfirmationResult>('/finance/cod-confirmations', { orderIds });
      return data;
    },
    onSettled: invalidate,
  });
}

/** Hoàn tiền một bước: 201 là phiếu chi `customer_refund` đã ghi sổ */
export function useRefundOrder() {
  const invalidate = useInvalidateCompany();
  return useMutation({
    mutationFn: async (input: { orderId: string; paidOn: string; note: string }) => {
      const { data } = await apiClient.post<PaymentVoucher>('/finance/refunds', input);
      return data;
    },
    onSettled: invalidate,
  });
}

export function useAssignUnmatched() {
  const invalidate = useInvalidateCompany();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; orderId: string; version: number }) => {
      const { data } = await apiClient.post<AssignResult>(`/finance/unmatched-receipts/${id}/assign`, body);
      return data;
    },
    onSettled: invalidate,
  });
}

export function useRefundUnmatched() {
  const invalidate = useInvalidateCompany();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; paidOn: string; note: string; version: number }) => {
      const { data } = await apiClient.post<PaymentVoucher>(`/finance/unmatched-receipts/${id}/refund`, body);
      return data;
    },
    onSettled: invalidate,
  });
}
