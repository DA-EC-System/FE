// Sửa nội dung listing đang bán (FE#275, commerio-backend#293, 21 §18.3, §18.5): route update-content và sự kiện sàn giả lập
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import type { ChannelListing, ListingRow } from '@/types/shop';
import { db } from '../db';
import { categoryMaps, listings } from '../channelData';
import { productSpecs } from '../platformCategoryData';
import { fireMarketplaceEvent } from '../engine/marketplace';
import { shopHandlers } from './channel';

const server = setupServer(...shopHandlers);
const snapListings = structuredClone(listings);
const snapMaps = structuredClone(categoryMaps);
const snapSpecs = structuredClone(productSpecs);
const snapShops = structuredClone(db.shops);
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
  categoryMaps.splice(0, categoryMaps.length, ...structuredClone(snapMaps));
  productSpecs.splice(0, productSpecs.length, ...structuredClone(snapSpecs));
  db.shops.splice(0, db.shops.length, ...structuredClone(snapShops));
  // Gian hàng TikTok của mock đang cần kết nối lại: coi như đã nối lại
  db.shops.find((s) => s.id === 'shp-002')!.status = 'active';
});

const CEO = 'acc-001';
const SALE = 'acc-002';
const KHO = 'acc-003';

const call = (path: string, method = 'GET', body?: unknown, account = CEO) =>
  fetch(`http://localhost/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer mock.${account}.cmp-001.${Date.now()}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const fire = (type: string, shopId: string) => {
  const r = fireMarketplaceEvent(type, { companyId: 'cmp-001', shop: db.shops.find((s) => s.id === shopId)!, params: {} });
  if (!r.ok) throw new Error(r.message);
};

const row = async (shopId: string, variantId: string) => {
  const res = await call(`/channel/shops/${shopId}/listings`);
  return ((await res.json()) as { items: ListingRow[] }).items.find((r) => r.variantId === variantId)!;
};

const sua = (shopId: string, l: ChannelListing, account = CEO, version = l.version) =>
  call(`/channel/shops/${shopId}/listings/${l.id}/update-content`, 'POST', { version }, account);

describe('POST update-content', () => {
  it('TikTok sàn vẫn bán bản cũ: giữ live, bản sửa đang duyệt, tăng version', async () => {
    const { listing } = await row('shp-002', 'prd-001-v1');
    expect(listing!.pendingRevision).toBeNull();
    const res = await sua('shp-002', listing!);
    expect(res.status).toBe(200);
    const saved = (await res.json()) as ChannelListing;
    expect(saved).toMatchObject({ status: 'live', pendingRevision: { status: 'auditing', rejectReason: null } });
    expect(saved.version).toBe(listing!.version + 1);
  });

  it('bản sửa bị từ chối thì gửi lại được: về đang duyệt, xoá lý do, `at` mới', async () => {
    const { listing } = await row('shp-002', 'prd-001-v2');
    expect(listing!.pendingRevision).toMatchObject({ status: 'failed', rejectReason: 'Mô tả chứa thông tin liên hệ ngoài sàn' });
    const saved = (await (await sua('shp-002', listing!)).json()) as ChannelListing;
    expect(saved.pendingRevision).toMatchObject({ status: 'auditing', rejectReason: null });
    expect(saved.pendingRevision!.at).not.toBe(listing!.pendingRevision!.at);
  });

  it('sàn ngừng bán để duyệt (PENDING): chuyển under_review, không ghi bản sửa', async () => {
    fire('listing.content_review_stop', 'shp-002');
    const { listing } = await row('shp-002', 'prd-001-v1');
    const saved = (await (await sua('shp-002', listing!)).json()) as ChannelListing;
    expect(saved).toMatchObject({ status: 'under_review', pendingRevision: null });
  });

  it('sàn không nhận bản sửa: 409 marketplace_rejected kèm câu của sàn, listing giữ nguyên', async () => {
    fire('listing.content_rejected', 'shp-002');
    const { listing } = await row('shp-002', 'prd-001-v1');
    const res = await sua('shp-002', listing!);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'marketplace_rejected', platformMessage: expect.stringContaining('12019018') });
    const after = await row('shp-002', 'prd-001-v1');
    expect(after.listing).toMatchObject({ version: listing!.version, pendingRevision: null, status: 'live' });
  });

  it('version cũ: 409 version_conflict kèm current', async () => {
    const { listing } = await row('shp-002', 'prd-001-v1');
    const res = await sua('shp-002', listing!, CEO, listing!.version - 1);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'version_conflict', current: { id: listing!.id } });
  });

  it('listing không live: 409 invalid_transition', async () => {
    const { listing } = await row('shp-003', 'prd-002-v2');
    expect(listing!.status).toBe('under_review');
    const res = await sua('shp-003', listing!);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'invalid_transition' });
  });

  it('sản phẩm chưa có thông tin TikTok: 409 category_unmapped (commerio-backend#400)', async () => {
    productSpecs.splice(0, productSpecs.length, ...productSpecs.filter((s) => s.platform !== 'tiktok'));
    const { listing } = await row('shp-002', 'prd-001-v1');
    const res = await sua('shp-002', listing!);
    expect(await res.json()).toMatchObject({ status: 409, code: 'category_unmapped' });
  });

  it('Lazada: 422 marketplace_unsupported', async () => {
    const { listing } = await row('shp-003', 'prd-002-v1');
    expect(listing!.status).toBe('live');
    const res = await sua('shp-003', listing!);
    expect(await res.json()).toMatchObject({ status: 422, code: 'marketplace_unsupported' });
  });

  it('sản phẩm sàn có nhiều SKU đang ghép: 409 shared_remote_product', async () => {
    const v1 = listings.find((l) => l.shopId === 'shp-002' && l.variantId === 'prd-001-v1')!;
    listings.find((l) => l.shopId === 'shp-002' && l.variantId === 'prd-001-v2')!.externalProductId = v1.externalProductId;
    const { listing } = await row('shp-002', 'prd-001-v1');
    const res = await sua('shp-002', listing!);
    expect(await res.json()).toMatchObject({ status: 409, code: 'shared_remote_product' });
  });

  it('sàn lỗi tạm: 503 marketplace_unavailable', async () => {
    db.shops.find((s) => s.id === 'shp-002')!.outage = true;
    const { listing } = await row('shp-002', 'prd-001-v1');
    const res = await sua('shp-002', listing!);
    expect(await res.json()).toMatchObject({ status: 503, code: 'marketplace_unavailable' });
  });

  it.each([
    ['Sale', SALE],
    ['Kho', KHO],
  ])('%s không có listing.manage: 403', async (_name, account) => {
    const { listing } = await row('shp-002', 'prd-001-v1');
    const res = await sua('shp-002', listing!, account);
    expect(res.status).toBe(403);
  });
});

describe('Sàn duyệt hoặc từ chối bản sửa', () => {
  it('sàn duyệt: xoá bản sửa', async () => {
    fire('listing.revision_approved', 'shp-002');
    const { listing } = await row('shp-002', 'prd-001-v3');
    expect(listing).toMatchObject({ status: 'live', pendingRevision: null });
  });

  it('sàn từ chối: bản sửa failed kèm lý do, listing vẫn live', async () => {
    fire('listing.revision_failed', 'shp-002');
    const { listing } = await row('shp-002', 'prd-001-v3');
    expect(listing).toMatchObject({ status: 'live', pendingRevision: { status: 'failed', rejectReason: expect.any(String) } });
  });

  it('gỡ khỏi sàn thì xoá bản sửa', async () => {
    const { listing } = await row('shp-002', 'prd-001-v2');
    const res = await call(`/channel/shops/shp-002/listings/prd-001-v2/delist`, 'POST', { version: listing!.version });
    expect(await res.json()).toMatchObject({ status: 'delisted', pendingRevision: null });
  });
});
