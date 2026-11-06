import { describe, expect, it } from 'vitest';
import type { Shop } from '@/types/shop';
import { needsAction, shopPage, shopPlatformOptions } from './shopList';

const shops = Array.from({ length: 31 }, (_, i): Shop => ({
  id: `shop-${i}`, companyId: 'company', platform: i === 30 ? 'mock' : 'lazada',
  externalShopId: `SELLER-${i}`, shopName: `Gian hàng ${i}`, status: i === 30 ? 'disconnected' : 'active',
  region: 'VN', capabilities: { listingReview: false, hideBy: 'deactivate', splitLevel: 'none', returnWindow: 'days' }, authExpiresAt: null, tokenExpiringSoon: false, accessExpiresAt: null, refreshExpiresAt: null, orderCutoffAt: null, returnWindowDays: null, openingStocktake: null, pendingJobs: 0,
  listingCount: 0, orders7d: 0, pendingOrderCount: 0, statusChangedAt: '2026-10-29T00:00:00Z', feeConfigVersion: null, setup: null,
  version: 1, createdAt: '2026-10-29T00:00:00Z', updatedAt: '2026-10-29T00:00:00Z',
}));
const filters = { search: '', platform: '', segment: 'all' as const, page: 1, pageSize: 25 };

describe('danh sách gian hàng không phân trang từ BE', () => {
  it('phân trang và tổng được tính từ items, không cắt mất gian hàng trang sau', () => {
    expect(shopPage(shops, filters)).toMatchObject({ total: 31, page: 1 });
    expect(shopPage(shops, filters).items).toHaveLength(25);
    expect(shopPage(shops, { ...filters, page: 2 }).items).toHaveLength(6);
  });
  it('lọc tên/mã không phân biệt hoa thường rồi mới phân trang', () => {
    expect(shopPage(shops, { ...filters, search: ' seller-30 ', segment: 'disconnected', platform: 'mock' }).items)
      .toEqual([shops[30]]);
    expect(shopPage(shops, { ...filters, search: 'GIAN HÀNG 30' }).total).toBe(1);
  });
  it('bộ lọc giữ sàn ở trang sau và gian hàng đã ngắt, không lặp', () => {
    expect(shopPlatformOptions(shops).map((p) => p.value)).toEqual(['lazada', 'mock']);
  });
  it('kẹp trang khi số dòng giảm và xử lý danh sách rỗng', () => {
    expect(shopPage(shops, { ...filters, page: 2, platform: 'mock' }).page).toBe(1);
    expect(shopPage([], { ...filters, page: 2 })).toEqual({ items: [], total: 0, page: 1 });
  });
  it('cần xử lý gồm mất quyền, chưa thiết lập và uỷ quyền sắp hết hạn', () => {
    const base = shops[0];
    expect(needsAction({ ...base, status: 'needs_reauth' })).toBe(true);
    expect(needsAction({ ...base, status: 'connecting' })).toBe(true);
    expect(needsAction({ ...base, tokenExpiringSoon: true })).toBe(true);
    expect(needsAction(base)).toBe(false);
    expect(needsAction({ ...base, status: 'disconnected', tokenExpiringSoon: true })).toBe(false);
    const list = [base, { ...base, id: 'x', status: 'connecting' as const }, shops[30]];
    expect(shopPage(list, { ...filters, segment: 'needs_action' }).items.map((s) => s.id)).toEqual(['x']);
    expect(shopPage(list, { ...filters, segment: 'disconnected' }).items).toEqual([shops[30]]);
  });
});
