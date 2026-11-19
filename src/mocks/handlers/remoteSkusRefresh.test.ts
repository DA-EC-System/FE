// Tải SKU sàn chạy nền (FE#265, FE#315, BE#361; Documents/21 §18.3): mock theo hợp đồng BE, POST trả cùng hình GET
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import type { RemoteSkuList } from '@/types/shop';
import { remoteSkusPollMs, REMOTE_REFRESH_POLL_MS } from '@/api/shops.api';
import { shopHandlers } from './channel';

const server = setupServer(...shopHandlers);
beforeAll(() => {
  vi.stubGlobal('location', new URL('http://localhost'));
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});

const BASE = 'http://localhost/api/v1/channel/shops/shp-001';
const call = (method: string, path: string, account = 'acc-001') =>
  fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer mock.${account}.cmp-001.${Date.now()}` } });

/** Cho đồng hồ nhảy qua mốc xong của lượt mock thay vì chờ */
async function sauKhiXong<T>(fn: () => Promise<T>): Promise<T> {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10_000);
  try {
    return await fn();
  } finally {
    clock.mockRestore();
  }
}

describe('remote-skus chạy nền', () => {
  it('lần mở đầu: 200, chưa có bản sao, lượt đang chạy; xong thì GET trả danh sách, refresh idle', async () => {
    const first = (await (await call('GET', '/remote-skus')).json()) as RemoteSkuList;
    expect(first).toMatchObject({ syncedAt: null, items: [], refresh: { status: 'running', error: null } });
    expect(first.refresh?.requestedAt).toBeTruthy();
    expect(remoteSkusPollMs(first)).toBe(REMOTE_REFRESH_POLL_MS);

    const list = await sauKhiXong(async () => (await call('GET', '/remote-skus')).json() as Promise<RemoteSkuList>);
    expect(list.refresh).toEqual({ status: 'idle', requestedAt: null, error: null, retryAfterSeconds: null });
    expect(list.syncedAt).toBeTruthy();
    expect(list.items.length).toBeGreaterThan(0);
    // Hết running thì thôi hỏi lại (FE#315: nút Tải lại không kẹt)
    expect(remoteSkusPollMs(list)).toBe(false);
  });

  it('Tải lại: 202 kèm danh sách đang có và lượt running; bấm thêm khi đang chạy trả đúng lượt đó', async () => {
    const res = await call('POST', '/remote-skus/refresh');
    expect(res.status).toBe(202);
    const body = (await res.json()) as RemoteSkuList;
    expect(body.refresh?.status).toBe('running');
    expect(body.items.length).toBeGreaterThan(0);
    const again = (await (await call('POST', '/remote-skus/refresh')).json()) as RemoteSkuList;
    expect(again.refresh?.requestedAt).toBe(body.refresh?.requestedAt);
    const done = await sauKhiXong(async () => (await call('GET', '/remote-skus')).json() as Promise<RemoteSkuList>);
    expect(done.refresh?.status).toBe('idle');
  });

  it('không có route GET remote-skus/refresh (BE không có): FE chỉ hỏi lại GET remote-skus', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await call('GET', '/remote-skus/refresh').catch(() => null);
    consoleError.mockRestore();
    expect(res === null || res.status >= 400).toBe(true);
  });

  it('không có quyền ghép SKU thì 403', async () => {
    // acc-010: Phân tích, không có listing.match
    for (const [m, p] of [['GET', '/remote-skus'], ['POST', '/remote-skus/refresh']]) {
      expect((await call(m, p, 'acc-010')).status).toBe(403);
    }
  });
});

describe('remoteSkusPollMs', () => {
  it('chỉ hỏi lại khi running', () => {
    const r = (status: 'idle' | 'running' | 'failed'): RemoteSkuList => ({
      syncedAt: null,
      items: [],
      refresh: { status, requestedAt: null, error: null, retryAfterSeconds: null },
    });
    expect(remoteSkusPollMs(r('running'))).toBe(REMOTE_REFRESH_POLL_MS);
    expect(remoteSkusPollMs(r('idle'))).toBe(false);
    expect(remoteSkusPollMs(r('failed'))).toBe(false);
    expect(remoteSkusPollMs(undefined)).toBe(false);
    expect(remoteSkusPollMs({ syncedAt: null, items: [] })).toBe(false);
  });
});
