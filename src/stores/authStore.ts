import { create } from 'zustand';
import type { Account, CompanyContext, Membership } from '@/types/auth';
import type { ModuleKey } from '@/utils/modules';

/**
 * - `loading`: vừa mở hoặc tải lại trang, đang xin access token mới bằng cookie refresh.
 * - `ready`: đã biết có phiên hay không; guard mới được quyết định chuyển trang.
 */
export type SessionStatus = 'loading' | 'ready';

interface AuthStore {
  status: SessionStatus;
  accessToken: string | null;
  account: Account | null;
  memberships: Membership[];
  /** Công ty đang làm việc; null khi chưa chọn hoặc là quản trị nền tảng */
  companyContext: CompanyContext | null;
  setSession: (token: string, account: Account, memberships: Membership[]) => void;
  setMemberships: (memberships: Membership[]) => void;
  setAccount: (account: Account) => void;
  setToken: (token: string) => void;
  setCompany: (token: string, context: CompanyContext) => void;
  /** CEO vừa bật/tắt phân hệ (UC-PI-02): đổi menu ngay, không cần chọn lại công ty */
  setEnabledModules: (modules: ModuleKey[]) => void;
  leaveCompany: () => void;
  setReady: () => void;
  clear: () => void;
}

/**
 * Phiên đăng nhập chỉ nằm trong bộ nhớ (docs/21 A1): không ghi access token vào
 * localStorage hay sessionStorage. Refresh token là cookie HttpOnly do BE đặt, JS không đọc được.
 * Tải lại trang thì `bootstrapSession()` xin access token mới bằng cookie đó.
 */
export const useAuthStore = create<AuthStore>()((set) => ({
  status: 'loading',
  accessToken: null,
  account: null,
  memberships: [],
  companyContext: null,
  setSession: (accessToken, account, memberships) => {
    set({ accessToken, account, memberships, companyContext: null });
    announce(account.id);
  },
  setMemberships: (memberships) => set({ memberships }),
  setAccount: (account) => set({ account }),
  setToken: (accessToken) => set({ accessToken }),
  setCompany: (accessToken, companyContext) => set({ accessToken, companyContext }),
  setEnabledModules: (enabledModules) =>
    set((s) => ({
      companyContext: s.companyContext ? { ...s.companyContext, enabledModules } : null,
    })),
  leaveCompany: () => set({ companyContext: null }),
  setReady: () => set({ status: 'ready' }),
  clear: () => {
    const hadAccount = useAuthStore.getState().account !== null;
    set({ accessToken: null, account: null, memberships: [], companyContext: null });
    if (hadAccount) announce(null);
  },
}));

export function selectIsAuthenticated(s: AuthStore): boolean {
  return Boolean(s.accessToken && s.account);
}

/**
 * Đồng bộ đăng nhập/đăng xuất giữa các tab qua BroadcastChannel (không lưu gì vào storage).
 * Tab khác đổi tài khoản hoặc đăng xuất thì tab này tải lại từ đầu, tránh hiện dữ liệu
 * của tài khoản cũ. Không đồng bộ công ty đang chọn: mỗi tab làm việc với công ty riêng theo URL.
 */
const channel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('commerio.auth')
    : null;

function announce(accountId: string | null) {
  channel?.postMessage({ accountId });
}

channel?.addEventListener('message', (e: MessageEvent<{ accountId: string | null }>) => {
  const current = useAuthStore.getState().account?.id ?? null;
  if (e.data.accountId !== current) window.location.assign('/');
});
