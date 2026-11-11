/**
 * Phân hệ tuỳ chọn (UC-PI-02, commerio-backend#10) và nhật ký thao tác (UC-PI-07, #11)
 * của công ty đang làm việc. BE lấy công ty từ token.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, getProblem } from './client';
import { authApi } from './auth.api';
import { useAuthStore } from '@/stores/authStore';
import type { PageResult } from './types';
import type {
  CompanyAuditLog,
  CompanyAuditLogDetail,
  CompanyAuditParams,
  CompanyModule,
  DeadJob,
  DeadJobParams,
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
  deadJobs: (companyId: string) => ['company', companyId, 'dead-jobs'] as const,
  deadJobList: (companyId: string, params: DeadJobParams) =>
    [...companySettingsKeys.deadJobs(companyId), params] as const,
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
      const { data } = await apiClient.get<CompanyModule[]>('/platform/modules');
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
      const { data } = await apiClient.put<SetModuleResult>(`/platform/modules/${code}`, body);
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
    onSettled: async () => {
      qc.invalidateQueries({ queryKey: companySettingsKeys.modules(companyId) });
      qc.invalidateQueries({ queryKey: companySettingsKeys.audit(companyId) });
      await reloadCompanyContext(companyId);
    },
  });
}

/**
 * Quyền của phân hệ chưa bật không có hiệu lực (Documents/21 mục 8): BE lọc quyền theo phân hệ khi dựng ngữ cảnh.
 * Bật, tắt xong thì chọn lại công ty để lấy quyền mới, nút theo quyền đổi ngay (FE#152). Lỗi thì giữ ngữ cảnh cũ.
 */
async function reloadCompanyContext(companyId: string | undefined) {
  if (!companyId) return;
  try {
    const res = await authApi.selectCompany(companyId);
    const store = useAuthStore.getState();
    if (store.companyContext?.companyId === companyId) store.setCompany(res.accessToken, res.context);
  } catch {
    // Lần gọi API kế tiếp sẽ tự làm mới ngữ cảnh khi token hết hạn
  }
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

// ---------- Việc nền lỗi (§14.5) ----------

/** Việc nền đã thử hết lượt mà vẫn lỗi, mới nhất trước, chỉ của công ty đang chọn */
export function useDeadJobs(params: DeadJobParams) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: companySettingsKeys.deadJobList(companyId, params),
    enabled: Boolean(companyId),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data } = await apiClient.get<PageResult<DeadJob>>('/platform/jobs/dead', { params });
      return data;
    },
  });
}

/** Đưa việc về hàng gốc với lượt thử mới (204). 404 khi việc không còn trong hàng lỗi */
export function useRetryDeadJob() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.post(`/platform/jobs/dead/${id}/retry`);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: companySettingsKeys.deadJobs(companyId) });
      qc.invalidateQueries({ queryKey: companySettingsKeys.audit(companyId) });
    },
  });
}
