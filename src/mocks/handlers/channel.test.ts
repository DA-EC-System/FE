import { describe, expect, it } from 'vitest';
import { db } from '../db';
import { listings } from '../channelData';
import { firstShopOfCompany, hideListing, settlePush } from './channel';

describe('Năng lực sàn từ dữ liệu', () => {
  it('sàn lạ quyết định duyệt listing và cách ẩn bằng capabilities', () => {
    const shop = { ...db.shops[0], platform: 'shopee_v2', capabilities: { listingReview: true, hideBy: 'zero_stock' as const, splitLevel: 'none' as const, returnWindow: 'days' as const } };
    const listing = { ...listings[0] };
    settlePush(shop, listing, false);
    expect(listing.status).toBe('under_review');
    shop.capabilities.listingReview = false;
    settlePush(shop, listing, false);
    expect(listing.status).toBe('live');
    hideListing(shop, listing);
    expect(listing.hiddenBy).toBe('zero_stock');
    expect(listing.platformStock).toBe(0);
    hideListing({ ...shop, capabilities: { listingReview: false, hideBy: 'deactivate', splitLevel: 'none', returnWindow: 'days' } }, listing);
    expect(listing.hiddenBy).toBe('platform');
  });
});

describe('Gian hàng đầu tiên của công ty (§18.6.2)', () => {
  it('công ty đã có gian hàng chạy thì không phải gian hàng đầu tiên; công ty mới thì phải', () => {
    const shop = db.shops[0];
    expect(firstShopOfCompany({ ...shop, id: 'shp-new', status: 'connecting' })).toBe(false);
    expect(firstShopOfCompany({ ...shop, id: 'shp-new', companyId: 'cmp-chua-co', status: 'connecting' })).toBe(true);
  });
});
