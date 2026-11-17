// Sàn đổi listing ngoài app (FE#264, commerio-backend#360, 21 §18.3): sự kiện sàn giả lập và route outside-change
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import type { ListingRow } from '@/types/shop';
import { db } from '../db';
import { listings } from '../channelData';
import { products } from '../catalogData';
import { pricelists } from '../pricingData';
import { fireMarketplaceEvent } from '../engine/marketplace';
import { setListingsHidden, shopHandlers } from './channel';

const server = setupServer(...shopHandlers);
const snapListings = structuredClone(listings);
const snapProducts = structuredClone(products);
const snapPricelists = structuredClone(pricelists);
beforeAll(() => {
  vi.stubGlobal('location', new URL('http://localhost'));
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  listings.splice(0, listings.length, ...structuredClone(snapListings));
  products.splice(0, products.length, ...structuredClone(snapProducts));
  pricelists.splice(0, pricelists.length, ...structuredClone(snapPricelists));
});

const CEO = 'acc-001';
const ADMIN = 'acc-005';

const call = (path: string, method = 'GET', body?: unknown, account = CEO) =>
  fetch(`http://localhost/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer mock.${account}.cmp-001.${Date.now()}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const fire = (type: string, shopId: string, sku?: string) => {
  const r = fireMarketplaceEvent(type, {
    companyId: 'cmp-001',
    shop: db.shops.find((s) => s.id === shopId)!,
    params: sku ? { sku } : {},
  });
  if (!r.ok) throw new Error(r.message);
};

const row = async (shopId: string, variantId: string) => {
  const res = await call(`/channel/shops/${shopId}/listings`);
  return ((await res.json()) as { items: ListingRow[] }).items.find((r) => r.variantId === variantId)!;
};

const decide = (shopId: string, r: ListingRow, action: string, account = CEO) =>
  call(
    `/channel/shops/${shopId}/listings/${r.listing!.id}/outside-change/${action}`,
    'POST',
    { version: r.listing!.version },
    account,
  );

const skuOf = (variantId: string) =>
  products.flatMap((p) => p.variants).find((v) => v.id === variantId)!;

describe('Sàn tắt SKU ngoài app (Lazada)', () => {
  it('listing ẩn, hiddenBy platform, chờ CEO; chỉ bật lại được, không nhận giá', async () => {
    fire('listing.outside_disabled', 'shp-003', skuOf('prd-002-v1').sku);
    const r = await row('shp-003', 'prd-002-v1');
    expect(r.listing).toMatchObject({ status: 'hidden', hiddenBy: 'platform', outsideChange: { kind: 'disabled', platformPrice: null } });

    const accept = await decide('shp-003', r, 'accept-price');
    expect(accept.status).toBe(409);
    expect((await accept.json()).code).toBe('invalid_transition');

    expect((await decide('shp-003', r, 'restore', ADMIN)).status).toBe(403);

    const restore = await decide('shp-003', r, 'restore');
    expect(restore.status).toBe(200);
    expect(await restore.json()).toMatchObject({ status: 'live', hiddenBy: null, outsideChange: null });
  });

  it('Shopee không có sự kiện tắt SKU ngoài app', () => {
    expect(() => fire('listing.outside_disabled', 'shp-001')).toThrow('Sàn của gian hàng không có sự kiện này');
  });
});

describe('Giá trên sàn bị sửa ngoài app (Shopee)', () => {
  it('listing ẩn bằng tồn 0, ghi giá sàn; nhận giá sàn thì giá gian hàng thành giá sàn', async () => {
    fire('listing.outside_price', 'shp-001', skuOf('prd-001-v1').sku);
    const r = await row('shp-001', 'prd-001-v1');
    expect(r.listing).toMatchObject({
      status: 'hidden',
      hiddenBy: 'zero_stock',
      platformStock: 0,
      outsideChange: { kind: 'price_changed', platformPrice: 149000 },
    });

    const res = await decide('shp-001', r, 'accept-price');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'live', outsideChange: null, priceSync: 'synced', lastPushedPrice: 149000 });
    expect((await row('shp-001', 'prd-001-v1')).price).toBe(149000);
  });

  it('bỏ tạm ngừng SKU không tự hiện listing đang chờ CEO', async () => {
    fire('listing.outside_price', 'shp-001', skuOf('prd-001-v1').sku);
    setListingsHidden('cmp-001', 'prd-001-v1', false);
    expect((await row('shp-001', 'prd-001-v1')).listing).toMatchObject({ status: 'hidden', outsideChange: { kind: 'price_changed' } });
  });

  it('SKU đang tạm ngừng: CEO quyết thì xoá thay đổi nhưng listing vẫn ẩn', async () => {
    fire('listing.outside_price', 'shp-001', skuOf('prd-001-v1').sku);
    skuOf('prd-001-v1').businessStatus = 'paused';
    const res = await decide('shp-001', await row('shp-001', 'prd-001-v1'), 'restore');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'hidden', outsideChange: null });
  });

  it('listing không có thay đổi ngoài app: 409 invalid_transition', async () => {
    const res = await decide('shp-001', await row('shp-001', 'prd-001-v1'), 'restore');
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('invalid_transition');
  });
});
