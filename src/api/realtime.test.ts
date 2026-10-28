import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectRealtime, createSseParser, type RealtimeMessage, type RealtimeStatus } from './realtime';

const msg = (eventId: string, type = 'sales.order_created') =>
  JSON.stringify({ eventId, type, occurredAt: '2026-10-28T00:00:00Z', payload: { code: eventId } });

const frame = (eventId: string, type = 'sales.order_created') => `event: ${type}\nid: ${eventId}\ndata: ${msg(eventId, type)}\n\n`;

/** Response SSE: đẩy từng chunk; `hold` thì giữ stream mở tới khi bị huỷ */
function sse(chunks: string[], { hold = false } = {}) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      if (!hold) controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(check()).toBe(true);
};

function setup(responses: (() => Response | Promise<Response>)[], extra: { refresh?: () => Promise<unknown> } = {}) {
  const messages: RealtimeMessage[] = [];
  const statuses: RealtimeStatus[] = [];
  const onReconnect = vi.fn();
  const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const next = responses.shift();
    if (!next) {
      // Hết kịch bản: treo tới khi bị huỷ
      return new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
      );
    }
    return next();
  });
  let token = 'tok-1';
  const refresh = vi.fn(
    extra.refresh ??
      (async () => {
        token = 'tok-2';
      }),
  );
  const stop = connectRealtime({
    onMessage: (m) => messages.push(m),
    onStatus: (s) => statuses.push(s),
    onReconnect,
    fetchImpl: fetchImpl as typeof fetch,
    getToken: () => token,
    refresh,
    delays: [1, 1, 1],
  });
  return { messages, statuses, onReconnect, fetchImpl, refresh, stop };
}

let stops: (() => void)[] = [];
afterEach(() => {
  stops.forEach((s) => s());
  stops = [];
});

describe('createSseParser', () => {
  it('tách event, id, data; bỏ chú thích và retry', () => {
    const got: [string, string, string | null][] = [];
    const p = createSseParser((e, d, id) => got.push([e, d, id]));
    p.feed('retry: 3000\n\n: ping\n\nevent: a.b\nid: 1\ndata: {"x":1}\n\n');
    expect(got).toEqual([['a.b', '{"x":1}', '1']]);
  });

  it('message cắt giữa chừng qua nhiều chunk, xuống dòng CRLF', () => {
    const got: string[] = [];
    const p = createSseParser((_e, d) => got.push(d));
    p.feed('event: x\r\nda');
    p.feed('ta: một\r\ndata: hai\r');
    expect(got).toEqual([]);
    p.feed('\n\r\n');
    expect(got).toEqual(['một\nhai']);
  });

  it('không có data thì không phát; thiếu event thì là message', () => {
    const got: string[] = [];
    const p = createSseParser((e) => got.push(e));
    p.feed('event: rỗng\n\ndata: 1\n\n');
    expect(got).toEqual(['message']);
  });
});

describe('connectRealtime', () => {
  it('gửi Bearer, nhận sự kiện, bỏ bản trùng theo id', async () => {
    const t = setup([() => sse([frame('e1'), frame('e1'), frame('e2')], { hold: true })]);
    stops.push(t.stop);
    await until(() => t.messages.length === 2);
    expect(t.messages.map((m) => m.eventId)).toEqual(['e1', 'e2']);
    expect(t.statuses).toEqual(['connecting', 'open']);
    const init = t.fetchImpl.mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
    expect(String(t.fetchImpl.mock.calls[0]![0])).toMatch(/\/notification\/stream$/);
  });

  it('401: làm mới token rồi nối lại bằng token mới', async () => {
    const t = setup([() => new Response(null, { status: 401 }), () => sse([frame('e1')], { hold: true })]);
    stops.push(t.stop);
    await until(() => t.messages.length === 1);
    expect(t.refresh).toHaveBeenCalledTimes(1);
    const auth = (i: number) => (t.fetchImpl.mock.calls[i]![1]!.headers as Record<string, string>).Authorization;
    expect([auth(0), auth(1)]).toEqual(['Bearer tok-1', 'Bearer tok-2']);
  });

  it('làm mới token lỗi thì dừng', async () => {
    const t = setup([() => new Response(null, { status: 401 })], {
      refresh: () => Promise.reject(new Error('hết phiên')),
    });
    await until(() => t.statuses.at(-1) === 'off');
    expect(t.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('vẫn 401 sau khi làm mới, hoặc 403, thì dừng', async () => {
    const a = setup([() => new Response(null, { status: 401 }), () => new Response(null, { status: 401 })]);
    await until(() => a.statuses.at(-1) === 'off');
    expect(a.fetchImpl).toHaveBeenCalledTimes(2);
    const b = setup([() => new Response(null, { status: 403 })]);
    await until(() => b.statuses.at(-1) === 'off');
    expect(b.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('mất kết nối thì nối lại, báo onReconnect để tải lại dữ liệu', async () => {
    const t = setup([
      () => sse([frame('e1')]),
      () => Promise.reject(new TypeError('mạng lỗi')),
      () => new Response(null, { status: 502 }),
      () => sse([frame('e2')], { hold: true }),
    ]);
    stops.push(t.stop);
    await until(() => t.messages.length === 2);
    expect(t.fetchImpl).toHaveBeenCalledTimes(4);
    expect(t.onReconnect).toHaveBeenCalledTimes(1);
    expect(t.statuses).toEqual(['connecting', 'open', 'reconnecting', 'reconnecting', 'reconnecting', 'open']);
  });

  it('dừng thì huỷ request và không nối lại', async () => {
    const t = setup([() => sse([], { hold: true })]);
    await until(() => t.statuses.includes('open'));
    t.stop();
    expect(t.statuses.at(-1)).toBe('off');
    await new Promise((r) => setTimeout(r, 20));
    expect(t.fetchImpl).toHaveBeenCalledTimes(1);
    expect(t.fetchImpl.mock.calls[0]![1]!.signal!.aborted).toBe(true);
  });
});
