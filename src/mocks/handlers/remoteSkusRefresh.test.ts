// Tải SKU sàn chạy nền (FE#265, BE#361; Documents/21 §18.3): mock theo hợp đồng 202 + hỏi lại
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import type { RemoteSkuList, RemoteSkusRefreshResult } from '@/types/shop';
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

describe('remote-skus chạy nền', () => {
  it('lần mở đầu: 200, chưa có bản sao, lượt đang chạy; xong thì GET trả danh sách', async () => {
    const first = (await (await call('GET', '/remote-skus')).json()) as RemoteSkuList;
    expect(first).toMatchObject({ syncedAt: null, items: [], refresh: { status: 'running', finishedAt: null, error: null } });

    const poll = await call('GET', '/remote-skus/refresh');
    expect(poll.headers.get('Retry-After')).toBe('1');
    expect(((await poll.json()) as RemoteSkusRefreshResult).refresh?.startedAt).toBe(first.refresh?.startedAt);

    // Lượt của mock xong sau vài giây: cho đồng hồ nhảy thay vì chờ
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10_000);
    const done = (await (await call('GET', '/remote-skus/refresh')).json()) as RemoteSkusRefreshResult;
    clock.mockRestore();
    expect(done.refresh).toMatchObject({ status: 'succeeded', startedAt: first.refresh?.startedAt });
    const list = (await (await call('GET', '/remote-skus')).json()) as RemoteSkuList;
    expect(list.syncedAt).toBe(done.refresh?.finishedAt);
    expect(list.items.length).toBeGreaterThan(0);
  });

  it('Tải lại: 202 kèm Retry-After, Location; bấm thêm khi đang chạy trả đúng lượt đó', async () => {
    const res = await call('POST', '/remote-skus/refresh');
    expect(res.status).toBe(202);
    expect(res.headers.get('Retry-After')).toBe('1');
    expect(res.headers.get('Location')).toMatch(/\/channel\/shops\/shp-001\/remote-skus\/refresh$/);
    const { refresh } = (await res.json()) as RemoteSkusRefreshResult;
    expect(refresh?.status).toBe('running');
    const again = (await (await call('POST', '/remote-skus/refresh')).json()) as RemoteSkusRefreshResult;
    expect(again.refresh?.startedAt).toBe(refresh?.startedAt);
  });

  it('không có quyền ghép SKU thì 403 ở cả ba route', async () => {
    // acc-010: Phân tích, không có listing.match
    for (const [m, p] of [['GET', '/remote-skus'], ['POST', '/remote-skus/refresh'], ['GET', '/remote-skus/refresh']]) {
      expect((await call(m, p, 'acc-010')).status).toBe(403);
    }
  });
});
