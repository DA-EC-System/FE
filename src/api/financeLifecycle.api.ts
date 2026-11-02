import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { useAuthStore } from '@/stores/authStore';
import type { PageResult } from './types';
import type { OrderPayment, OrderPaymentDetail, OrderPaymentPage, SettlementLedgerLine, SettlementRun } from '@/types/settlement';
import type { CreateFinanceConfig, FinanceConfig, FinanceConfigSummary } from '@/types/finance';

export function useFinanceList<T>(path: string, params: Record<string, unknown> = {}, enabled = true, poll = false) {
  const companyId = useAuthStore((s) => s.companyContext?.companyId ?? '');
  return useQuery({ queryKey: ['company', companyId, 'finance-lifecycle', path, params], enabled: Boolean(companyId) && enabled,
    queryFn: async ({ signal }) => (await apiClient.get<T>(path, { params, signal })).data,
    refetchInterval: poll ? (query) => (query.state.data as { items?: { status: string }[] } | undefined)?.items?.some((row) => row.status === 'running') ? 2000 : false : false });
}
export function useFinanceWrite<T, I>(method: 'post' | 'put', path: string) {
  const companyId = useAuthStore((s) => s.companyContext?.companyId ?? '');
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (input: I) => (await apiClient[method]<T>(path, input)).data,
    onSettled: () => qc.invalidateQueries({ queryKey: ['company', companyId] }) });
}
export const useOrderPayments = (params: Record<string, unknown>) => useFinanceList<OrderPaymentPage>('/finance/payments', params);
export const useOrderPayment = (id: string) => useFinanceList<OrderPaymentDetail>(`/finance/payments/${id}`, {}, Boolean(id));
export const useResolvePayment = (id: string) => useFinanceWrite<OrderPayment, { version: number; reason: string }>('post', `/finance/payments/${id}/resolve`);
export const useApprovePayment = (id: string) => useFinanceWrite<OrderPayment, { version: number }>('post', `/finance/payments/${id}/ceo-approve`);
export function useSettlementRuns(params: Record<string, unknown>, enabled = true) {
  return useFinanceList<PageResult<SettlementRun>>('/finance/settlement-runs', params, enabled, true);
}
export const useStartSettlement = () => useFinanceWrite<SettlementRun, { shopId: string }>('post', '/finance/settlement-runs');
export const useBankMatching = (params: Record<string, unknown>, enabled = true) => useFinanceList<PageResult<SettlementLedgerLine>>('/finance/bank-matching', params, enabled);
export const useBankMatch = (id: string) => useFinanceWrite<SettlementLedgerLine, { bankRef: string }>('post', `/finance/ledger/${id}/bank-match`);
export const useFinanceConfigs = (params: Record<string, unknown>) => useFinanceList<PageResult<FinanceConfigSummary>>('/finance/configs', params);
export const useFinanceConfig = (id: string) => useFinanceList<FinanceConfig>(`/finance/configs/${id}`, {}, Boolean(id));
export const useCreateConfig = () => useFinanceWrite<FinanceConfig, CreateFinanceConfig>('post', '/finance/configs');
