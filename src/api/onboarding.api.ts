/**
 * Thiết lập ban đầu (commerio-backend#461, #569; Documents/21 mục 23). Guard công ty, wizard `/welcome`, dải ở Tổng
 * quan cùng đọc một query. Làm mới khi SSE làm mới nhóm `tasks` (`useRealtime`).
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMutation } from './useMutation';
import { apiClient } from './client';
import { useAuthStore } from '@/stores/authStore';
import type { Onboarding, OnboardingCompleted } from '@/types/onboarding';

export const onboardingKey = (companyId: string) => ['company', companyId, 'onboarding'] as const;

/** `refetchOnWindowFocus`: wizard đọc lại khi người dùng làm xong việc ở tab khác (trang uỷ quyền sàn) rồi quay về */
export function useOnboarding(options: { refetchOnWindowFocus?: boolean } = {}) {
  const companyId = useAuthStore((s) => s.companyContext?.companyId ?? '');
  return useQuery({
    queryKey: onboardingKey(companyId),
    enabled: Boolean(companyId),
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false,
    queryFn: async () => (await apiClient.get<Onboarding>('/onboarding')).data,
  });
}

/**
 * "Vào Tổng quan" ở trang "Sẵn sàng bán". 409 `onboarding_incomplete` kèm `missing` thì bên gọi đưa về bước đầu tiên
 * còn thiếu. Xong thì đọc lại onboarding để guard thôi ép về `/welcome`.
 */
export function useCompleteOnboarding() {
  const companyId = useAuthStore((s) => s.companyContext?.companyId ?? '');
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiClient.post<OnboardingCompleted>('/onboarding/complete')).data,
    // Ghi ngay vào cache để guard thôi ép về /welcome trước khi chuyển trang, rồi đọc lại cho chắc
    onSuccess: ({ completedAt }) =>
      qc.setQueryData<Onboarding>(onboardingKey(companyId), (old) => old && { ...old, completedAt, mustWizard: false }),
    onSettled: () => qc.invalidateQueries({ queryKey: onboardingKey(companyId) }),
  });
}
