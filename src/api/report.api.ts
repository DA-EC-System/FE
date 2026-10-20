/**
 * API báo cáo kinh doanh: tổng quan, lãi theo gian hàng, chuỗi theo ngày, xuất CSV (UC-RP-01, UC-RP-02).
 * Hợp đồng theo Documents/21 mục 12.7, 12.8, BE ở commerio-backend#29.
 */

import axios from 'axios';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from './client';
import { useAuthStore } from '@/stores/authStore';
import type { OrderSource } from '@/types/sales';
import type { ReportDaily, ReportKind, ReportOverview, ReportShops } from '@/types/report';

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
export const useReportShops = (params: RangeParams, enabled = true) => useReport<ReportShops>('shops', params, enabled);
export const useReportDaily = (params: DailyParams, enabled = true) => useReport<ReportDaily>('daily', params, enabled);

/** Tên tệp trong `Content-Disposition`: `filename*=UTF-8''…` trước, rồi `filename="…"` */
export function filenameFromDisposition(header: string | null | undefined, fallback: string): string {
  if (!header) return fallback;
  const star = header.match(/filename\*\s*=\s*(?:UTF-8'[^']*')?([^;]+)/i);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      // tên mã hoá sai thì thử dạng thường
    }
  }
  const plain = header.match(/filename\s*=\s*("([^"]*)"|[^;]+)/i);
  const name = (plain?.[2] ?? plain?.[1])?.trim();
  return name || fallback;
}

/** Lỗi của lời gọi `responseType: 'blob'` có thân là Blob: đọc lại thành Problem Details để `problemMessage` dùng được */
async function blobErrorToJson(error: unknown): Promise<never> {
  if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
    try {
      error.response.data = JSON.parse(await error.response.data.text());
    } catch {
      // không phải JSON thì giữ nguyên
    }
  }
  throw error;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export interface ExportParams extends DailyParams {
  report: ReportKind;
}

/** Tải CSV về máy; trả tên tệp đã lưu */
export function useExportReport() {
  return useMutation({
    mutationFn: async (params: ExportParams) => {
      const res = await apiClient
        .get<Blob>('/report/export', { params, responseType: 'blob' })
        .catch(blobErrorToJson);
      const filename = filenameFromDisposition(
        res.headers['content-disposition'] as string | undefined,
        `bao-cao-${params.report}.csv`,
      );
      saveBlob(res.data, filename);
      return filename;
    },
  });
}
