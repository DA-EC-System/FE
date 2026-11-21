/**
 * Ánh xạ thông số và thuộc tính phân loại của công ty sang attribute của từng sàn (Documents/21 §18.8.1, §18.8.3).
 * Khoá theo `platform`; thêm sàn chỉ là thêm adapter phía BE, FE render theo danh sách sàn.
 */

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMutation } from './useMutation';
import axios from 'axios';
import { apiClient } from './client';
import { useAuthStore } from '@/stores/authStore';

export interface MappedOption {
  optionId: string;
  platformOptionId: string | null;
  platformLabel: string | null;
  /** Hai tầng (Documents/21 §18.8.1): lựa chọn riêng của công ty `editable: true`, kể cả trong thông số chuẩn */
  scope?: 'platform' | 'company';
  editable?: boolean;
}

export interface SpecMappingCode {
  attributeCode: string;
  attributeLabel: string;
  priority: number;
  options: MappedOption[];
}

/** `suggestions` tính lúc đọc theo tên, không lưu; người dùng bấm lưu mới thành `codes` */
export interface SpecMapping {
  fieldId: string;
  /** Thông số chuẩn: `editable: false` ở cấp mã, chỉ nền tảng đổi tập mã */
  scope?: 'platform' | 'company';
  editable?: boolean;
  codes: SpecMappingCode[];
  suggestions: Omit<SpecMappingCode, 'priority'>[];
}

export interface SpecMappingInput {
  /** Thứ tự là `priority`; `[]` là bỏ ánh xạ. text/number/date không có `options` */
  codes: { attributeCode: string; options?: { optionId: string; platformOptionId: string | null }[] }[];
}

export interface AxisMapping {
  attributeId: string;
  /** Thuộc tính chuẩn: `editable: false`, PUT 403 `platform_managed` */
  scope?: 'platform' | 'company';
  editable?: boolean;
  platformKind: string | null;
  codes: { attributeCode: string; attributeLabel: string; priority: number }[];
  /** Mặc định theo `platformKind` do adapter khai, chỉ đọc */
  defaultCodes: string[];
}

export interface CatalogAttribute {
  code: string;
  label: string;
  kind: 'sales' | 'property';
  input: string;
  options: { id: string; label: string }[];
}

const keys = {
  all: (companyId: string, platform: string) => ['company', companyId, 'channel-mappings', platform] as const,
  spec: (companyId: string, platform: string) => [...keys.all(companyId, platform), 'spec'] as const,
  axis: (companyId: string, platform: string) => [...keys.all(companyId, platform), 'axis'] as const,
  catalog: (companyId: string, platform: string, search: string, kind?: string) =>
    [...keys.all(companyId, platform), 'catalog', search, kind ?? ''] as const,
};

const useCompanyId = () => useAuthStore((s) => s.companyContext?.companyId ?? '');

export function useSpecMappings(platform: string, enabled = true) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: keys.spec(companyId, platform),
    enabled: Boolean(companyId) && enabled,
    queryFn: async () => {
      const { data } = await apiClient.get<{ items: SpecMapping[] }>(`/channel/platforms/${platform}/spec-mappings`);
      return data.items;
    },
  });
}

export function useSaveSpecMapping(platform: string) {
  const companyId = useCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ fieldId, ...body }: SpecMappingInput & { fieldId: string }) => {
      const { data } = await apiClient.put<SpecMapping>(`/channel/platforms/${platform}/spec-mappings/${fieldId}`, body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.spec(companyId, platform) }),
  });
}

/**
 * `null`: máy chủ chưa có ghép trục cho sàn này (404, commerio-backend#512 chưa lên), hiện "chưa hỗ trợ" thay vì lỗi tải
 */
export function useAxisMappings(platform: string, enabled = true) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: keys.axis(companyId, platform),
    enabled: Boolean(companyId) && enabled,
    queryFn: async (): Promise<AxisMapping[] | null> => {
      try {
        const { data } = await apiClient.get<{ items: AxisMapping[] }>(`/channel/platforms/${platform}/axis-mappings`);
        return data.items;
      } catch (e) {
        if (axios.isAxiosError(e) && e.response?.status === 404) return null;
        throw e;
      }
    },
  });
}

export function useSaveAxisMapping(platform: string) {
  const companyId = useCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ attributeId, codes }: { attributeId: string; codes: { attributeCode: string }[] }) => {
      const { data } = await apiClient.put<AxisMapping>(`/channel/platforms/${platform}/axis-mappings/${attributeId}`, { codes });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.axis(companyId, platform) }),
  });
}

/** Attribute đã gặp ở các leaf đã lấy của sàn; `search` ≥ 2 ký tự, tối đa 50 dòng, đọc DB không gọi sàn */
export function useAttributeCatalog(platform: string, search: string, kind?: 'sales' | 'property') {
  const companyId = useCompanyId();
  const q = search.trim();
  return useQuery({
    queryKey: keys.catalog(companyId, platform, q, kind),
    enabled: Boolean(companyId) && q.length >= 2,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data } = await apiClient.get<{ items: CatalogAttribute[] }>(`/channel/platforms/${platform}/attribute-catalog`, {
        params: { search: q, ...(kind && { kind }) },
      });
      return data.items;
    },
  });
}
