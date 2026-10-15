import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Account, CompanyContext, Membership } from '@/types/auth';

interface AuthStore {
  accessToken: string | null;
  account: Account | null;
  memberships: Membership[];
  /** Công ty đang làm việc; null khi chưa chọn hoặc là quản trị nền tảng */
  companyContext: CompanyContext | null;
  setSession: (token: string, account: Account, memberships: Membership[]) => void;
  setMemberships: (memberships: Membership[]) => void;
  setAccount: (account: Account) => void;
  setCompany: (token: string, context: CompanyContext) => void;
  leaveCompany: () => void;
  clear: () => void;
}

/**
 * Auth state — lưu vào localStorage để giữ phiên qua refresh.
 * Clear khi logout hoặc 401.
 */
export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      accessToken: null,
      account: null,
      memberships: [],
      companyContext: null,
      setSession: (accessToken, account, memberships) =>
        set({ accessToken, account, memberships, companyContext: null }),
      setMemberships: (memberships) => set({ memberships }),
      setAccount: (account) => set({ account }),
      setCompany: (accessToken, companyContext) => set({ accessToken, companyContext }),
      leaveCompany: () => set({ companyContext: null }),
      clear: () =>
        set({ accessToken: null, account: null, memberships: [], companyContext: null }),
    }),
    {
      name: 'commerio.auth',
      version: 2,
      // Phiên lưu theo cấu trúc cũ (user.roles) không dùng lại được → đăng nhập lại
      migrate: () => ({
        accessToken: null,
        account: null,
        memberships: [],
        companyContext: null,
      }),
      partialize: (state) => ({
        accessToken: state.accessToken,
        account: state.account,
        memberships: state.memberships,
        companyContext: state.companyContext,
      }),
    },
  ),
);

export function selectIsAuthenticated(s: AuthStore): boolean {
  return Boolean(s.accessToken && s.account);
}

/**
 * Đồng bộ đăng nhập/đăng xuất giữa các tab. Tab khác đổi tài khoản hoặc đăng xuất thì
 * tab này tải lại từ đầu, tránh hiện dữ liệu của tài khoản cũ.
 * Không đồng bộ công ty đang chọn: mỗi tab làm việc với công ty riêng theo URL,
 * đồng bộ cả công ty sẽ làm hai tab giành nhau đổi token liên tục.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== 'commerio.auth') return;
    let nextAccountId: string | null = null;
    try {
      nextAccountId = e.newValue ? JSON.parse(e.newValue)?.state?.account?.id ?? null : null;
    } catch {
      nextAccountId = null;
    }
    const currentAccountId = useAuthStore.getState().account?.id ?? null;
    if (nextAccountId !== currentAccountId) window.location.assign('/');
  });
}
