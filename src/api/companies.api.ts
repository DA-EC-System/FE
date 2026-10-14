import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, getErrorMessage } from './client';
import type {
  Company,
  CompanyCreateInput,
  CompanyUpdateInput,
} from '@/types/company';

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CompanyListParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

export const companyKeys = {
  all: ['companies'] as const,
  list: (params: CompanyListParams) =>
    [...companyKeys.all, 'list', params] as const,
  detail: (id: string) => [...companyKeys.all, 'detail', id] as const,
};

export function useCompanies(params: CompanyListParams = {}) {
  return useQuery({
    queryKey: companyKeys.list(params),
    queryFn: async (): Promise<PageResult<Company>> => {
      const { data } = await apiClient.get<PageResult<Company>>(
        '/admin/companies',
        { params },
      );
      return data;
    },
  });
}

export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CompanyCreateInput) => {
      const { data } = await apiClient.post<Company>('/admin/companies', input);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: companyKeys.all }),
    onError: (e) => {
      throw new Error(getErrorMessage(e));
    },
  });
}

export function useUpdateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: CompanyUpdateInput & { id: string }) => {
      const { data } = await apiClient.patch<Company>(
        `/admin/companies/${id}`,
        patch,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: companyKeys.all }),
    onError: (e) => {
      throw new Error(getErrorMessage(e));
    },
  });
}

export function useDeleteCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete<Company>(`/admin/companies/${id}`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: companyKeys.all }),
  });
}

export function useBulkDeleteCompanies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { data } = await apiClient.post<{ deleted: number }>(
        '/admin/companies/bulk-delete',
        { ids },
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: companyKeys.all }),
  });
}
