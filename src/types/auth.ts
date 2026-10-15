/**
 * Auth types — khớp với staff.accounts, staff.memberships, access.* trong docs/19.
 *
 * - Account: một người dùng, không gắn công ty. `isPlatformAdmin` là cờ D3;
 *   quản trị nền tảng không thuộc công ty nào nên không có membership.
 * - Membership: tư cách nhân viên của account trong một công ty (D5: khoá theo công ty).
 * - CompanyContext: vai trò, quyền chi tiết và phân hệ đang bật của công ty đang chọn.
 *   Vai trò tuỳ biến (Nhân viên kho, Kế toán…) nên FE chỉ kiểm theo mã quyền, không theo tên vai trò.
 */

import type { CompanyStatus } from './company';
import type { ModuleKey } from '@/utils/modules';

export interface Account {
  id: string;
  email: string;
  fullName: string;
  isPlatformAdmin: boolean;
}

export type MembershipStatus = 'active' | 'locked';

export interface Membership {
  companyId: string;
  companyName: string;
  companyStatus: CompanyStatus;
  /** Tài khoản bị khoá trong công ty này (D5) */
  status: MembershipStatus;
  /** Tên vai trò để hiển thị */
  roles: string[];
}

export interface CompanyContext {
  companyId: string;
  companyName: string;
  roles: string[];
  /** Mã quyền dạng "<module>.<resource>.<action>", vd "channel.shop.connect" */
  permissions: string[];
  enabledModules: ModuleKey[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  account: Account;
  memberships: Membership[];
}

export interface MeResponse {
  account: Account;
  memberships: Membership[];
}

/** Token mới gắn với công ty đã chọn (UC-PI-03) */
export interface SelectCompanyResponse {
  accessToken: string;
  context: CompanyContext;
}
