/**
 * API của quản trị nền tảng (UC-PI-08). Chỉ đọc danh sách công ty, khoá/mở khoá
 * và nhật ký cấp nền tảng. Không có tạo, sửa, xoá công ty: công ty tự đăng ký (UC-PI-01).
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import type { PageResult } from './types';
import type { Company, CompanyStatus, LockCompanyInput } from '@/types/company';
import type { PlatformAuditAction, PlatformAuditLog } from '@/types/audit';
import type { OptionalModuleKey } from '@/utils/modules';

export interface PlatformOverview {
  totalCompanies: number;
  activeCompanies: number;
  lockedCompanies: number;
  registeredLast30Days: number;
  optionalModuleUsage: { module: OptionalModuleKey; companies: number }[];
  recentActivities: PlatformAuditLog[];
}

export interface CompanyListParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: CompanyStatus;
}

export interface AuditLogListParams {
  page: number;
  pageSize: number;
  action?: PlatformAuditAction;
  search?: string;
  from?: string;
  to?: string;
}

export const platformKeys = {
  all: ['platform'] as const,
  overview: () => [...platformKeys.all, 'overview'] as const,
  companies: (params: CompanyListParams) =>
    [...platformKeys.all, 'companies', params] as const,
  auditLogs: (params: AuditLogListParams) =>
    [...platformKeys.all, 'audit-logs', params] as const,
};

export function usePlatformOverview() {
  return useQuery({
    queryKey: platformKeys.overview(),
    queryFn: async () => {
      const { data } = await apiClient.get<PlatformOverview>('/platform/overview');
      return data;
    },
  });
}

export function usePlatformCompanies(params: CompanyListParams) {
  return useQuery({
    queryKey: platformKeys.companies(params),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data } = await apiClient.get<PageResult<Company>>('/platform/companies', {
        params,
      });
      return data;
    },
  });
}

export function usePlatformAuditLogs(params: AuditLogListParams) {
  return useQuery({
    queryKey: platformKeys.auditLogs(params),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data } = await apiClient.get<PageResult<PlatformAuditLog>>(
        '/platform/audit-logs',
        { params },
      );
      return data;
    },
  });
}

/**
 * Khoá/mở khoá không cập nhật lạc quan: công ty có thể vừa đổi trạng thái ở phiên khác
 * (ngoại lệ bước 4 của UC-PI-08), nên chờ BE trả kết quả rồi tải lại.
 * Thành công hay xung đột (409) đều làm mới danh sách để hiện trạng thái thật.
 */
export function useLockCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: LockCompanyInput & { id: string }) => {
      const { data } = await apiClient.post<Company>(`/platform/companies/${id}/lock`, input);
      return data;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: platformKeys.all }),
  });
}

export function useUnlockCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post<Company>(`/platform/companies/${id}/unlock`);
      return data;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: platformKeys.all }),
  });
}
