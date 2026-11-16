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

/** Link mời vừa tạo (US-CT-05): `link` chỉ trả lần này, BE không lưu token */
export interface CreatedInvitation {
  id: string;
  link: string;
  expiresAt: string;
}

/** `revoked`: Admin huỷ link chưa nộp (US-CT-05 AC 5) */
export type InvitationStatus = 'open' | 'claimed' | 'pending' | 'approved' | 'rejected' | 'revoked';

/** Yêu cầu tham gia qua link (US-CT-07) */
export interface Invitation {
  id: string;
  status: InvitationStatus;
  /** Link đã quá hạn; yêu cầu `pending` vẫn duyệt được */
  expired: boolean;
  email: string | null;
  fullName: string | null;
  roles: RoleRef[];
  /** Có vai trò đã bị xoá sau khi tạo link: duyệt sẽ bị 409 `invitation_outdated` */
  outdated: boolean;
  /** Email đã có tài khoản Commerio lúc nộp (không nói ở công ty nào) */
  existingAccount: boolean;
  createdBy: { id: string; fullName: string };
  createdAt: string;
  expiresAt: string;
  submittedAt: string | null;
  decidedAt: string | null;
  version: number;
}

export interface InvitationListParams {
  /** Một hoặc nhiều trạng thái; FE gửi dạng `open,claimed` (Documents/21 §3.1) */
  status?: InvitationStatus | InvitationStatus[];
  page?: number;
  pageSize?: number;
}

// ---------- Tham gia qua link (US-CT-06): API công khai, token nằm trong body ----------
export interface JoinCheck {
  companyName: string;
  expiresAt: string;
}

export interface JoinVerifyResult {
  /** Sống 30 phút, gửi lại ở `/join/complete` */
  registrationToken: string;
  /** Email mới thì đặt mật khẩu, email đã có tài khoản thì nhập mật khẩu hiện có */
  next: 'set_password' | 'sign_in';
}
