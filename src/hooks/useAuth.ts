import { useEffect } from 'react';
import { useAuthStore, selectIsAuthenticated } from '@/stores/authStore';
import type { LoginRequest } from '@/types/auth';
import { authApi } from '@/api/auth.api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export function useAuth() {
  const token = useAuthStore((s) => s.accessToken);
  const account = useAuthStore((s) => s.account);
  const memberships = useAuthStore((s) => s.memberships);
  const companyContext = useAuthStore((s) => s.companyContext);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const clear = useAuthStore((s) => s.clear);

  return { token, account, memberships, companyContext, isAuthenticated, clear };
}

export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginRequest) => authApi.login(input),
    onSuccess: (res) => {
      qc.clear();
      setSession(res.accessToken, res.account, res.memberships);
    },
  });
}

export function useLogout() {
  const clear = useAuthStore((s) => s.clear);
  const qc = useQueryClient();
  return () => {
    clear();
    qc.clear();
    window.location.assign('/login');
  };
}

/** Tải lại danh sách công ty của tài khoản (trạng thái khoá có thể đã đổi). */
export function useMe() {
  const token = useAuthStore((s) => s.accessToken);
  const setMemberships = useAuthStore((s) => s.setMemberships);
  const query = useQuery({
    queryKey: ['auth', 'me'],
    enabled: Boolean(token),
    queryFn: () => authApi.me(),
    staleTime: 0,
  });
  useEffect(() => {
    if (query.data) setMemberships(query.data.memberships);
  }, [query.data, setMemberships]);
  return query;
}

/**
 * Chọn công ty làm việc: BE cấp token gắn với công ty đó.
 * Xoá toàn bộ cache để dữ liệu của công ty trước không lẫn sang công ty sau.
 */
export function useSelectCompany() {
  const setCompany = useAuthStore((s) => s.setCompany);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (companyId: string) => authApi.selectCompany(companyId),
    onSuccess: (res) => {
      qc.clear();
      setCompany(res.accessToken, res.context);
    },
  });
}
