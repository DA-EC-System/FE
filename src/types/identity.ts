/**
 * Nhân viên và vai trò của công ty đang chọn (UC-PI-05, UC-PI-06).
 * Khớp staff.memberships, access.roles, access.permissions, access.member_roles trong docs/19.
 * Mọi API lấy công ty từ token; không truyền companyId.
 */

import type { MembershipStatus } from './auth';
import type { ModuleKey } from '@/utils/modules';

/** Một dòng trong danh mục quyền (access.permissions) */
export interface PermissionDef {
  /** "<module>.<resource>.<action>" */
  code: string;
  module: ModuleKey;
  label: string;
}

export interface Role {
  id: string;
  name: string;
  /** CEO, Admin, Sale: có sẵn, không sửa hay xoá được */
  builtIn: boolean;
  permissions: string[];
  /** Số tài khoản trong công ty đang mang vai trò này */
  memberCount: number;
  /** Tăng mỗi lần sửa; gửi kèm khi sửa để phát hiện người khác vừa sửa */
  version: number;
  updatedAt: string;
}

export interface RoleInput {
  name: string;
  permissions: string[];
}

export interface RoleRef {
  id: string;
  name: string;
}

export interface StaffMember {
  accountId: string;
  email: string;
  fullName: string;
  roles: RoleRef[];
  /** Khoá theo công ty (D5) */
  status: MembershipStatus;
  /** Tài khoản CEO: không đổi vai trò, không khoá được */
  isCeo: boolean;
  /** Còn mật khẩu trong thư mời, chưa đăng nhập lần đầu */
  pendingFirstLogin: boolean;
  joinedAt: string;
  version: number;
}

export interface StaffListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: MembershipStatus | '';
  roleId?: string;
}

export interface InviteStaffInput {
  email: string;
  fullName: string;
  roleIds: string[];
}

/**
 * - invited: tạo tài khoản mới, thư mời kèm mật khẩu
 * - added: email đã có tài khoản ở nơi khác, chỉ thêm vào công ty (thư báo không kèm mật khẩu).
 *   BE không cho biết email thuộc công ty nào khác.
 */
export interface InviteStaffResult {
  outcome: 'invited' | 'added';
  member: StaffMember;
}
