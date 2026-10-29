import { describe, expect, it } from 'vitest';
import type { Shop } from '@/types/shop';
import { shopPage, shopPlatformOptions } from './shopList';

const shops = Array.from({ length: 31 }, (_, i): Shop => ({
  id: `shop-${i}`, companyId: 'company', platform: i === 30 ? 'mock' : 'lazada',
  externalShopId: `SELLER-${i}`, shopName: `Gian hàng ${i}`, status: i === 30 ? 'disconnected' : 'active',
  region: 'VN', accessExpiresAt: null, refreshExpiresAt: null, orderCutoffAt: null, pendingJobs: 0,
  listingCount: 0, version: 1, createdAt: '2026-10-29T00:00:00Z', updatedAt: '2026-10-29T00:00:00Z',
}));
const filters = { search: '', platform: '', status: '', page: 1, pageSize: 25 };

describe('danh sách gian hàng không phân trang từ BE', () => {
  it('phân trang và tổng được tính từ items, không cắt mất gian hàng trang sau', () => {
    expect(shopPage(shops, filters)).toMatchObject({ total: 31, page: 1 });
    expect(shopPage(shops, filters).items).toHaveLength(25);
    expect(shopPage(shops, { ...filters, page: 2 }).items).toHaveLength(6);
  });
  it('lọc tên/mã không phân biệt hoa thường rồi mới phân trang', () => {
    expect(shopPage(shops, { ...filters, search: ' seller-30 ', status: 'disconnected', platform: 'mock' }).items)
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
});
