/**
 * Phân hệ tuỳ chọn (UC-PI-02, commerio-backend#10) và nhật ký thao tác (UC-PI-07, #11)
 * của công ty đang làm việc. BE lấy công ty từ token.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, getProblem } from './client';
import { useAuthStore } from '@/stores/authStore';
import type { PageResult } from './types';
import type {
  CompanyAuditLog,
  CompanyAuditLogDetail,
  CompanyAuditParams,
  CompanyModule,
  SetModuleInput,
  SetModuleResult,
} from '@/types/companySettings';

export const companySettingsKeys = {
  modules: (companyId: string) => ['company', companyId, 'modules'] as const,
  audit: (companyId: string) => ['company', companyId, 'audit'] as const,
  auditList: (companyId: string, params: CompanyAuditParams) =>
    [...companySettingsKeys.audit(companyId), 'list', params] as const,
  auditDetail: (companyId: string, id: string) =>
    [...companySettingsKeys.audit(companyId), 'detail', id] as const,
};

function useCompanyId(): string {
  return useAuthStore((s) => s.companyContext?.companyId ?? '');
}

// ---------- Phân hệ (UC-PI-02) ----------

export function useCompanyModules() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: companySettingsKeys.modules(companyId),
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data } = await apiClient.get<CompanyModule[]>('/company/modules');
      return data;
    },
  });
}

export function useSetModule() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  const setEnabledModules = useAuthStore((s) => s.setEnabledModules);
  return useMutation({
    mutationFn: async ({ code, ...body }: SetModuleInput) => {
      const { data } = await apiClient.put<SetModuleResult>(`/company/modules/${code}`, body);
      return data;
    },
    // Menu và RequireModule đọc enabledModules trong store: cập nhật ngay, không cần chọn lại công ty
    onSuccess: (res) => setEnabledModules(res.enabledModules),
    // 409: phiên khác vừa đổi trạng thái. BE kèm trạng thái hiện tại, đồng bộ menu theo đó
    onError: (err, { code }) => {
      const current = (getProblem(err) as { current?: CompanyModule } | undefined)?.current;
      const modules = useAuthStore.getState().companyContext?.enabledModules;
      if (!current || !modules) return;
      const others = modules.filter((m) => m !== code);
      setEnabledModules(current.enabled ? [...others, code] : others);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: companySettingsKeys.modules(companyId) });
      qc.invalidateQueries({ queryKey: companySettingsKeys.audit(companyId) });
    },
  });
}

// ---------- Nhật ký thao tác (UC-PI-07) ----------

export function useCompanyAuditLogs(params: CompanyAuditParams) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: companySettingsKeys.auditList(companyId, params),
    enabled: Boolean(companyId),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data } = await apiClient.get<PageResult<CompanyAuditLog>>('/audit/logs', {
        params,
      });
      return data;
    },
  });
}

/** Giá trị trước và sau của một dòng; nhật ký không đổi nên giữ cache lâu */
export function useCompanyAuditLog(id: string | null) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: companySettingsKeys.auditDetail(companyId, id ?? ''),
    enabled: Boolean(companyId && id),
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await apiClient.get<CompanyAuditLogDetail>(`/audit/logs/${id}`);
      return data;
    },
  });
}
