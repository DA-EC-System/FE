/**
 * API đối soát tiền sàn: bảng kê, dòng đối soát, chạy đối soát (UC-PF-10).
 * Hợp đồng theo Documents/21 mục 12.6, 12.8, BE ở commerio-backend#30 (PR #69).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { useAuthStore } from '@/stores/authStore';
import type { PageResult } from './types';
import type { MatchStatus, SettlementLine, SettlementStatement } from '@/types/settlement';

/** Không có ô tìm (§12.6); `from`/`to` lọc theo ngày bảng kê giờ VN */
export interface StatementListParams {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  shopId?: string;
  paymentStatus?: string;
}

export interface LineListParams {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  statementId?: string;
  matchStatus?: MatchStatus;
  shopId?: string;
  orderId?: string;
}

export const settlementKeys = {
  all: (companyId: string) => ['company', companyId, 'settlement'] as const,
  statements: (companyId: string, params: object) => [...settlementKeys.all(companyId), 'statements', params] as const,
  statement: (companyId: string, id: string) => [...settlementKeys.all(companyId), 'statement', id] as const,
  lines: (companyId: string, params: object) => [...settlementKeys.all(companyId), 'lines', params] as const,
};

function useCompanyId(): string {
  return useAuthStore((s) => s.companyContext?.companyId ?? '');
}

export function useStatements(params: StatementListParams, enabled = true) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: settlementKeys.statements(companyId, params),
    enabled: Boolean(companyId) && enabled,
    retry: false,
    queryFn: async () => {
      const { data } = await apiClient.get<PageResult<SettlementStatement>>('/finance/settlements', { params });
      return data;
    },
  });
}

export function useStatement(id: string) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: settlementKeys.statement(companyId, id),
    enabled: Boolean(companyId && id),
    retry: false,
    queryFn: async () => {
      const { data } = await apiClient.get<SettlementStatement>(`/finance/settlements/${id}`);
      return data;
    },
  });
}

export function useSettlementLines(params: LineListParams, enabled = true) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: settlementKeys.lines(companyId, params),
    enabled: Boolean(companyId) && enabled,
    retry: false,
    queryFn: async () => {
      const { data } = await apiClient.get<PageResult<SettlementLine>>('/finance/settlement-lines', { params });
      return data;
    },
  });
}

/** Làm mới đối soát và những gì dòng đối soát chạm tới: phiếu thu, báo cáo */
export function useInvalidateSettlement() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return () => qc.invalidateQueries({ queryKey: ['company', companyId] });
}

/** Chạy nền: 202 là đã nhận, kết quả có sau (§12.6). BE chưa có route này (#30 phần 2) */
export function useRunSettlement() {
  return useMutation({
    mutationFn: async (input: { shopId?: string }) => {
      await apiClient.post('/finance/settlements/run', input);
    },
  });
}
