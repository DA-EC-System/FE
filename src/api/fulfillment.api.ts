/**
 * API giao vận theo kiện (sơ đồ D2, FE#59): hàng đợi kiện, đóng gói, bàn giao, giao, hoàn, thất lạc; huỷ đơn.
 * Hợp đồng ở Documents/21 mục 19.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { useAuthStore } from '@/stores/authStore';
import type { CancelOrderResult, Order } from '@/types/sales';
import type {
  DeliveryAction,
  HandOverResult,
  Package,
  PackageQueue,
  PackageTab,
  PickListLine,
  SplitInput,
} from '@/types/fulfillment';

export interface PackageQueueParams {
  tab: PackageTab;
  page?: number;
  pageSize?: number;
  search?: string;
  source?: string;
  shopId?: string;
}

export const fulfillmentKeys = {
  all: (companyId: string) => ['company', companyId, 'fulfillment'] as const,
  queue: (companyId: string, params: PackageQueueParams) => [...fulfillmentKeys.all(companyId), 'queue', params] as const,
  package: (companyId: string, id: string) => [...fulfillmentKeys.all(companyId), 'package', id] as const,
  pickList: (companyId: string, ids: string[]) => [...fulfillmentKeys.all(companyId), 'pick-list', ids] as const,
};

function useCompanyId(): string {
  return useAuthStore((s) => s.companyContext?.companyId ?? '');
}

/** Kiện đổi chạm tới đơn, tồn kho, thanh toán, phiếu kho → làm mới mọi dữ liệu của công ty */
function useInvalidateCompany() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return () => qc.invalidateQueries({ queryKey: ['company', companyId] });
}

export function usePackageQueue(params: PackageQueueParams) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: fulfillmentKeys.queue(companyId, params),
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data } = await apiClient.get<PackageQueue>('/fulfillment/packages', { params });
      return data;
    },
  });
}

export function usePackage(id: string) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: fulfillmentKeys.package(companyId, id),
    enabled: Boolean(companyId && id),
    queryFn: async () => {
      const { data } = await apiClient.get<Package>(`/fulfillment/packages/${id}`);
      return data;
    },
  });
}

/** Danh sách nhặt gộp theo biến thể; không chọn kiện thì lấy mọi kiện Cần đóng gói */
export function usePickList(ids: string[], enabled = true) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: fulfillmentKeys.pickList(companyId, ids),
    enabled: Boolean(companyId) && enabled,
    queryFn: async () => {
      const { data } = await apiClient.get<PickListLine[]>('/fulfillment/pick-list', {
        params: ids.length ? { ids: ids.join(',') } : {},
      });
      return data;
    },
  });
}

/** Thao tác một kiện; thân gửi kèm version, lỗi 409 trả `current` là kiện mới nhất */
export type PackageCommand =
  | { kind: 'pack'; lines: { variantId: string; quantity: number }[] }
  | { kind: 'ready' }
  | { kind: 'undo-handover'; reason: string }
  | { kind: 'open' }
  | { kind: 'self-deliver' }
  | { kind: 'delivery'; action: DeliveryAction; reason?: string }
  | { kind: 'receive-return'; code: string }
  | { kind: 'report-lost'; claimCode: string }
  | { kind: 'confirm-lost' }
  | { kind: 'found' };

export function usePackageCommand() {
  const invalidate = useInvalidateCompany();
  return useMutation({
    mutationFn: async ({ id, version, command }: { id: string; version: number; command: PackageCommand }) => {
      const { kind, ...body } = command;
      const { data } = await apiClient.post<Package>(`/fulfillment/packages/${id}/${kind}`, { version, ...body });
      return data;
    },
    onSettled: invalidate,
  });
}

/** Bàn giao hàng loạt: kiện bị chặn nằm ở `failed`, kiện khác vẫn bàn giao */
export function useHandOver() {
  const invalidate = useInvalidateCompany();
  return useMutation({
    mutationFn: async (packages: { id: string; version: number }[]) => {
      const { data } = await apiClient.post<HandOverResult>('/fulfillment/packages/hand-over', { packages });
      return data;
    },
    onSettled: invalidate,
  });
}

/** Chia kiện chưa đóng gói; trả về đơn với danh sách kiện mới */
export function useSplitPackage() {
  const invalidate = useInvalidateCompany();
  return useMutation({
    mutationFn: async ({ id, ...body }: SplitInput & { id: string }) => {
      const { data } = await apiClient.post<Order>(`/fulfillment/packages/${id}/split`, body);
      return data;
    },
    onSettled: invalidate,
  });
}

/**
 * Huỷ đơn: kiện chưa đóng gói huỷ ngay, nhả hàng; kiện đã đóng gói chờ mở (`pendingOpen`), đơn mang cờ Đang huỷ.
 * Mã thanh toán còn hiệu lực bị huỷ; đơn đã trả chờ hoàn tiền.
 */
export function useCancelOrder() {
  const invalidate = useInvalidateCompany();
  return useMutation({
    mutationFn: async ({ id, version, reason }: { id: string; version: number; reason: string }) => {
      const { data } = await apiClient.post<CancelOrderResult>(`/sales/orders/${id}/cancel`, { version, reason });
      return data;
    },
    onSettled: invalidate,
  });
}
