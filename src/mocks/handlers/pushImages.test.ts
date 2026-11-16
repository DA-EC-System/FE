// Ảnh khi đẩy listing (FE#205, commerio-backend#303): mock chặn images_missing như listings.ts / push-block.ts của BE
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { db } from '../db';
import { listings } from '../channelData';
import { products } from '../catalogData';
import { settleDuePushes, shopHandlers } from './channel';

const server = setupServer(...shopHandlers);
const snapListings = structuredClone(listings);
const snapProducts = structuredClone(products);
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
});

const push = async (variantId: string) => {
  const res = await fetch('http://localhost/api/v1/channel/shops/shp-001/listings/push', {
    method: 'POST',
    headers: { Authorization: `Bearer mock.acc-001.cmp-001.${Date.now()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ variantIds: [variantId] }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { results: { code: string | null; status: string | null }[] }).results[0]!;
};

const shop = () => db.shops.find((s) => s.id === 'shp-001')!;
const quanKaki = () => products.find((p) => p.id === 'prd-002')!;
/** Cho việc đẩy đang chờ của gian hàng xong ngay */
const sanTraKetQua = () => settleDuePushes(shop(), Date.now() + 60_000);

describe('Ảnh khi đẩy listing', () => {
  it('sản phẩm có ảnh catalog thì đẩy được; đẩy xong listing giữ ảnh đã đưa lên sàn', async () => {
    expect(await push('prd-002-v1')).toMatchObject({ code: null, status: 'pushing' });
    sanTraKetQua();
    const l = listings.find((x) => x.shopId === 'shp-001' && x.variantId === 'prd-002-v1')!;
    expect(l.externalImageUrls?.length).toBe(1);
  });

  it('SKU khác cùng sản phẩm đã lên sàn không tính: sản phẩm hết ảnh catalog thì SKU mới bị images_missing', async () => {
    expect((await push('prd-002-v1')).code).toBeNull();
    sanTraKetQua();
    quanKaki().imageFileIds = [];
    expect(await push('prd-002-v2')).toMatchObject({ code: 'images_missing', status: null });
  });

  it('đẩy lại chính SKU đã có ảnh trên sàn thì không cần ảnh catalog', async () => {
    expect((await push('prd-002-v1')).code).toBeNull();
    sanTraKetQua();
    const l = listings.find((x) => x.shopId === 'shp-001' && x.variantId === 'prd-002-v1')!;
    l.status = 'push_failed';
    quanKaki().imageFileIds = [];
    expect(await push('prd-002-v1')).toMatchObject({ code: null, status: 'pushing' });
  });
});
