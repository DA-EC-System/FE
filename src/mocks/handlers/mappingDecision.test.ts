// CEO duyệt, từ chối ghép chờ (FE#262; Documents/21 §18.6.5, POST listings/:listingId/mapping/:action)
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { listings, remoteSkus, unmanagedSkus } from '../channelData';
import type { ChannelListing, RemoteSku } from '@/types/shop';
import { shopHandlers } from './channel';

const server = setupServer(...shopHandlers);
const snapListings = structuredClone(listings);
const snapUnmanaged = structuredClone(unmanagedSkus);
beforeAll(async () => {
  vi.stubGlobal('location', new URL('http://localhost'));
  server.listen({ onUnhandledRequest: 'error' });
  // Lần GET remote-skus đầu tự bắt đầu lượt tải chạy nền (BE#361), xong mới có danh sách: cho đồng hồ đi qua lượt đó
  await call(CEO, 'GET', '/remote-skus');
  const now = Date.now.bind(Date);
  vi.spyOn(Date, 'now').mockImplementation(() => now() + 60_000);
});
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
beforeEach(() => {
  listings.splice(0, listings.length, ...structuredClone(snapListings));
  unmanagedSkus.splice(0, unmanagedSkus.length, ...structuredClone(snapUnmanaged));
});

const CEO = 'acc-001';
const SALE = 'acc-002';
const BASE = 'http://localhost/api/v1/channel/shops/shp-001';

const call = (account: string, method: string, path: string, body?: object) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer mock.${account}.cmp-001.${Date.now()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

const remote = async (externalSkuId: string) => {
  const res = await call(CEO, 'GET', '/remote-skus');
  expect(res.status).toBe(200);
  return ((await res.json()) as { items: RemoteSku[] }).items.find((r) => r.externalSkuId === externalSkuId)!;
};

/** SKU sàn cũ chưa ghép của Shopee (OLD-TEE-01) */
const oldTee = () => remoteSkus['shp-001']!.find((r) => r.sellerSku === 'OLD-TEE-01')!;

/** Sale xin đặt SKU sàn cũ là "không quản tồn": luôn cần CEO duyệt nên BE lưu ghép chờ, trả 202 */
async function saleRequestsUnmanaged() {
  const res = await call(SALE, 'POST', '/listings/match', { externalSkuId: oldTee().externalSkuId, variantId: null });
  expect(res.status).toBe(202);
  const r = await remote(oldTee().externalSkuId);
  expect(r).toMatchObject({ mode: null, pendingMapping: { variantId: null, externalSkuId: null } });
  return r;
}

const decide = (account: string, r: RemoteSku, action: string, body: object) =>
  call(account, 'POST', `/listings/${r.listingId}/mapping/${action}`, body);

describe('Duyệt ghép chờ', () => {
  it('CEO duyệt: "không quản tồn" có hiệu lực, hết ghép chờ', async () => {
    const r = await saleRequestsUnmanaged();
    const res = await decide(CEO, r, 'approve', { version: r.listingVersion });
    expect(res.status).toBe(200);
    expect(((await res.json()) as ChannelListing).pendingMapping).toBeNull();
    expect(await remote(r.externalSkuId)).toMatchObject({ mode: 'unmanaged', pendingMapping: null });
  });

  it('CEO duyệt ghép chờ của listing đã ghép: đổi sang biến thể xin ghép', async () => {
    const l = listings.find((x) => x.shopId === 'shp-001' && x.externalSkuId && x.status === 'live')!;
    const variantId = 'prd-002-v2';
    expect(listings.some((x) => x.shopId === 'shp-001' && x.variantId === variantId)).toBe(false);
    l.pendingMapping = { variantId, externalSkuId: null, requestedBy: { id: SALE, name: 'Sale' }, requestedAt: new Date().toISOString() };
    const res = await call(CEO, 'POST', `/listings/${l.id}/mapping/approve`, { version: l.version });
    expect(res.status).toBe(200);
    expect(l).toMatchObject({ variantId, pendingMapping: null });
  });

  it('không phải CEO thì 403', async () => {
    const r = await saleRequestsUnmanaged();
    expect((await decide(SALE, r, 'approve', { version: r.listingVersion })).status).toBe(403);
  });

  it('sai phiên bản thì 409 version_conflict kèm listing mới nhất', async () => {
    const r = await saleRequestsUnmanaged();
    const res = await decide(CEO, r, 'approve', { version: r.listingVersion! - 1 });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; current: ChannelListing };
    expect(body.code).toBe('version_conflict');
    expect(body.current.version).toBe(r.listingVersion);
  });
});

describe('Từ chối ghép chờ', () => {
  it('thiếu lý do thì 422 errors.reason', async () => {
    const r = await saleRequestsUnmanaged();
    const res = await decide(CEO, r, 'reject', { version: r.listingVersion, reason: '  ' });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { errors: Record<string, string> }).errors.reason).toBeTruthy();
  });

  it('có lý do: SKU sàn về lại Chưa ghép', async () => {
    const r = await saleRequestsUnmanaged();
    const res = await decide(CEO, r, 'reject', { version: r.listingVersion, reason: 'SKU này vẫn bán' });
    expect(res.status).toBe(200);
    expect(await remote(r.externalSkuId)).toMatchObject({ mode: null, listingId: null, pendingMapping: null });
  });

  it('listing đã ghép bị từ chối thì giữ ghép cũ; xử lý lần nữa là 409 invalid_transition', async () => {
    const l = listings.find((x) => x.shopId === 'shp-001' && x.externalSkuId && x.status === 'live')!;
    const old = l.variantId;
    l.pendingMapping = { variantId: null, externalSkuId: null, requestedBy: { id: SALE, name: 'Sale' }, requestedAt: new Date().toISOString() };
    const res = await call(CEO, 'POST', `/listings/${l.id}/mapping/reject`, { version: l.version, reason: 'Không đổi' });
    expect(res.status).toBe(200);
    expect(l).toMatchObject({ variantId: old, pendingMapping: null });
    const again = await call(CEO, 'POST', `/listings/${l.id}/mapping/approve`, { version: l.version });
    expect(again.status).toBe(409);
    expect(((await again.json()) as { code: string }).code).toBe('invalid_transition');
  });
});
