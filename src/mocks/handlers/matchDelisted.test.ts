// Ghép SKU sàn vào biến thể đã gỡ (FE#310): BE bỏ qua listing delisted khi tìm chỗ của biến thể, tạo listing mới
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { listings, remoteSkus, unmanagedSkus } from '../channelData';
import type { ChannelListing, ListingRow, RemoteSku } from '@/types/shop';
import { shopHandlers } from './channel';

const server = setupServer(...shopHandlers);
const CEO = 'acc-001';
const BASE = 'http://localhost/api/v1/channel/shops/shp-001';

const call = (method: string, path: string, body?: object) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer mock.${CEO}.cmp-001.${Date.now()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

beforeAll(async () => {
  vi.stubGlobal('location', new URL('http://localhost'));
  server.listen({ onUnhandledRequest: 'error' });
  // Lần GET remote-skus đầu tự bắt đầu lượt tải chạy nền: cho đồng hồ đi qua lượt đó
  await call('GET', '/remote-skus');
  const now = Date.now.bind(Date);
  vi.spyOn(Date, 'now').mockImplementation(() => now() + 60_000);
});
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST listings/match vào biến thể có listing đã gỡ', () => {
  it('tạo listing mới live; GET listings trả listing mới cho biến thể; SKU sàn hết chưa ghép', async () => {
    const old = listings.find((l) => l.shopId === 'shp-001' && l.status === 'live')!;
    const delist = await call('POST', `/listings/${old.variantId}/delist`, { version: old.version });
    expect(delist.status).toBe(200);
    expect(old.status).toBe('delisted');

    const free = (remoteSkus['shp-001'] ?? []).find(
      (r) =>
        r.sellerSku &&
        !listings.some((l) => l.shopId === 'shp-001' && l.externalSkuId === r.externalSkuId) &&
        !unmanagedSkus.some((u) => u.shopId === 'shp-001' && u.externalSkuId === r.externalSkuId),
    )!;
    expect(free).toBeTruthy();

    const res = await call('POST', '/listings/match', { externalSkuId: free.externalSkuId, variantId: old.variantId });
    expect(res.status).toBe(200);
    const saved = (await res.json()) as ChannelListing;
    expect(saved).toMatchObject({ externalSkuId: free.externalSkuId, status: 'live' });
    expect(saved.id).not.toBe(old.id);
    expect(old.status).toBe('delisted');

    const rows = ((await (await call('GET', '/listings')).json()) as { items: ListingRow[] }).items;
    expect(rows.find((r) => r.variantId === old.variantId)!.listing).toMatchObject({ id: saved.id, status: 'live' });

    const remote = ((await (await call('GET', '/remote-skus')).json()) as { items: RemoteSku[] }).items;
    expect(remote.find((r) => r.externalSkuId === free.externalSkuId)!.matchedVariantId).toBe(old.variantId);
  });
});
