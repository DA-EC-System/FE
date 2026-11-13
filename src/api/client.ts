import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import { useAuthStore } from '@/stores/authStore';
import type { RefreshResponse, SelectCompanyResponse } from '@/types/auth';
import { appPath, BASE_PATH } from '@/utils/env';

/** Mọi đường dẫn tính từ `/api/v1` (docs/21 mục 0). FE và API cùng domain qua Caddy (V38). */
const baseURL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

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
  /** Mã và câu gốc của sàn khi lỗi đến từ sàn (§19.3) */
  platformCode?: string;
  platformMessage?: string;
  /** Số đơn của gian hàng chưa xong khi ngắt bị chặn (409 `shop_has_open_orders`, §18.6.1) */
  openOrders?: number;
  /** 409 `shop_awaiting_allocation` (§18.6.11): đang chờ lượt kéo đơn còn mở hay chờ chia hàng */
  waitingFor?: 'open_orders' | 'allocation';
  /**
   * 409 `shop_mismatch` (§18.4): gian hàng đang kết nối lại và gian hàng vừa đăng nhập (`{ name, externalShopId }`, name có thể null).
   * 409 `company_mismatch` (§18.7.4): công ty bắt đầu kết nối và công ty đang mở (`{ id, name }`)
   */
  expected?: { name: string | null; externalShopId: string } | { id: string; name: string };
  actual?: { name: string | null; externalShopId: string } | { id: string; name: string };
  /** 501 `not_implemented` (R13, §18.7.9): mã issue đang làm phần còn thiếu, vd "commerio-backend#245" */
  issue?: string;
  /** 501 `not_implemented`: người phụ trách issue đó */
  owner?: string;
}

/**
 * Câu chung cho mọi 501 `not_implemented` (Documents/21 R13: FE bắt chung, không hiện `detail` thô của BE).
 * Thiếu issue hoặc owner thì chỉ báo chưa làm xong (Documents/21 §18.7.9).
 */
export function notImplementedMessage(issue?: unknown, owner?: unknown): string {
  const i = typeof issue === 'string' ? issue.trim() : '';
  const o = typeof owner === 'string' ? owner.trim() : '';
  return i && o ? `Chức năng này chưa làm xong: thuộc ${i} (${o})` : 'Chức năng này chưa làm xong';
}

export const apiClient: AxiosInstance = axios.create({
  baseURL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
  // Gửi kèm cookie refresh HttpOnly (docs/21 A1)
  withCredentials: true,
});

// Request: gắn access token đang giữ trong bộ nhớ
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** Lời gọi mà 401 là kết quả nghiệp vụ, không phải token hết hạn: không làm mới rồi gọi lại */
const NO_REFRESH = ['/identity/login', '/identity/google', '/identity/refresh', '/identity/logout'];

let refreshing: Promise<string> | null = null;

/**
 * Xin access token mới bằng cookie refresh (docs/21 A2). Đang ở một công ty thì chọn lại
 * công ty đó để token mới mang đúng công ty. Nhiều request cùng gặp 401 thì dùng chung một lần làm mới.
 */
export function refreshAccessToken(): Promise<string> {
  refreshing ??= (async () => {
    const store = useAuthStore.getState();
    const { data } = await apiClient.post<RefreshResponse>('/identity/refresh');
    store.setToken(data.accessToken);
    const companyId = useAuthStore.getState().companyContext?.companyId;
    if (!companyId) return data.accessToken;
    const selected = await apiClient.post<SelectCompanyResponse>('/identity/select-company', {
      companyId,
    });
    useAuthStore.getState().setCompany(selected.data.accessToken, selected.data.context);
    return selected.data.accessToken;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

// Response: 401 → làm mới token rồi gọi lại một lần; hết phiên thì về đăng nhập
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ProblemDetails>) => {
    const status = error.response?.status;
    const code = error.response?.data?.code;
    const config = error.config as RetriableConfig | undefined;
    // Bỏ tiền tố BASE_PATH (staging /mock/) để so với route của app
    const path = '/' + window.location.pathname.slice(BASE_PATH.length);
    if (status === 401) {
      const url = config?.url ?? '';
      const canRetry =
        config && !config._retried && !NO_REFRESH.some((p) => url.startsWith(p));
      if (canRetry && useAuthStore.getState().account) {
        config._retried = true;
        try {
          await refreshAccessToken();
          return apiClient(config);
        } catch {
          // Cookie refresh cũng hết hạn: rơi xuống xoá phiên
        }
      }
      // Chỉ xoá phiên: RequireAuth tự chuyển về /login và nhớ trang đang mở để quay lại
      if (!url.startsWith('/identity/login') && !url.startsWith('/identity/google')) {
        useAuthStore.getState().clear();
      }
    } else if (
      status === 403 &&
      (code === 'company_locked' || code === 'account_locked') &&
      path.startsWith('/c/') &&
      // Chọn công ty bị từ chối: RequireCompany hiện lý do ngay trên trang (FE#2 AC-11)
      !config?.url?.startsWith('/identity/select-company')
    ) {
      useAuthStore.getState().leaveCompany();
      window.location.assign(appPath('select-company'));
    } else if (status === 403 && code === 'password_change_required') {
      // BE chặn mọi chức năng khi còn mật khẩu trong thư mời; guard sẽ mở trang đổi mật khẩu
      const account = useAuthStore.getState().account;
      if (account && !account.mustChangePassword) {
        useAuthStore.getState().setAccount({ ...account, mustChangePassword: true });
      }
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

/** Header `Retry-After` (giây) của lỗi 429; không có hoặc không phải số thì null */
export function retryAfterSeconds(error: unknown): number | null {
  if (!axios.isAxiosError(error)) return null;
  const seconds = Number(error.response?.headers?.['retry-after']);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'Không kết nối được máy chủ. Kiểm tra mạng hoặc VITE_API_BASE_URL.';
    const data = error.response.data as (ProblemDetails & { message?: string }) | string | undefined;
    if (data && typeof data === 'object') {
      if (data.code === 'not_implemented') return notImplementedMessage(data.issue, data.owner);
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
