/** Cờ bật agentation (ghi chú UI cho AI agent) trên bản build. Dev luôn bật; bản build chỉ bật khi localStorage có `agentation=1` (#423) */
export const AGENTATION_FLAG_KEY = 'agentation';
export const DEFAULT_AGENTATION_ENDPOINT = 'http://localhost:4747';

type FlagStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * `?agentation=1` lưu cờ, `?agentation=0` xoá cờ, không có tham số thì giữ cờ cũ.
 * Trả về bật hay tắt. Storage lỗi (chế độ riêng tư, chặn site data) thì coi như tắt, trừ khi đang dev.
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

/** Endpoint MCP server của agentation; biến rỗng thì dùng mặc định */
export function agentationEndpoint(value: string | undefined): string {
  const v = value?.trim();
  return v ? v : DEFAULT_AGENTATION_ENDPOINT;
}

/** localStorage có thể ném lỗi ngay khi truy cập (Safari riêng tư, chặn cookie) */
export function safeLocalStorage(): FlagStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
