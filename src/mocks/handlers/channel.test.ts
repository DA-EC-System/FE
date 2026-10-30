import { describe, expect, it } from 'vitest';
import { db } from '../db';
import { listings } from '../channelData';
import { hideListing, settlePush } from './channel';

describe('Năng lực sàn từ dữ liệu', () => {
  it('sàn lạ quyết định duyệt listing và cách ẩn bằng capabilities', () => {
    const shop = { ...db.shops[0], platform: 'shopee_v2', capabilities: { listingReview: true, hideBy: 'zero_stock' as const } };
    const listing = { ...listings[0] };
    settlePush(shop, listing, false);
    expect(listing.status).toBe('under_review');
    shop.capabilities.listingReview = false;
    settlePush(shop, listing, false);
    expect(listing.status).toBe('live');
    hideListing(shop, listing);
    expect(listing.hiddenBy).toBe('zero_stock');
    expect(listing.platformStock).toBe(0);
    hideListing({ ...shop, capabilities: { listingReview: false, hideBy: 'deactivate' } }, listing);
    expect(listing.hiddenBy).toBe('platform');
  });
});
