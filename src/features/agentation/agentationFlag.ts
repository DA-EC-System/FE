/**
 * Agentation (ghi chú UI cho AI agent), #423.
 * - Cờ "được phép dùng": dev luôn được phép; bản build chỉ được phép khi localStorage có `agentation=1`.
 * - Bật/tắt thanh công cụ: nhớ theo tab (sessionStorage), mặc định TẮT; thanh chạy nền làm trang chậm.
 */
export const AGENTATION_FLAG_KEY = 'agentation';
export const AGENTATION_ON_KEY = 'agentation.on';
export const DEFAULT_AGENTATION_ENDPOINT = 'http://localhost:4747';

type FlagStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * `?agentation=1` lưu cờ, `?agentation=0` xoá cờ, không có tham số thì giữ cờ cũ.
 * Trả về có được phép dùng không. Storage lỗi (chế độ riêng tư, chặn site data) thì coi như không, trừ khi đang dev.
 */
export function resolveAgentationFlag(search: string, storage: FlagStorage | null, isDev: boolean): boolean {
  if (isDev) return true;
  if (!storage) return false;
  try {
    const param = new URLSearchParams(search).get(AGENTATION_FLAG_KEY);
    if (param === '1') storage.setItem(AGENTATION_FLAG_KEY, '1');
    else if (param === '0') storage.removeItem(AGENTATION_FLAG_KEY);
    return storage.getItem(AGENTATION_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

/** Thanh công cụ đang bật ở tab này không; chưa ghi hoặc storage lỗi thì tắt */
export function readAgentationOn(storage: FlagStorage | null): boolean {
  try {
    return storage?.getItem(AGENTATION_ON_KEY) === '1';
  } catch {
    return false;
  }
}

/** Ghi trạng thái bật/tắt cho tab này; tắt thì xoá khoá để về mặc định */
export function writeAgentationOn(storage: FlagStorage | null, on: boolean): void {
  try {
    if (on) storage?.setItem(AGENTATION_ON_KEY, '1');
    else storage?.removeItem(AGENTATION_ON_KEY);
  } catch {
    // storage không ghi được: chỉ mất phần nhớ theo tab, bật/tắt vẫn chạy
  }
}

type KeyLike = Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'repeat'>;

/**
 * Phím tắt bật/tắt: Ctrl+Alt+A (macOS: Control+Option+A). Theo `code` nên không phụ thuộc bàn phím, bộ gõ.
 * Không dùng Ctrl+Shift+A (Chrome: tìm tab), Alt+Shift+A (Chrome: focus hộp thoại), Ctrl+K, Ctrl+B (app).
 */
export function isAgentationShortcut(e: KeyLike): boolean {
  return e.code === 'KeyA' && e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey && !e.repeat;
}

/** Endpoint MCP server của agentation; biến rỗng thì dùng mặc định */
export function agentationEndpoint(value: string | undefined): string {
  const v = value?.trim();
  return v ? v : DEFAULT_AGENTATION_ENDPOINT;
}

/** localStorage, sessionStorage có thể ném lỗi ngay khi truy cập (Safari riêng tư, chặn cookie) */
export function safeStorage(kind: 'localStorage' | 'sessionStorage'): FlagStorage | null {
  try {
    return typeof window === 'undefined' ? null : window[kind];
  } catch {
    return null;
  }
}
