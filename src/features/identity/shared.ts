import { z } from 'zod';
import { emailSchema } from '@/features/auth/schemas';
import { getProblem } from '@/api/client';
import { missingPermissions } from '@/utils/permissions';
import type { CompanyContext, MembershipStatus } from '@/types/auth';
import type { Role, StaffMember } from '@/types/identity';

export const inviteSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(1, 'Nhập họ tên').max(100, 'Họ tên tối đa 100 ký tự'),
  roleIds: z.array(z.string()).min(1, 'Chọn ít nhất một vai trò'),
});
export type InviteForm = z.infer<typeof inviteSchema>;

export const roleSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên vai trò').max(60, 'Tên vai trò tối đa 60 ký tự'),
  permissions: z.array(z.string()).min(1, 'Chọn ít nhất một quyền'),
});
export type RoleForm = z.infer<typeof roleSchema>;

/** Vai trò CEO chỉ có một người giữ, không gán qua màn nhân viên */
export const CEO_ROLE_NAME = 'CEO';

/**
 * Vì sao người đang đăng nhập không gán, gỡ, sửa hay xoá được vai trò này;
 * null nếu được. FE chỉ ẩn/khoá, BE vẫn kiểm lại.
 */
export function roleLockReason(role: Role, context: CompanyContext | null): string | null {
  if (role.builtIn && role.name === CEO_ROLE_NAME) return 'Vai trò CEO không gán hay gỡ được';
  if (missingPermissions(context, role.permissions).length) {
    return 'Vai trò có quyền bạn không có';
  }
  return null;
}

/** Bản hiện tại BE gửi kèm lỗi 409 version_conflict / already_member */
export function conflictCurrent<T>(error: unknown, key: 'current' | 'member' = 'current'): T | null {
  const problem = getProblem(error) as (Record<string, unknown> & { code?: string }) | undefined;
  return (problem?.[key] as T | undefined) ?? null;
}

/** Quyền cấp nền tảng chỉ CEO, Admin có sẵn; không cấp cho vai trò tuỳ biến (docs/21 M3) */
export const isAssignablePermission = (code: string) => !code.startsWith('platform.');

/** CEO và chính mình: không đổi vai trò, không khoá (UC-PI-05) */
export function protectedReason(member: StaffMember, accountId: string | undefined): string | null {
  if (member.isCeo) return 'Không thao tác được trên tài khoản CEO';
  if (member.accountId === accountId) return 'Không thao tác được trên tài khoản của chính bạn';
  return null;
}

export const STAFF_STATUS_LABELS: Record<MembershipStatus, string> = {
  active: 'Hoạt động',
  locked: 'Tạm khoá',
};
