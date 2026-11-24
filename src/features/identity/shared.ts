import { z } from 'zod';
import { getProblem } from '@/api/client';
import { missingPermissions } from '@/utils/permissions';
import type { CompanyContext, MembershipStatus } from '@/types/auth';
import type { Invitation, Role, StaffMember } from '@/types/identity';

/** US-CT-05: link mời chỉ mang vai trò; email, họ tên do người được mời tự nhập */
export const inviteSchema = z.object({
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

/** Vai có sẵn Sale, Nhân viên kho: ai có `identity.account.manage` cũng gán, gỡ được (docs/21 I5, BE#351) */
export const FREELY_ASSIGNABLE_ROLE_IDS: readonly string[] = [
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
];
/** Vai có sẵn Nhân viên kho (BE `core/access/domain/catalog.ts`): wizard mời người đếm tồn đầu kỳ (FE#468) */
export const WAREHOUSE_ROLE_ID = FREELY_ASSIGNABLE_ROLE_IDS[1];
export const isFreelyAssignable = (role: Pick<Role, 'id' | 'builtIn'>) =>
  role.builtIn && FREELY_ASSIGNABLE_ROLE_IDS.includes(role.id);

/**
 * Vai Admin có sẵn: Admin và CEO ngang quyền, nhưng chỉ CEO mời (tạo link, duyệt), gán, gỡ vai Admin và đổi vai, khoá
 * người đang có vai Admin (docs/21 I5, BE 403 `ceo_only`, chốt 19/11/2026).
 */
export const ADMIN_ROLE_ID = '00000000-0000-4000-8000-000000000002';
export const isCeoContext = (context: CompanyContext | null) => Boolean(context?.roles.includes(CEO_ROLE_NAME));
const hasAdminRole = (roles: readonly { id: string }[]) => roles.some((r) => r.id === ADMIN_ROLE_ID);

/**
 * Vì sao người đang đăng nhập không gán hay gỡ được vai trò này; null nếu được. FE chỉ khoá, BE vẫn kiểm lại.
 * `permissionLabels`: mã quyền → tên quyền (danh mục `GET /identity/permissions`), thiếu thì hiện mã.
 */
export function roleLockReason(
  role: Role,
  context: CompanyContext | null,
  permissionLabels?: ReadonlyMap<string, string>,
): string | null {
  if (role.builtIn && role.name === CEO_ROLE_NAME) return 'Vai trò CEO không gán hay gỡ được';
  if (role.builtIn && role.id === ADMIN_ROLE_ID && !isCeoContext(context)) {
    return 'Chỉ CEO được mời, gán hoặc gỡ vai Admin';
  }
  if (isFreelyAssignable(role)) return null;
  const missing = missingPermissions(context, role.permissions);
  if (!missing.length) return null;
  const names = missing.map((code) => permissionLabels?.get(code) ?? code).join(', ');
  return `Vai trò này có quyền bạn chưa có (${names}). Nhờ CEO tạo link hoặc gán vai này.`;
}

/** Bản hiện tại BE gửi kèm lỗi 409 version_conflict / invalid_transition / already_member */
export function conflictCurrent<T>(error: unknown, key: 'current' | 'member' = 'current'): T | null {
  const problem = getProblem(error) as (Record<string, unknown> & { code?: string }) | undefined;
  return (problem?.[key] as T | undefined) ?? null;
}

/** Quyền cấp nền tảng chỉ CEO, Admin có sẵn; không cấp cho vai trò tuỳ biến (docs/21 M3) */
export const isAssignablePermission = (code: string) => !code.startsWith('platform.');

/** CEO và chính mình: không đổi vai trò, không khoá (UC-PI-05); người có vai Admin: chỉ CEO (docs/21 I5) */
export function protectedReason(member: StaffMember, accountId: string | undefined, callerIsCeo = false): string | null {
  if (member.isCeo) return 'Không thao tác được trên tài khoản CEO';
  if (member.accountId === accountId) return 'Không thao tác được trên tài khoản của chính bạn';
  if (!callerIsCeo && hasAdminRole(member.roles)) return 'Chỉ CEO đổi vai trò, khoá hay mở khoá người có vai Admin';
  return null;
}

/** Vì sao không duyệt được yêu cầu này; null nếu được. Yêu cầu có vai Admin: chỉ CEO duyệt (docs/21 I5) */
export function approveLockReason(inv: Pick<Invitation, 'outdated' | 'roles'>, callerIsCeo: boolean): string | null {
  if (inv.outdated) return 'Có vai trò của link đã bị xoá: từ chối rồi tạo link mới';
  if (!callerIsCeo && hasAdminRole(inv.roles)) return 'Yêu cầu có vai Admin: chỉ CEO duyệt được';
  return null;
}

export const STAFF_STATUS_LABELS: Record<MembershipStatus, string> = {
  active: 'Đang hoạt động',
  locked: 'Đã khoá',
};

/** Lỗi 409 `invalid_transition` (BE#353): trả bản hiện tại để báo theo trạng thái; lỗi khác trả null */
export function invalidTransitionCurrent<T>(error: unknown): T | null {
  return getProblem(error)?.code === 'invalid_transition' ? conflictCurrent<T>(error) : null;
}

type InvitationLike = Pick<Invitation, 'status' | 'fullName' | 'email'>;
const invitee = (inv: InvitationLike) => inv.fullName ?? inv.email ?? 'người được mời';

/**
 * Câu báo khi lời mời không còn ở trạng thái cho phép (BE#353). `from`: tab Yêu cầu tham gia (duyệt, từ chối)
 * hay tab Link mời chưa dùng (huỷ).
 */
export function invitationTransitionMessage(current: InvitationLike, from: 'pending' | 'links'): string {
  switch (current.status) {
    case 'open':
    case 'claimed':
      return from === 'pending'
        ? 'Người được mời chưa gửi yêu cầu, chưa duyệt được.'
        : 'Link chưa có người gửi yêu cầu.';
    case 'pending':
      return from === 'links'
        ? 'Người được mời đã gửi yêu cầu. Duyệt hoặc từ chối ở tab Yêu cầu tham gia.'
        : 'Yêu cầu đang chờ duyệt.';
    case 'approved':
      return `Yêu cầu của ${invitee(current)} đã được duyệt.`;
    case 'rejected':
      return `Yêu cầu của ${invitee(current)} đã bị từ chối.`;
    case 'revoked':
      return 'Link này đã bị huỷ.';
  }
}

/** Câu báo khi khoá người đang khoá, mở khoá người đang hoạt động (BE#353) */
export function staffTransitionMessage(current: Pick<StaffMember, 'status' | 'fullName'>): string {
  return current.status === 'locked'
    ? `${current.fullName} đang bị tạm khoá rồi.`
    : `${current.fullName} đang hoạt động rồi.`;
}
