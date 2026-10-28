import { http, HttpResponse } from 'msw';
import { subscribeRealtime } from '../engine/realtime';
import { API, requireCompany } from './utils';

// ---------- Kênh realtime (Documents/21 §13, FE#81) ----------
// BE lọc theo quyền của người nghe; mock gửi mọi sự kiện của công ty.

export const notificationHandlers = [
  http.get(`${API}/notification/stream`, ({ request }) => {
    const guard = requireCompany(request, null);
    if (!guard.ok) return guard.response;
    const encoder = new TextEncoder();
    let unsubscribe = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('retry: 3000\n\n'));
        unsubscribe = subscribeRealtime(guard.value.companyId, (frame) => {
          try {
            controller.enqueue(encoder.encode(frame));
          } catch {
            // Client đã đóng stream
            unsubscribe();
          }
        });
        request.signal.addEventListener('abort', () => {
          unsubscribe();
          try {
            controller.close();
          } catch {
            // Đã đóng
          }
        });
      },
      cancel() {
        unsubscribe();
      },
    });
    return new HttpResponse(stream, {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' },
    });
  }),
];
