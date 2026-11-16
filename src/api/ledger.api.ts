/**
 * API sổ tiền (sơ đồ D4.1, FE#150): dòng sổ, lãi theo đơn và theo SKU, lãi một đơn, cảnh báo mốc doanh thu.
 * Hợp đồng ở Documents/21 mục 21.1. Xuất sổ ra tệp (`/finance/ledger/export`) BE chưa có, FE chưa gọi.
 */

import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';
import { useAuthStore } from '@/stores/authStore';
import type {
  LedgerFilter,
  LedgerKind,
  LedgerResponse,
  OrderProfit,
  OrderProfitList,
  SkuProfitList,
  TaxWarningList,
} from '@/types/finance';

export interface LedgerParams {
  filter?: LedgerFilter;
  kind?: LedgerKind;
  shopId?: string;
  orderId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/** Kỳ theo ngày giao (gồm cả hai ngày), bắt buộc ở BE */
export interface ProfitParams {
  from: string;
  to: string;
  shopId?: string;
  page?: number;
  pageSize?: number;
}

export interface OrderProfitParams extends ProfitParams {
  costMissing?: boolean;
  belowFloor?: boolean;
}

export const ledgerKeys = {
  all: (companyId: string) => ['company', companyId, 'ledger'] as const,
  list: (companyId: string, params: LedgerParams) => [...ledgerKeys.all(companyId), 'list', params] as const,
  orderProfits: (companyId: string, params: OrderProfitParams) => [...ledgerKeys.all(companyId), 'order-profits', params] as const,
  skuProfits: (companyId: string, params: ProfitParams) => [...ledgerKeys.all(companyId), 'sku-profits', params] as const,
  orderProfit: (companyId: string, orderId: string) => [...ledgerKeys.all(companyId), 'order', orderId] as const,
  taxWarnings: (companyId: string) => [...ledgerKeys.all(companyId), 'tax-warnings'] as const,
};

function useCompanyId(): string {
  return useAuthStore((s) => s.companyContext?.companyId ?? '');
}

export function useLedger(params: LedgerParams, enabled = true) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: ledgerKeys.list(companyId, params),
    enabled: Boolean(companyId) && enabled,
    queryFn: async () => {
      const { data } = await apiClient.get<LedgerResponse>('/finance/ledger', { params });
      return data;
    },
  });
}

export function useOrderProfits(params: OrderProfitParams, enabled = true) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: ledgerKeys.orderProfits(companyId, params),
    enabled: Boolean(companyId) && enabled,
    queryFn: async () => {
      // Cờ lọc chỉ gửi khi bật: BE nhận chuỗi true/false
      const { costMissing, belowFloor, ...rest } = params;
      const query = { ...rest, ...(costMissing && { costMissing: 'true' }), ...(belowFloor && { belowFloor: 'true' }) };
      const { data } = await apiClient.get<OrderProfitList>('/finance/orders/profits', { params: query });
      return data;
    },
  });
}

export function useSkuProfits(params: ProfitParams, enabled = true) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: ledgerKeys.skuProfits(companyId, params),
    enabled: Boolean(companyId) && enabled,
    queryFn: async () => {
      const { data } = await apiClient.get<SkuProfitList>('/finance/skus/profits', { params });
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
