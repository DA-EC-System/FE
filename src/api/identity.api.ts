/**
 * API nhân viên và vai trò của công ty đang làm việc (module identity, UC-PI-05, UC-PI-06).
 * Hợp đồng theo commerio-backend#8, #9; BE lấy công ty từ token (RLS theo company_id).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { compactParams } from './compactParams';
import { apiClient } from './client';
import { useAuthStore } from '@/stores/authStore';
import type { PageResult } from './types';
import type {
  CreatedInvitation,
  Invitation,
  InvitationListParams,
  JoinCheck,
  JoinVerifyResult,
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
  invitations: (companyId: string) => [...identityKeys.all(companyId), 'invitations'] as const,
  invitationList: (companyId: string, params: InvitationListParams) =>
    [...identityKeys.invitations(companyId), params] as const,
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

export function useStaff(params: StaffListParams, enabled = true) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: identityKeys.staffList(companyId, params),
    enabled: Boolean(companyId) && enabled,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      // BE trả 422 với chuỗi rỗng (status, roleId là enum/uuid): chỉ gửi bộ lọc có giá trị
      const { data } = await apiClient.get<PageResult<StaffMember>>('/identity/staff', { params: compactParams(params) });
      return data;
    },
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

// ---------- Mời bằng link (US-CT-05, US-CT-07; Documents/21 §3.1) ----------

/** Tạo link mời kèm vai trò sẽ gán; link chỉ trả lần này */
export function useCreateInvitation() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: async (roleIds: string[]) => {
      const { data } = await apiClient.post<CreatedInvitation>('/identity/invitations', { roleIds });
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useInvitations(params: InvitationListParams, enabled = true) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: identityKeys.invitationList(companyId, params),
    enabled: Boolean(companyId) && enabled,
    // Yêu cầu do người ngoài nộp qua link: mở trang là nạp lại, không dùng bản cũ trong cache
    refetchOnMount: 'always',
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { status, ...rest } = params;
      const { data } = await apiClient.get<PageResult<Invitation>>('/identity/invitations', {
        // Nhiều trạng thái gửi một tham số, cách nhau bằng dấu phẩy (Documents/21 §3.1)
        params: compactParams({ ...rest, status: Array.isArray(status) ? status.join(',') : status }),
      });
      return data;
    },
  });
}

/** Duyệt hoặc từ chối yêu cầu `pending`; lỗi gì cũng nạp lại danh sách để thấy trạng thái mới */
export function useDecideInvitation() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: async ({
      id,
      decision,
      version,
    }: {
      id: string;
      decision: 'approve' | 'reject';
      version: number;
    }) => {
      const { data } = await apiClient.post<{ invitation: Invitation; member?: StaffMember }>(
        `/identity/invitations/${id}/${decision}`,
        { version },
      );
      return data;
    },
    onSettled: invalidate,
  });
}

/** Huỷ link chưa nộp (`open`, `claimed`); lỗi gì cũng nạp lại danh sách để thấy trạng thái mới (US-CT-05 AC 5, 6) */
export function useRevokeInvitation() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      const { data } = await apiClient.post<{ invitation: Invitation }>(`/identity/invitations/${id}/revoke`, {
        version,
      });
      return data;
    },
    onSettled: invalidate,
  });
}

// ---------- Tham gia qua link (US-CT-06): công khai, không cần đăng nhập ----------

export const joinApi = {
  check: async (token: string) =>
    (await apiClient.post<JoinCheck>('/identity/join/check', { token })).data,
  requestOtp: async (body: { token: string; email: string; fullName: string }) => {
    await apiClient.post('/identity/join/otp', body);
  },
  verify: async (body: { token: string; email: string; code: string }) =>
    (await apiClient.post<JoinVerifyResult>('/identity/join/verify', body)).data,
  complete: async (body: { registrationToken: string; password: string; confirmPassword?: string }) =>
    (await apiClient.post<{ status: 'pending' }>('/identity/join/complete', body)).data,
};
