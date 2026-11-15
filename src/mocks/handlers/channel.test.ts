import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { listings } from '../channelData';
import * as inventory from '../inventoryData';
import { SETUP_JOB_MS, firstShopOfCompany, hideListing, settlePush, toShop, trigramSimilarity } from './channel';

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

describe('Gợi ý theo tên (§18.7.5)', () => {
  it('giống pg_trgm: cùng chuỗi là 1, khác hẳn gần 0, tên gần giống ở giữa', () => {
    expect(trigramSimilarity('Áo khoác gió', 'áo khoác gió')).toBe(1);
    expect(trigramSimilarity('Áo khoác gió', 'Nồi cơm điện')).toBeLessThan(0.2);
    const s = trigramSimilarity('Áo khoác gió Navy L', 'Áo khoác Navy / L');
    expect(s).toBeGreaterThan(0.4);
    expect(s).toBeLessThan(1);
  });
});

describe('Tiến độ thiết lập (§18.7.7)', () => {
  afterEach(() => vi.useRealTimers());
  it('kéo đơn chạy trước, đẩy tồn chờ rồi chạy, cuối cùng xong', () => {
    vi.useFakeTimers();
    const shop = { ...db.shops[0], status: 'active' as const, setupRun: { mode: 'push' as const, at: Date.now(), unmatchedCount: 2 } };
    const status = () => toShop(shop).setup?.steps.map((s) => `${s.key}:${s.status}`);
    expect(status()).toEqual(['match:done', 'open_orders:running', 'push_stock:blocked']);
    expect(toShop(shop).setup?.steps[2].blockedBy).toBe('open_orders');
    expect(toShop(shop).setup?.unmatchedCount).toBe(2);
    vi.advanceTimersByTime(SETUP_JOB_MS);
    expect(status()).toEqual(['match:done', 'open_orders:done', 'push_stock:running']);
    vi.advanceTimersByTime(SETUP_JOB_MS);
    expect(status()).toEqual(['match:done', 'open_orders:done', 'push_stock:done']);
  });
});

describe('Kiểm kê đầu kỳ và chia hàng (§18.6.11, §18.7.7)', () => {
  afterEach(() => vi.useRealTimers());
  it('phiếu huỷ vẫn giữ banner, ghi sổ thì kéo đơn lại và chia hàng rồi mới đẩy tồn', () => {
    vi.useFakeTimers();
    const doc = { ...inventory.docs[0], id: 'sd-kk-test', number: 'KK-TEST', status: 'cancelled' as const, postedAt: null };
    inventory.docs.push(doc);
    const shop = {
      ...db.shops[0],
      status: 'active' as const,
      openingStocktakeDocId: doc.id,
      setupRun: { mode: 'stocktake' as const, at: Date.now() - 2 * SETUP_JOB_MS, unmatchedCount: 0 },
    };
    const status = () => toShop(shop).setup?.steps.map((s) => `${s.key}:${s.status}`);
    try {
      expect(toShop(shop).openingStocktake?.status).toBe('cancelled');
      expect(status()).toEqual([
        'match:done',
        'opening_stock:pending',
        'open_orders:done',
        'allocate:blocked',
        'push_stock:blocked',
      ]);
      expect(toShop(shop).setup?.steps[3].blockedBy).toBe('opening_stock');
      Object.assign(doc, { status: 'posted', postedAt: new Date().toISOString() });
      expect(toShop(shop).openingStocktake).toBeNull();
      expect(status()).toEqual([
        'match:done',
        'opening_stock:done',
        'open_orders:running',
        'allocate:running',
        'push_stock:blocked',
      ]);
      vi.advanceTimersByTime(SETUP_JOB_MS);
      expect(status()).toEqual([
        'match:done',
        'opening_stock:done',
        'open_orders:done',
        'allocate:done',
        'push_stock:running',
      ]);
    } finally {
      inventory.docs.splice(inventory.docs.indexOf(doc), 1);
    }
  });
});
