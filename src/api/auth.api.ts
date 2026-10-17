import { apiClient } from './client';
import type {
  ChangePasswordRequest,
  GoogleLoginRequest,
  LoginRequest,
  LoginResponse,
  MeResponse,
  RefreshResponse,
  RegisterCompanyRequest,
  RegisterCompanyResponse,
  SelectCompanyResponse,
} from '@/types/auth';

/** Đường dẫn theo docs/21 A3: `/api/v1/identity/*` */
export const authApi = {
  async login(payload: LoginRequest): Promise<LoginResponse> {
    const { data } = await apiClient.post<LoginResponse>('/identity/login', payload);
    return data;
  },
  async loginWithGoogle(payload: GoogleLoginRequest): Promise<LoginResponse> {
    const { data } = await apiClient.post<LoginResponse>('/identity/google', payload);
    return data;
  },
  async registerCompany(payload: RegisterCompanyRequest): Promise<RegisterCompanyResponse> {
    const { data } = await apiClient.post<RegisterCompanyResponse>('/identity/register', payload);
    return data;
  },
  async changePassword(payload: ChangePasswordRequest): Promise<void> {
    await apiClient.post('/identity/change-password', payload);
  },
  async me(): Promise<MeResponse> {
    const { data } = await apiClient.get<MeResponse>('/identity/me');
    return data;
  },
  async selectCompany(companyId: string): Promise<SelectCompanyResponse> {
    const { data } = await apiClient.post<SelectCompanyResponse>('/identity/select-company', {
      companyId,
    });
    return data;
  },
  async refresh(): Promise<RefreshResponse> {
    const { data } = await apiClient.post<RefreshResponse>('/identity/refresh');
    return data;
  },
  /** BE thu hồi refresh token và xoá cookie */
  async logout(): Promise<void> {
    await apiClient.post('/identity/logout');
  },
};
