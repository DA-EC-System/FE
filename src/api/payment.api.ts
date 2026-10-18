/**
 * API thanh toán: khoá cổng của công ty, mã thanh toán của đơn (UC-PF-01, UC-PF-11).
 * Hợp đồng theo Documents/21 mục 12 (đã chốt), BE ở commerio-backend#23.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { useAuthStore } from '@/stores/authStore';
import type { Gateway, GatewayAvailability, GatewayConfig, OrderPayment, PaymentLink } from '@/types/payment';

export const paymentKeys = {
  all: (companyId: string) => ['company', companyId, 'payment'] as const,
  gateways: (companyId: string) => [...paymentKeys.all(companyId), 'gateways'] as const,
  order: (companyId: string, orderId: string) => [...paymentKeys.all(companyId), 'order', orderId] as const,
};

function useCompanyId(): string {
  return useAuthStore((s) => s.companyContext?.companyId ?? '');
}

/** Người có payment.gateway.manage nhận đủ thông tin; chỉ có link.create thì chỉ biết cổng nào đã cấu hình */
export function useGateways(options: { enabled?: boolean } = {}) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: paymentKeys.gateways(companyId),
    enabled: Boolean(companyId) && (options.enabled ?? true),
    queryFn: async () => {
      const { data } = await apiClient.get<GatewayAvailability[]>('/payment/gateways');
      return data;
    },
  });
}

export function useSaveGateway() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return useMutation({
    mutationFn: async (input: { gateway: Gateway; credentials: Record<string, string>; version: number }) => {
      const { data } = await apiClient.put<GatewayConfig>(`/payment/gateways/${input.gateway}`, {
        credentials: input.credentials,
        version: input.version,
      });
      return data;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: paymentKeys.gateways(companyId) }),
  });
}

/**
 * Trạng thái tiền của đơn. Chưa có SSE (FE#15) nên hỏi lại mỗi `pollMs` khi đơn còn mã đang chờ trả;
 * khi có SSE thì bỏ hỏi lại, chỉ gọi một lần lúc nối lại (Documents/21 T14).
 */
export function useOrderPayment(orderId: string, options: { enabled?: boolean; pollMs?: number } = {}) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: paymentKeys.order(companyId, orderId),
    enabled: Boolean(companyId && orderId) && (options.enabled ?? true),
    queryFn: async () => {
      const { data } = await apiClient.get<OrderPayment>(`/payment/orders/${orderId}`);
      return data;
    },
    refetchInterval: (query) => {
      const p = query.state.data;
      return options.pollMs && p?.activeLink && p.status === 'unpaid' ? options.pollMs : false;
    },
  });
}

/** 201 là mã mới; 200 là đơn đã có mã còn hạn (T10) */
export function useCreatePaymentLink(orderId: string) {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return useMutation({
    mutationFn: async (gateway: Gateway) => {
      const res = await apiClient.post<PaymentLink>(`/payment/orders/${orderId}/links`, { gateway });
      return { link: res.data, reused: res.status === 200 };
    },
    onSettled: () => qc.invalidateQueries({ queryKey: paymentKeys.order(companyId, orderId) }),
  });
}
