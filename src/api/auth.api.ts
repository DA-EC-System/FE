import { apiClient } from './client';
import type {
  ChangePasswordRequest,
  GoogleLoginRequest,
  LoginRequest,
  LoginResponse,
  MeResponse,
  RegisterCompanyRequest,
  RegisterCompanyResponse,
  SelectCompanyResponse,
} from '@/types/auth';

export const authApi = {
  async login(payload: LoginRequest): Promise<LoginResponse> {
    const { data } = await apiClient.post<LoginResponse>('/auth/login', payload);
    return data;
  },
  async loginWithGoogle(payload: GoogleLoginRequest): Promise<LoginResponse> {
    const { data } = await apiClient.post<LoginResponse>('/auth/google', payload);
    return data;
  },
  async registerCompany(payload: RegisterCompanyRequest): Promise<RegisterCompanyResponse> {
    const { data } = await apiClient.post<RegisterCompanyResponse>('/auth/register', payload);
    return data;
  },
  async changePassword(payload: ChangePasswordRequest): Promise<void> {
    await apiClient.post('/auth/change-password', payload);
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
