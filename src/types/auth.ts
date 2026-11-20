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
  /** Còn dùng mật khẩu do hệ thống sinh trong thư mời → phải đổi trước khi làm việc (UC-PI-03 bước 7) */
  mustChangePassword: boolean;
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
  /** Được tự làm bước cần người thứ hai (CEO, hoặc công ty một thành viên); BE `canSelfApprove` */
  canSelfApprove?: boolean;
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

/** Google Identity Services trả `credential` (ID token); BE kiểm và liên kết theo email (BE#7). */
export interface GoogleLoginRequest {
  credential: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/**
 * UC-PI-01 bước 1 (Documents/21 mục 2.1, commerio-backend#459): người đăng ký thành CEO. Phân hệ lõi (kể cả Kênh bán)
 * và Nhập hàng bật sẵn; phân hệ khác bật sau ở Cài đặt. BE gửi mã 6 số qua email.
 */
export interface RegisterCompanyRequest {
  company: { name: string; taxCode: string };
  ceo: { fullName: string; email: string; password: string };
}

/** 202 của `register` và `register/resend`: như nhau dù email đã có tài khoản hay chưa */
export interface RegistrationStatus {
  registrationId: string;
  /** Mã hết hạn lúc này (ISO 8601), 5 phút sau lần gửi */
  codeExpiresAt: string;
  /** Lần đăng ký hết hạn lúc này (ISO 8601), 30 phút sau khi gửi form */
  registrationExpiresAt: string;
  /** Số giây chờ trước khi được xin mã lại */
  resendAfterSeconds: number;
}

export interface VerifyRegistrationRequest {
  registrationId: string;
  code: string;
}

/** 201 của `register/verify`: phiên đã gắn công ty mới, như `/login` rồi `select-company` */
export interface VerifyRegistrationResponse {
  accessToken: string;
  account: Account;
  memberships: Membership[];
  context: CompanyContext;
}

/** Token mới gắn với công ty đã chọn (UC-PI-03) */
export interface SelectCompanyResponse {
  accessToken: string;
  context: CompanyContext;
}

/** `POST /identity/refresh` (docs/21 A1, A2): BE đọc refresh token trong cookie HttpOnly. */
export interface RefreshResponse {
  accessToken: string;
}
