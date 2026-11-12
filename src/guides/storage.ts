/**
 * Trạng thái đã xem hướng dẫn, lưu localStorage theo người dùng: `commerio.guide.<userId>.<key>` = version.
 * localStorage có thể bị chặn (trình duyệt riêng tư) nên mọi lần đọc/ghi bọc try/catch; lỗi thì coi như chưa xem.
 */
const PREFIX = 'commerio.guide.';
/** Đặt `off` để tắt hẳn việc tự hiện (E2E đặt sẵn qua storageState) */
export const GUIDES_OFF_KEY = 'commerio.guides';

export const seenKey = (userId: string, key: string) => `${PREFIX}${userId}.${key}`;

export function hasSeen(userId: string, key: string, version: number): boolean {
  try {
    const raw = localStorage.getItem(seenKey(userId, key));
    return raw !== null && Number(raw) >= version;
  } catch {
    return false;
  }
}

export function markSeen(userId: string, key: string, version: number): void {
  try {
    localStorage.setItem(seenKey(userId, key), String(version));
  } catch {
    // Không lưu được thì lần sau hiện lại, không sao
  }
}

/** "Bật lại tất cả hướng dẫn": xoá mọi khoá đã xem của người dùng */
export function resetAllSeen(userId: string): void {
  try {
    const own = `${PREFIX}${userId}.`;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(own)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    if (localStorage.getItem(GUIDES_OFF_KEY) === 'off') localStorage.removeItem(GUIDES_OFF_KEY);
  } catch {
    // bỏ qua
  }
}

/** Tắt tự hiện: build đặt `VITE_GUIDES=off`, hoặc localStorage `commerio.guides=off` */
export function guidesAutoOff(): boolean {
  if (import.meta.env.VITE_GUIDES === 'off') return true;
  try {
    return localStorage.getItem(GUIDES_OFF_KEY) === 'off';
  } catch {
    return false;
  }
}
