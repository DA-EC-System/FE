/**
 * Kênh realtime: đọc SSE `GET /notification/stream` (Documents/21 §13, D11, FE#81).
 * Dùng `fetch` kèm Bearer thay vì `EventSource` vì EventSource không gửi được header Authorization.
 * BE đóng stream đúng lúc access token hết hạn; client làm mới token rồi nối lại.
 */

import { refreshAccessToken } from './client';
import { useAuthStore } from '@/stores/authStore';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

/** Thân `data` của một message (BE `NotificationMessage`) */
export interface RealtimeMessage {
  eventId: string;
  type: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export type RealtimeStatus = 'off' | 'connecting' | 'open' | 'reconnecting';

/** Độ trễ nối lại khi lỗi liên tiếp (giây): 1, 2, 5, 10, rồi giữ 30 */
export const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10_000, 30_000];

/** Stream sống ngắn hơn mức này rồi đóng thì coi như lỗi, để không nối lại liên tục */
const MIN_HEALTHY_MS = 5000;

/**
 * Bộ tách SSE theo đặc tả: gom `event:`, `id:`, `data:` tới dòng trống thì phát một message.
 * Bỏ dòng chú thích (`: ping`), `retry:`, và message không có `data`.
 */
export function createSseParser(onMessage: (event: string, data: string, id: string | null) => void) {
  let buffer = '';
  let event = '';
  let id: string | null = null;
  let data: string[] = [];

  const dispatch = () => {
    if (data.length) onMessage(event || 'message', data.join('\n'), id);
    event = '';
    id = null;
    data = [];
  };

  const line = (text: string) => {
    if (text === '') return dispatch();
    if (text.startsWith(':')) return;
    const colon = text.indexOf(':');
    const field = colon === -1 ? text : text.slice(0, colon);
    let value = colon === -1 ? '' : text.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
    else if (field === 'id') id = value;
  };

  return {
    feed(chunk: string) {
      buffer += chunk;
      const lines = buffer.split(/\r\n|\r|\n/);
      // Dòng cuối có thể chưa đủ: giữ lại chờ chunk sau
      buffer = lines.pop() ?? '';
      lines.forEach(line);
    },
  };
}

export interface ConnectOptions {
  onMessage: (message: RealtimeMessage) => void;
  onStatus: (status: RealtimeStatus) => void;
  /** Nối lại sau khi mất kết nối: có thể đã lỡ sự kiện, cần tải lại dữ liệu (T14) */
  onReconnect: () => void;
  /** Test thay được */
  fetchImpl?: typeof fetch;
  getToken?: () => string | null;
  refresh?: () => Promise<unknown>;
  delays?: number[];
}

/**
 * Mở stream và tự nối lại tới khi gọi hàm trả về.
 * - 401: làm mới token rồi nối lại ngay; làm mới lỗi, hoặc vẫn 401 sau khi làm mới, thì dừng.
 * - 403/404: dừng (công ty bị khoá, chưa chọn công ty, mất quyền truy cập).
 * - Lỗi mạng, 5xx, stream đứt: nối lại theo `delays`.
 */
export function connectRealtime({
  onMessage,
  onStatus,
  onReconnect,
  fetchImpl = (...args) => fetch(...args),
  getToken = () => useAuthStore.getState().accessToken,
  refresh = refreshAccessToken,
  delays = RECONNECT_DELAYS_MS,
}: ConnectOptions): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  // BE gửi `id` = eventId để bỏ bản trùng; giữ một ít id gần nhất là đủ
  const seen: string[] = [];

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      });
    });

  const handle = (data: string, id: string | null) => {
    let message: RealtimeMessage;
    try {
      message = JSON.parse(data) as RealtimeMessage;
    } catch {
      return;
    }
    const eventId = id ?? message.eventId;
    if (eventId) {
      if (seen.includes(eventId)) return;
      seen.push(eventId);
      if (seen.length > 200) seen.shift();
    }
    onMessage(message);
  };

  void (async () => {
    let failures = 0;
    let refreshed = false;
    let everOpened = false;
    while (!signal.aborted) {
      onStatus(everOpened || failures ? 'reconnecting' : 'connecting');
      let healthy = false;
      try {
        const token = getToken();
        const res = await fetchImpl(`${baseURL}/notification/stream`, {
          headers: { Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          credentials: 'same-origin',
          cache: 'no-store',
          signal,
        });
        if (res.status === 401 && !refreshed) {
          refreshed = true;
          try {
            await refresh();
          } catch {
            // Phiên đã hết: interceptor của apiClient đưa về đăng nhập
            break;
          }
          continue;
        }
        if (res.status === 401 || res.status === 403 || res.status === 404) break;
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);

        refreshed = false;
        onStatus('open');
        if (everOpened) onReconnect();
        everOpened = true;
        const openedAt = Date.now();
        const parser = createSseParser((_event, data, id) => handle(data, id));
        const reader = res.body.getReader();
        signal.addEventListener('abort', () => void reader.cancel().catch(() => undefined));
        const decoder = new TextDecoder();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          parser.feed(decoder.decode(value, { stream: true }));
        }
        healthy = Date.now() - openedAt >= MIN_HEALTHY_MS;
      } catch {
        // Lỗi mạng hoặc stream đứt: nối lại theo độ trễ
      }
      if (signal.aborted) break;
      failures = healthy ? 0 : failures + 1;
      if (failures) await wait(delays[Math.min(failures - 1, delays.length - 1)] ?? 0);
    }
    if (!signal.aborted) onStatus('off');
  })();

  return () => {
    controller.abort();
    onStatus('off');
  };
}
