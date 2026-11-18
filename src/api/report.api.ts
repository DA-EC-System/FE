/**
 * API số liệu kinh doanh của trang chủ: tổng quan, chuỗi theo ngày (UC-RP-01). Trang /reports ngoài MVP, gỡ ở FE#249.
 * Hợp đồng theo Documents/21 mục 12.7, 12.8, BE ở commerio-backend#29.
 */

import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';
import { useAuthStore } from '@/stores/authStore';
import type { OrderSource } from '@/types/sales';
import type { ReportDaily, ReportKind, ReportOverview } from '@/types/report';

/** Bỏ trống cả hai thì BE lấy 30 ngày tới hôm nay */
export interface RangeParams {
  from?: string;
  to?: string;
}

/** `shopId` luôn đi với `source=marketplace` (§12.7) */
export interface DailyParams extends RangeParams {
  source?: OrderSource;
  shopId?: string;
}

export const reportKeys = {
  all: (companyId: string) => ['company', companyId, 'report'] as const,
  of: (companyId: string, kind: ReportKind, params: object) => [...reportKeys.all(companyId), kind, params] as const,
};

function useCompanyId(): string {
  return useAuthStore((s) => s.companyContext?.companyId ?? '');
}

function useReport<T>(kind: ReportKind, params: object, enabled: boolean) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: reportKeys.of(companyId, kind, params),
    enabled: Boolean(companyId) && enabled,
    retry: false,
    queryFn: async () => {
      const { data } = await apiClient.get<T>(`/report/${kind}`, { params });
      return data;
    },
  });
}

export const useReportOverview = (params: RangeParams, enabled = true) =>
  useReport<ReportOverview>('overview', params, enabled);
export const useReportDaily = (params: DailyParams, enabled = true) => useReport<ReportDaily>('daily', params, enabled);


/** Lỗi của lời gọi `responseType: 'blob'` có thân là Blob: đọc lại thành Problem Details để `problemMessage` dùng được */
export async function blobErrorToJson(error: unknown): Promise<never> {
  if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
    try {
      error.response.data = JSON.parse(await error.response.data.text());
    } catch {
      // không phải JSON thì giữ nguyên
    }
  }
  throw error;
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

