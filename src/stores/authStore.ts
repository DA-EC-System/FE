import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types/auth';

interface AuthStore {
  accessToken: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
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
      user: null,
      setAuth: (accessToken, user) => set({ accessToken, user }),
      clear: () => set({ accessToken: null, user: null }),
    }),
    {
      name: 'commerio.auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
      }),
    },
  ),
);

export function selectIsAuthenticated(s: AuthStore): boolean {
  return Boolean(s.accessToken && s.user);
}
