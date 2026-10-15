import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { useAuthStore } from '@/stores/authStore';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

/** Lỗi theo Problem Details (RFC 9457) — định dạng lỗi tập trung của BE (docs/17 §6). */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  /** Mã lỗi nghiệp vụ, vd "company_locked", "state_conflict" */
  code?: string;
  /** Lỗi theo field, dùng gắn vào form */
  errors?: Record<string, string>;
}

export const apiClient: AxiosInstance = axios.create({
  baseURL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Request: gắn JWT
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response: 401 → về đăng nhập; công ty vừa bị khoá → về chọn công ty
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ProblemDetails>) => {
    const status = error.response?.status;
    const code = error.response?.data?.code;
    const path = window.location.pathname;
    if (status === 401) {
      // Chỉ xoá phiên: RequireAuth tự chuyển về /login và nhớ trang đang mở để quay lại
      useAuthStore.getState().clear();
    } else if (status === 403 && code === 'company_locked' && path.startsWith('/c/')) {
      useAuthStore.getState().leaveCompany();
      window.location.assign('/select-company');
    }
    return Promise.reject(error);
  },
);

export function getProblem(error: unknown): ProblemDetails | undefined {
  if (axios.isAxiosError(error)) {
    return error.response?.data as ProblemDetails | undefined;
  }
  return undefined;
}

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'Không kết nối được máy chủ. Kiểm tra mạng hoặc VITE_API_BASE_URL.';
    const data = error.response.data as (ProblemDetails & { message?: string }) | string | undefined;
    if (data && typeof data === 'object') {
      const message = data.detail ?? data.title ?? data.message;
      if (message) return message;
    }
    // Không phải Problem Details: thường là gọi nhầm địa chỉ hoặc mock chưa bật
    if (error.response.status === 404) {
      return 'Không tìm thấy API (404). Kiểm tra VITE_API_BASE_URL, hoặc bật mock bằng VITE_USE_MOCKS=true.';
    }
    return `Máy chủ trả lỗi ${error.response.status}.`;
  }
  if (error instanceof Error) return error.message;
  return 'Đã có lỗi xảy ra';
}
