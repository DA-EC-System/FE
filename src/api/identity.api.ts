/**
 * API nhân viên và vai trò của công ty đang làm việc (module identity, UC-PI-05, UC-PI-06).
 * Hợp đồng theo commerio-backend#8, #9; BE lấy công ty từ token (RLS theo company_id).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { useAuthStore } from '@/stores/authStore';
import type { PageResult } from './types';
import type {
  InviteStaffInput,
  InviteStaffResult,
  PermissionDef,
  Role,
  RoleInput,
  StaffListParams,
  StaffMember,
} from '@/types/identity';

export const identityKeys = {
  all: (companyId: string) => ['company', companyId, 'identity'] as const,
  permissions: (companyId: string) => [...identityKeys.all(companyId), 'permissions'] as const,
  roles: (companyId: string) => [...identityKeys.all(companyId), 'roles'] as const,
  staff: (companyId: string) => [...identityKeys.all(companyId), 'staff'] as const,
  staffList: (companyId: string, params: StaffListParams) =>
    [...identityKeys.staff(companyId), params] as const,
};

function useCompanyId(): string {
  return useAuthStore((s) => s.companyContext?.companyId ?? '');
}

/** Sửa vai trò đổi số người dùng, sửa nhân viên đổi danh sách vai trò → làm mới cả hai. */
function useInvalidateIdentity() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return () => qc.invalidateQueries({ queryKey: identityKeys.all(companyId) });
}

// ---------- Danh mục quyền ----------

/** Danh mục quyền của các phân hệ công ty đang bật */
export function usePermissionCatalog() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: identityKeys.permissions(companyId),
    enabled: Boolean(companyId),
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await apiClient.get<PermissionDef[]>('/identity/permissions');
      return data;
    },
  });
}

// ---------- Vai trò (UC-PI-06) ----------

export function useRoles() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: identityKeys.roles(companyId),
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data } = await apiClient.get<Role[]>('/identity/roles');
      return data;
    },
  });
}

export function useCreateRole() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: async (input: RoleInput) => {
      const { data } = await apiClient.post<Role>('/identity/roles', input);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateRole() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: async ({ id, ...input }: RoleInput & { id: string; version: number }) => {
      const { data } = await apiClient.put<Role>(`/identity/roles/${id}`, input);
      return data;
    },
    // Thành công hay bị từ chối vì người khác vừa sửa đều cần tải lại
    onSettled: invalidate,
  });
}

export function useDeleteRole() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      await apiClient.delete(`/identity/roles/${id}`, { params: { version } });
    },
    onSettled: invalidate,
  });
}

// ---------- Nhân viên (UC-PI-05) ----------

export function useStaff(params: StaffListParams) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: identityKeys.staffList(companyId, params),
    enabled: Boolean(companyId),
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data } = await apiClient.get<PageResult<StaffMember>>('/identity/staff', { params });
      return data;
    },
  });
}

export function useInviteStaff() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: async (input: InviteStaffInput) => {
      const { data } = await apiClient.post<InviteStaffResult>('/identity/staff', input);
      return data;
    },
    onSuccess: invalidate,
  });
}

/** Thay toàn bộ vai trò của một nhân viên trong công ty */
export function useSetStaffRoles() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: async ({
      accountId,
      roleIds,
      version,
    }: {
      accountId: string;
      roleIds: string[];
      version: number;
    }) => {
      const { data } = await apiClient.put<StaffMember>(`/identity/staff/${accountId}/roles`, {
        roleIds,
        version,
      });
      return data;
    },
    onSettled: invalidate,
  });
}

export function useSetStaffLocked() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: async ({
      accountId,
      locked,
      version,
    }: {
      accountId: string;
      locked: boolean;
      version: number;
    }) => {
      const { data } = await apiClient.post<StaffMember>(
        `/identity/staff/${accountId}/${locked ? 'lock' : 'unlock'}`,
        { version },
      );
      return data;
    },
    onSettled: invalidate,
  });
}
