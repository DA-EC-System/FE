import { useAuthStore, selectIsAuthenticated } from '@/stores/authStore';
import type { LoginRequest } from '@/types/auth';
import { authApi } from '@/api/auth.api';
import { useMutation, useQuery } from '@tanstack/react-query';

export function useAuth() {
  const token = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const setAuth = useAuthStore((s) => s.setAuth);
  const clear = useAuthStore((s) => s.clear);

  return { token, user, isAuthenticated, setAuth, clear };
}

export function useLogin() {
  const { setAuth } = useAuth();
  return useMutation({
    mutationFn: async (input: LoginRequest) => {
      const res = await authApi.login(input);
      setAuth(res.accessToken, res.user);
      return res;
    },
  });
}

export function useMe() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['auth', 'me'],
    enabled: Boolean(token),
    queryFn: () => authApi.me(),
    staleTime: 5 * 60 * 1000,
  });
}
