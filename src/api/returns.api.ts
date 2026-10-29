/**
 * API yêu cầu trả hàng (sơ đồ D3, FE#60): danh sách, chi tiết, xử lý, quét nhận, kiện không khớp.
 * Hợp đồng ở Documents/21 mục 20.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { useAuthStore } from '@/stores/authStore';
import type {
  CreateReturnInput,
  PlatformHistoryList,
  ReceiveResult,
  ReturnListResponse,
  ReturnReasonAction,
  ReturnReasonList,
  ReturnRequest,
  ReturnStatus,
  ReturnableLine,
  UnmatchedParcel,
  UnmatchedStatus,
} from '@/types/returns';

export interface ReturnListParams {
  status?: ReturnStatus;
  page?: number;
  pageSize?: number;
  search?: string;
  source?: string;
  orderId?: string;
}

export const returnKeys = {
  all: (companyId: string) => ['company', companyId, 'returns'] as const,
  list: (companyId: string, params: ReturnListParams) => [...returnKeys.all(companyId), 'list', params] as const,
  detail: (companyId: string, id: string) => [...returnKeys.all(companyId), 'detail', id] as const,
  returnable: (companyId: string, orderId: string) => [...returnKeys.all(companyId), 'returnable', orderId] as const,
  unmatched: (companyId: string, status?: UnmatchedStatus) => [...returnKeys.all(companyId), 'unmatched', status] as const,
  reasons: (companyId: string, id: string, action: ReturnReasonAction) =>
    [...returnKeys.all(companyId), 'reasons', id, action] as const,
  platformHistory: (companyId: string, id: string) => [...returnKeys.all(companyId), 'platform-history', id] as const,
};

function useCompanyId(): string {
  return useAuthStore((s) => s.companyContext?.companyId ?? '');
}

/** Yêu cầu trả chạm tới đơn (cờ, hoàn tất), phiếu kho, việc cần làm → làm mới mọi dữ liệu của công ty */
function useInvalidateCompany() {
  const qc = useQueryClient();
  const companyId = useCompanyId();
  return () => qc.invalidateQueries({ queryKey: ['company', companyId] });
}

export function useReturns(params: ReturnListParams, options: { enabled?: boolean } = {}) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: returnKeys.list(companyId, params),
    enabled: Boolean(companyId) && (options.enabled ?? true),
    queryFn: async () => {
      const { data } = await apiClient.get<ReturnListResponse>('/returns', { params });
      return data;
    },
  });
}

export function useReturn(id: string) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: returnKeys.detail(companyId, id),
    enabled: Boolean(companyId && id),
    queryFn: async () => {
      const { data } = await apiClient.get<ReturnRequest>(`/returns/${id}`);
      return data;
    },
  });
}

/** Số còn trả được theo biến thể của đơn (đã giao trừ phần đã nằm ở yêu cầu khác) */
export function useReturnable(orderId: string, enabled = true) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: returnKeys.returnable(companyId, orderId),
    enabled: Boolean(companyId && orderId) && enabled,
    queryFn: async () => {
      const { data } = await apiClient.get<ReturnableLine[]>('/returns/returnable', { params: { orderId } });
      return data;
    },
  });
}

/** Lý do từ chối theo danh sách của sàn (§20.1); chỉ yêu cầu từ sàn */
export function useReturnReasons(id: string, action: ReturnReasonAction, enabled = true) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: returnKeys.reasons(companyId, id, action),
    enabled: Boolean(companyId && id) && enabled,
    queryFn: async () => {
      const { data } = await apiClient.get<ReturnReasonList>(`/returns/${id}/reasons`, { params: { action } });
      return data;
    },
  });
}

/** Lịch sử đơn ngược phía sàn, mới nhất trước (§20.1) */
export function useReturnPlatformHistory(id: string, enabled = true) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: returnKeys.platformHistory(companyId, id),
    enabled: Boolean(companyId && id) && enabled,
    queryFn: async () => {
      const { data } = await apiClient.get<PlatformHistoryList>(`/returns/${id}/platform-history`);
      return data;
    },
  });
}

export function useUnmatchedParcels(status?: UnmatchedStatus, enabled = true) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: returnKeys.unmatched(companyId, status),
    enabled: Boolean(companyId) && enabled,
    queryFn: async () => {
      const { data } = await apiClient.get<UnmatchedParcel[]>('/returns/unmatched', { params: status ? { status } : {} });
      return data;
    },
  });
}

export function useCreateReturn() {
  const invalidate = useInvalidateCompany();
  return useMutation({
    mutationFn: async (input: CreateReturnInput) => {
      const { data } = await apiClient.post<ReturnRequest>('/returns', input);
      return data;
    },
    onSettled: invalidate,
  });
}

/** Thao tác trên yêu cầu; thân gửi kèm version, lỗi 409 trả `current` là yêu cầu mới nhất */
export type ReturnCommand =
  | { kind: 'accept' }
  | { kind: 'reject'; reason: string }
  /** Yêu cầu từ sàn: lý do theo danh sách của sàn, ảnh khi lý do bắt buộc (§20.1) */
  | { kind: 'reject'; reasonId: string; comment?: string; attachmentIds: string[] }
  | { kind: 'refund-only' }
  | { kind: 'platform-reopen' }
  | { kind: 'platform-refund' }
  | { kind: 'no-show'; reason: string };

export function useReturnCommand() {
  const invalidate = useInvalidateCompany();
  return useMutation({
    mutationFn: async ({ id, version, command }: { id: string; version: number; command: ReturnCommand }) => {
      const { kind, ...body } = command;
      const { data } = await apiClient.post<ReturnRequest>(`/returns/${id}/${kind}`, { version, ...body });
      return data;
    },
    onSettled: invalidate,
  });
}

/** Kho quét mã trên kiện hàng trả: khớp thì yêu cầu sang Đã nhận, không khớp thì vào khu chờ xử lý */
export function useReceiveReturn() {
  const invalidate = useInvalidateCompany();
  return useMutation({
    mutationFn: async (input: { code: string; note?: string }) => {
      const { data } = await apiClient.post<ReceiveResult>('/returns/receive', input);
      return data;
    },
    onSettled: invalidate,
  });
}

export function useResolveParcel() {
  const invalidate = useInvalidateCompany();
  return useMutation({
    mutationFn: async ({
      id,
      version,
      ...body
    }: { id: string; version: number } & ({ kind: 'attach'; returnRequestId: string } | { kind: 'dismiss'; reason: string })) => {
      const { kind, ...rest } = body;
      const { data } = await apiClient.post<UnmatchedParcel>(`/returns/unmatched/${id}/${kind}`, { version, ...rest });
      return data;
    },
    onSettled: invalidate,
  });
}
