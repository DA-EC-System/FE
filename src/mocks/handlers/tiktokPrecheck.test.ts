// TikTok kiểm điều kiện đăng trước khi tạo sản phẩm (FE#266, commerio-backend#305, 21 §18.6.4)
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { db } from '../db';
import { listings } from '../channelData';
import { platformCategories, productSpecs } from '../platformCategoryData';
import { fireMarketplaceEvent } from '../engine/marketplace';
import { settleDuePushes, shopHandlers } from './channel';

const server = setupServer(...shopHandlers);
const snapListings = structuredClone(listings);
const snapSpecs = structuredClone(productSpecs);
/** Leaf TikTok chưa có attribute trong bảng và không bắt buộc bảng kích cỡ: thông tin sàn chỉ cần ánh xạ trục */
const plainLeaf = platformCategories.tiktok.find((c) => c.isLeaf && !['601226', '601357', '601534'].includes(c.externalId))!;
const snapShop = structuredClone(db.shops.find((s) => s.id === 'shp-002')!);
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
  productSpecs.splice(0, productSpecs.length, ...structuredClone(snapSpecs), {
    companyId: 'cmp-001',
    productId: 'prd-002',
    platform: 'tiktok',
    externalCategoryId: plainLeaf.externalId,
    categoryPath: plainLeaf.path,
    categoryStatus: 'ok',
    attributes: {},
    axisMap: { 'att-size': '__custom' },
    valueMap: {},
    source: 'push',
    version: 1,
    updatedAt: '2026-11-18T00:00:00.000Z',
  });
  // Gian hàng TikTok của mock đang cần kết nối lại: cho dùng được để đẩy
  Object.assign(shop(), structuredClone(snapShop), { status: 'active', precheckFail: null });
});

const shop = () => db.shops.find((s) => s.id === 'shp-002')!;
const fire = (type: string) => {
  const r = fireMarketplaceEvent(type, { companyId: 'cmp-001', shop: shop(), params: {} });
  if (!r.ok) throw new Error(r.message);
};
const push = async (variantId: string) => {
  const res = await fetch('http://localhost/api/v1/channel/shops/shp-002/listings/push', {
    method: 'POST',
    headers: { Authorization: `Bearer mock.acc-001.cmp-001.${Date.now()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ variantIds: [variantId] }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { results: { code: string | null; status: string | null }[] }).results[0]!;
};
const sanTraKetQua = () => settleDuePushes(shop(), Date.now() + 60_000);
const listingOf = (variantId: string) => listings.find((l) => l.shopId === 'shp-002' && l.variantId === variantId)!;

describe('TikTok kiểm trước khi tạo sản phẩm', () => {
  it('gian hàng chưa đủ điều kiện: sản phẩm mới Lỗi đẩy shop_not_eligible, không tạo trên sàn', async () => {
    fire('shop.not_eligible');
    expect(await push('prd-002-v1')).toMatchObject({ code: null, status: 'pushing' });
    sanTraKetQua();
    const l = listingOf('prd-002-v1');
    expect(l).toMatchObject({ status: 'push_failed', externalSkuId: null, pushError: { code: 'shop_not_eligible' } });
  });

  it('sàn báo sai luật đăng: listing_check_failed kèm câu của sàn; tắt lỗi thì đẩy lại được', async () => {
    fire('listing.check_failed');
    await push('prd-002-v1');
    sanTraKetQua();
    expect(listingOf('prd-002-v1').pushError).toMatchObject({ code: 'listing_check_failed', message: expect.stringContaining('12052051') });

    fire('listing.check_failed');
    expect(shop().precheckFail).toBeNull();
    expect(await push('prd-002-v1')).toMatchObject({ code: null, status: 'pushing' });
    sanTraKetQua();
    expect(listingOf('prd-002-v1').pushError).toBeNull();
  });

  it('chỉ có ở TikTok', () => {
    expect(fireMarketplaceEvent('shop.not_eligible', { companyId: 'cmp-001', shop: db.shops.find((s) => s.id === 'shp-001')!, params: {} }).ok).toBe(false);
  });
});
