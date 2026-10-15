import { apiClient } from './client';
import type {
  LoginRequest,
  LoginResponse,
  MeResponse,
  SelectCompanyResponse,
} from '@/types/auth';

export const authApi = {
  async login(payload: LoginRequest): Promise<LoginResponse> {
    const { data } = await apiClient.post<LoginResponse>('/auth/login', payload);
    return data;
  },
  async me(): Promise<MeResponse> {
    const { data } = await apiClient.get<MeResponse>('/auth/me');
    return data;
  },
  async selectCompany(companyId: string): Promise<SelectCompanyResponse> {
    const { data } = await apiClient.post<SelectCompanyResponse>(
      '/auth/select-company',
      { companyId },
    );
    return data;
  },
};
