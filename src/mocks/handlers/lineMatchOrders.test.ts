// Ghép SKU áp lên đơn đã nhận (FE#283, commerio-backend#237 PR 1, spec §5.4): dòng chưa ghép cùng gian hàng, cùng SKU
// người bán nhận ghép khi ghép có hiệu lực (200 hoặc CEO duyệt); 202 thì đơn giữ nguyên
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { listings, remoteSkus, unmanagedSkus } from '../channelData';
import { orders, type MockOrder } from '../salesData';
import { packages } from '../fulfillmentData';
import type { RemoteSku } from '@/types/shop';
import { shopHandlers } from './channel';

const server = setupServer(...shopHandlers);
const snapListings = structuredClone(listings);
const snapUnmanaged = structuredClone(unmanagedSkus);
const snapOrders = structuredClone(orders);
const snapPackages = structuredClone(packages);
beforeAll(async () => {
  vi.stubGlobal('location', new URL('http://localhost'));
  server.listen({ onUnhandledRequest: 'error' });
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
  orders.splice(0, orders.length, ...structuredClone(snapOrders));
  packages.splice(0, packages.length, ...structuredClone(snapPackages));
});

const CEO = 'acc-001';
const SALE = 'acc-002';
const BASE = 'http://localhost/api/v1/channel/shops/shp-001';
const FREE_VARIANT = 'prd-002-v2';

const call = (account: string, method: string, path: string, body?: object) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer mock.${account}.cmp-001.${Date.now()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

const oldTee = () => remoteSkus['shp-001']!.find((r) => r.sellerSku === 'OLD-TEE-01')!;

/** Đơn sàn có một dòng chưa ghép SKU OLD-TEE-01 */
function unmappedOrder(id: string, shopId = 'shp-001'): MockOrder {
  const base = structuredClone(orders.find((o) => o.source === 'marketplace' && o.shopId)!);
  const o: MockOrder = {
    ...base,
    id,
    code: id.toUpperCase(),
    shopId,
    status: 'unpaid',
    flags: ['unmapped_sku'],
    platform: undefined,
    lines: [{ id: `${id}-l1`, variantId: '', sku: '', productName: 'Áo thun oversize', quantity: 2, unitPrice: 99000, externalSku: 'OLD-TEE-01' }],
  };
  orders.push(o);
  return o;
}

const packagesOf = (orderId: string) => packages.filter((p) => p.orderId === orderId);

describe('Ghép SKU áp lên đơn đã nhận', () => {
  it('ghép với biến thể (200): dòng đơn có biến thể, tắt cờ, lập kiện; đơn gian hàng khác không đổi', async () => {
    const a = unmappedOrder('ord-m1');
    const b = unmappedOrder('ord-m2');
    const other = unmappedOrder('ord-m3', 'shp-003');
    const res = await call(SALE, 'POST', '/listings/match', { externalSkuId: oldTee().externalSkuId, variantId: FREE_VARIANT });
    expect(res.status).toBe(200);
    for (const o of [a, b]) {
      expect(o.lines[0]).toMatchObject({ variantId: FREE_VARIANT, sku: 'OLD-TEE-01' });
      expect(o.flags).not.toContain('unmapped_sku');
      expect(packagesOf(o.id)).toHaveLength(1);
      expect(packagesOf(o.id)[0]!.lines).toEqual([{ variantId: FREE_VARIANT, quantity: 2 }]);
    }
    expect(other.lines[0]!.variantId).toBe('');
    expect(other.flags).toContain('unmapped_sku');
  });

  it('Sale chọn "không quản tồn" (202): đơn giữ cờ; CEO duyệt thì dòng không quản tồn, kiện giữ hàng ngay', async () => {
    const o = unmappedOrder('ord-m4');
    const res = await call(SALE, 'POST', '/listings/match', { externalSkuId: oldTee().externalSkuId, variantId: null });
    expect(res.status).toBe(202);
    expect(o.lines[0]).toMatchObject({ variantId: '' });
    expect(o.lines[0]!.untracked).toBeFalsy();
    expect(o.flags).toContain('unmapped_sku');
    expect(packagesOf(o.id)).toHaveLength(0);

    const list = (await (await call(CEO, 'GET', '/remote-skus')).json()) as { items: RemoteSku[] };
    const r = list.items.find((x) => x.externalSkuId === oldTee().externalSkuId)!;
    const ok = await call(CEO, 'POST', `/listings/${r.listingId}/mapping/approve`, { version: r.listingVersion });
    expect(ok.status).toBe(200);
    expect(o.lines[0]).toMatchObject({ variantId: '', untracked: true });
    expect(o.flags).not.toContain('unmapped_sku');
    expect(packagesOf(o.id)[0]).toMatchObject({ status: 'reserved', lines: [{ variantId: '', quantity: 2 }] });
  });

  it('CEO chọn "không quản tồn": áp ngay (tự duyệt)', async () => {
    const o = unmappedOrder('ord-m5');
    const res = await call(CEO, 'POST', '/listings/match', { externalSkuId: oldTee().externalSkuId, variantId: null });
    expect(res.status).toBe(200);
    expect(o.lines[0]!.untracked).toBe(true);
    expect(o.flags).not.toContain('unmapped_sku');
  });

  it('ghép đã đúng: bấm lại vẫn áp cho đơn về trước (chạy bù)', async () => {
    await call(SALE, 'POST', '/listings/match', { externalSkuId: oldTee().externalSkuId, variantId: FREE_VARIANT });
    const late = unmappedOrder('ord-m6');
    const res = await call(SALE, 'POST', '/listings/match', { externalSkuId: oldTee().externalSkuId, variantId: FREE_VARIANT });
    expect(res.status).toBe(200);
    expect(late.lines[0]!.variantId).toBe(FREE_VARIANT);
  });
});
