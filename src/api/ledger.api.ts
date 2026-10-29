/**
 * API sổ tiền (sơ đồ D4.1, FE#76): dòng sổ, lãi theo đơn, cảnh báo mốc doanh thu, xuất chứng từ kiểu MISA.
 * Hợp đồng ở Documents/21 mục 21.1.
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from './client';
import { blobErrorToJson, filenameFromDisposition, saveBlob } from './report.api';
import { useAuthStore } from '@/stores/authStore';
import type { LedgerFilter, LedgerResponse, OrderProfit, OrderProfitList, TaxWarningList } from '@/types/finance';

export interface LedgerParams {
  filter?: LedgerFilter;
  shopId?: string;
  orderId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface PageParams {
  page?: number;
  pageSize?: number;
}

export const ledgerKeys = {
  all: (companyId: string) => ['company', companyId, 'ledger'] as const,
  list: (companyId: string, params: LedgerParams) => [...ledgerKeys.all(companyId), 'list', params] as const,
  profits: (companyId: string, params: PageParams) => [...ledgerKeys.all(companyId), 'profits', params] as const,
  orderProfit: (companyId: string, orderId: string) => [...ledgerKeys.all(companyId), 'order', orderId] as const,
  taxWarnings: (companyId: string) => [...ledgerKeys.all(companyId), 'tax-warnings'] as const,
};

function useCompanyId(): string {
  return useAuthStore((s) => s.companyContext?.companyId ?? '');
}

export function useLedger(params: LedgerParams) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: ledgerKeys.list(companyId, params),
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data } = await apiClient.get<LedgerResponse>('/finance/ledger', { params });
      return data;
    },
  });
}

export function useOrderProfits(params: PageParams, enabled = true) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: ledgerKeys.profits(companyId, params),
    enabled: Boolean(companyId) && enabled,
    queryFn: async () => {
      const { data } = await apiClient.get<OrderProfitList>('/finance/orders/profit', { params });
      return data;
    },
  });
}

export function useOrderProfit(orderId: string, enabled = true) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: ledgerKeys.orderProfit(companyId, orderId),
    enabled: Boolean(companyId && orderId) && enabled,
    queryFn: async () => {
      const { data } = await apiClient.get<OrderProfit>(`/finance/orders/${orderId}/profit`);
      return data;
    },
  });
}

export function useTaxWarnings() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: ledgerKeys.taxWarnings(companyId),
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data } = await apiClient.get<TaxWarningList>('/finance/tax-warnings');
      return data;
    },
  });
}

/** Tải CSV chứng từ kiểu MISA; trả tên tệp đã lưu */
export function useExportLedger() {
  return useMutation({
    mutationFn: async (params: { from?: string; to?: string }) => {
      const res = await apiClient
        .get<Blob>('/finance/ledger/export', { params: { ...params, format: 'misa' }, responseType: 'blob' })
        .catch(blobErrorToJson);
      const filename = filenameFromDisposition(
        res.headers['content-disposition'] as string | undefined,
        'so-tien-misa.csv',
      );
      saveBlob(res.data, filename);
      return filename;
    },
  });
}
