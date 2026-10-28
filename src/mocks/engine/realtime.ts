/**
 * Kênh realtime giả lập (FE#81): thay Kafka + tiến trình realtime của BE.
 * Handler `/notification/stream` đăng ký theo công ty; nơi đổi dữ liệu gọi `emitRealtime`.
 * Frame giống BE (`formatEvent` ở core/notification/service/hub.ts).
 */

type Listener = (frame: string) => void;

const listeners = new Map<string, Set<Listener>>();
let seq = 0;

export function subscribeRealtime(companyId: string, listener: Listener): () => void {
  let set = listeners.get(companyId);
  if (!set) listeners.set(companyId, (set = new Set()));
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

export function emitRealtime(companyId: string, type: string, payload: Record<string, unknown> = {}) {
  const message = { eventId: `rt-${++seq}`, type, occurredAt: new Date().toISOString(), payload };
  const frame = `event: ${type}\nid: ${message.eventId}\ndata: ${JSON.stringify(message)}\n\n`;
  for (const listener of listeners.get(companyId) ?? []) listener(frame);
}
