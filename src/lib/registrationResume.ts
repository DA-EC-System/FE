/**
 * Giữ màn nhập mã đăng ký khi tải lại trang (FE#468, lỗi N2 ở kiem-lai-24-11): lưu lần đăng ký đang chờ mã trong
 * sessionStorage, đóng tab là hết. Không lưu mật khẩu hay chữ trên form, chỉ mã lần đăng ký, email và giờ hết hạn.
 */
import type { RegistrationStatus } from '@/types/auth';

export interface PendingRegistration {
  email: string;
  status: RegistrationStatus;
}

const KEY = 'commerio_pending_registration';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStore(): Store | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function savePendingRegistration(value: PendingRegistration, store: Store | null = defaultStore()) {
  try {
    store?.setItem(KEY, JSON.stringify(value));
  } catch {
    // Trình duyệt chặn bộ nhớ: chỉ không giữ được khi tải lại
  }
}

export function clearPendingRegistration(store: Store | null = defaultStore()) {
  try {
    store?.removeItem(KEY);
  } catch {
    // bỏ qua
  }
}

/** Lần đăng ký đang chờ mã; đã quá hạn lần đăng ký (30 phút) hoặc dữ liệu hỏng thì xoá và trả null */
export function loadPendingRegistration(now = Date.now(), store: Store | null = defaultStore()): PendingRegistration | null {
  let raw: string | null = null;
  try {
    raw = store?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PendingRegistration>;
    const s = v.status;
    const expires = s ? Date.parse(s.registrationExpiresAt) : NaN;
    if (typeof v.email === 'string' && s && typeof s.registrationId === 'string' && expires > now) {
      return { email: v.email, status: s };
    }
  } catch {
    // rơi xuống xoá
  }
  clearPendingRegistration(store);
  return null;
}
