/**
 * API giao vận theo kiện (sơ đồ D2, FE#59): hàng đợi kiện, đóng gói, bàn giao, giao, hoàn, thất lạc; huỷ đơn.
 * Hợp đồng ở Documents/21 mục 19.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { blobErrorToJson, saveBlob } from './report.api';
import { useAuthStore } from '@/stores/authStore';
import type { CancelOrderResult, CancelReasonList, CancelRequestDecision, Order } from '@/types/sales';
import type {
  CarrierList,
  DeliveryAction,
  HandOverResult,
  Package,
  PackageDocumentKind,
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
  carriers: (companyId: string, id: string) => [...fulfillmentKeys.all(companyId), 'carriers', id] as const,
  cancelReasons: (companyId: string, orderId: string) => [...fulfillmentKeys.all(companyId), 'cancel-reasons', orderId] as const,
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
  | { kind: 'pack'; lines: { variantId: string; quantity: number }[]; carrierCode?: string }
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

/** Đơn vị vận chuyển sàn cho phép với kiện; kiện đơn tay trả rỗng (§19.3) */
export function usePackageCarriers(id: string, enabled = true) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: fulfillmentKeys.carriers(companyId, id),
    enabled: Boolean(companyId && id) && enabled,
    queryFn: async () => {
      const { data } = await apiClient.get<CarrierList>(`/fulfillment/packages/${id}/carriers`);
      return data;
    },
  });
}

/**
 * In vận đơn của 1..50 kiện: BE lấy tệp PDF/HTML từ sàn (R10), FE mở ở tab mới để in.
 * Trình duyệt chặn tab mới thì tải tệp về.
 */
export function usePrintPackageDocuments() {
  return useMutation({
    mutationFn: async ({ ids, kind = 'awb' }: { ids: string[]; kind?: PackageDocumentKind }) => {
      const res = await apiClient
        .get<Blob>('/fulfillment/packages/documents', { params: { ids: ids.join(','), kind }, responseType: 'blob' })
        .catch(blobErrorToJson);
      const url = URL.createObjectURL(res.data);
      if (!window.open(url, '_blank')) saveBlob(res.data, `van-don.${res.data.type.includes('html') ? 'html' : 'pdf'}`);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
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

/** Lý do huỷ của sàn; BE kiểm đơn huỷ được trên sàn trước (409 `marketplace_rejected` kèm câu của sàn) */
export function useCancelReasons(orderId: string, enabled: boolean) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: fulfillmentKeys.cancelReasons(companyId, orderId),
    enabled: Boolean(companyId && orderId) && enabled,
    // Sàn đổi trạng thái liên tục: mỗi lần mở hộp thoại hỏi lại
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      const { data } = await apiClient.get<CancelReasonList>(`/sales/orders/${orderId}/cancel-reasons`);
      return data;
    },
  });
}

/** Huỷ đơn sàn với lý do của sàn; kiện xử lý như huỷ đơn tay (`pendingOpen`) */
export function usePlatformCancel() {
  const invalidate = useInvalidateCompany();
  return useMutation({
    mutationFn: async ({ id, version, reasonId }: { id: string; version: number; reasonId: string }) => {
      const { data } = await apiClient.post<CancelOrderResult>(`/sales/orders/${id}/platform-cancel`, { version, reasonId });
      return data;
    },
    onSettled: invalidate,
  });
}

/** Trả lời khách xin huỷ: đồng ý thì huỷ như người bán huỷ, từ chối thì bỏ cờ */
export function useCancelRequestDecision() {
  const invalidate = useInvalidateCompany();
  return useMutation({
    mutationFn: async ({ id, version, decision }: { id: string; version: number; decision: CancelRequestDecision }) => {
      const { data } = await apiClient.post<Order>(`/sales/orders/${id}/cancel-request`, { version, decision });
      return data;
    },
    onSettled: invalidate,
  });
}
