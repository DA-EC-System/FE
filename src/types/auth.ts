/**
 * Auth types — khớp với staff.accounts + staff.memberships trong DBML.
 * User có thể có nhiều vai trò, một trong số đó có thể là isPlatformAdmin.
 */

export type Role = 'admin' | 'sale' | 'warehouse' | 'accountant' | 'ceo';

export interface User {
  id: string;
  email: string;
  fullName: string;
  roles: Role[];
  /** Quyền chi tiết dạng "resource:action" (vd "shop:create", "company:delete") */
  permissions: string[];
  /** true nếu là quản trị nền tảng (tenant 0) — thấy mọi công ty */
  isPlatformAdmin: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}

export interface AuthState {
  accessToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
}
