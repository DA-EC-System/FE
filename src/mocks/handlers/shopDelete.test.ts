// Xoá gian hàng đã ngắt (FE#297, commerio-backend#398): quyền, chữ XOA, trạng thái, dữ liệu đi kèm bị xoá
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import type { ShopDeleteResult } from '@/types/shop';
import { db } from '../db';
import { listings, remoteSkus } from '../channelData';
import { orders } from '../salesData';
import { packages } from '../fulfillmentData';
import { requests } from '../returnsData';
import { lines as ledgerLines } from '../ledgerData';
import { statements } from '../settlementData';
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

const del = (shopId: string, body: unknown, account = 'acc-001', company = 'cmp-001') =>
  fetch(`http://localhost/api/v1/channel/shops/${shopId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer mock.${account}.${company}.${Date.now()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const versionOf = (id: string) => db.shops.find((s) => s.id === id)!.version;
const codeOf = async (res: Response) => ((await res.json()) as { code?: string }).code;

describe('DELETE /channel/shops/:id', () => {
  it('Admin, Sale: 403 dù có hay không quyền ngắt; gian hàng còn nguyên', async () => {
    for (const account of ['acc-005', 'acc-002']) {
      const res = await del('shp-008', { confirm: 'XOA', version: versionOf('shp-008') }, account);
      expect(res.status).toBe(403);
    }
    expect(db.shops.some((s) => s.id === 'shp-008')).toBe(true);
  });

  it('confirm thiếu hoặc khác đúng XOA: 422 errors.confirm', async () => {
    for (const confirm of [undefined, 'xoa', 'XÓA', ' XOA ']) {
      const res = await del('shp-008', { confirm, version: versionOf('shp-008') });
      expect(res.status).toBe(422);
      expect(((await res.json()) as { errors?: Record<string, string> }).errors?.confirm).toBeTruthy();
    }
  });

  it('gian hàng chưa ngắt: 409 shop_not_disconnected kèm current; version cũ: 409 version_conflict', async () => {
    const active = await del('shp-001', { confirm: 'XOA', version: versionOf('shp-001') });
    expect(active.status).toBe(409);
    const body = (await active.json()) as { code: string; current?: { status: string } };
    expect(body.code).toBe('shop_not_disconnected');
    expect(body.current?.status).toBe('active');
    const reauth = await del('shp-002', { confirm: 'XOA', version: versionOf('shp-002') });
    expect(await codeOf(reauth)).toBe('shop_not_disconnected');

    const stale = await del('shp-008', { confirm: 'XOA', version: versionOf('shp-008') - 1 });
    expect(stale.status).toBe(409);
    expect(await codeOf(stale)).toBe('version_conflict');
  });

  it('gian hàng công ty khác: 404', async () => {
    const res = await del('shp-004', { confirm: 'XOA', version: versionOf('shp-004') });
    expect(res.status).toBe(404);
  });

  it('CEO xoá gian hàng đã ngắt: mất gian hàng cùng đơn, kiện, yêu cầu trả, listing, sổ tiền, đối soát; trả số đã xoá', async () => {
    const shopId = 'shp-008';
    const order = { ...orders[0], id: 'ord-del-297', code: 'DH-DEL-297', shopId, status: 'cancelled' as const };
    orders.push(order);
    packages.push({ ...packages[0], id: 'pkg-del-297', orderId: order.id, status: 'cancelled' });
    requests.push({ ...requests[0], id: 'ret-del-297', orderId: order.id });
    ledgerLines.push({ ...ledgerLines[0], id: 'led-del-297', shopId, orderId: order.id });
    const listingCount = listings.filter((l) => l.shopId === shopId).length;
    expect(listingCount).toBeGreaterThan(0);
    expect(statements.some((s) => s.shopId === shopId)).toBe(true);

    const res = await del(shopId, { confirm: 'XOA', version: versionOf(shopId) });
    expect(res.status).toBe(200);
    const { deleted } = (await res.json()) as ShopDeleteResult;
    expect(deleted).toMatchObject({ orders: 1, packages: 1, returns: 1, listings: listingCount, ledgerEntries: 1 });

    expect(db.shops.some((s) => s.id === shopId)).toBe(false);
    expect(orders.some((o) => o.shopId === shopId)).toBe(false);
    expect(packages.some((p) => p.orderId === order.id)).toBe(false);
    expect(requests.some((r) => r.orderId === order.id)).toBe(false);
    expect(listings.some((l) => l.shopId === shopId)).toBe(false);
    expect(ledgerLines.some((l) => l.shopId === shopId)).toBe(false);
    expect(statements.some((s) => s.shopId === shopId)).toBe(false);
    expect(remoteSkus[shopId]).toBeUndefined();
    // Gian hàng khác không bị đụng
    expect(orders.some((o) => o.shopId === 'shp-001')).toBe(true);

    const again = await del(shopId, { confirm: 'XOA', version: 1 });
    expect(again.status).toBe(404);
  });
});
