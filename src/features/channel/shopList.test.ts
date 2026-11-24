import { describe, expect, it } from 'vitest';
import type { Shop } from '@/types/shop';
import { lastOrderPull, missingReturnWindow, needsAction, shopDisplayName, shopPage, shopPlatformOptions } from './shopList';

const shops = Array.from({ length: 31 }, (_, i): Shop => ({
  id: `shop-${i}`, companyId: 'company', platform: i === 30 ? 'mock' : 'lazada',
  externalShopId: `SELLER-${i}`, shopName: `Gian hàng ${i}`, status: i === 30 ? 'disconnected' : 'active',
  region: 'VN', capabilities: { listingReview: false, hideBy: 'deactivate', splitLevel: 'none', returnWindow: 'days' }, authExpiresAt: null, tokenExpiringSoon: false, accessExpiresAt: null, refreshExpiresAt: null, orderCutoffAt: null, returnWindowDays: 7, openingStocktake: null, pendingJobs: 0,
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

describe('chưa nhập số ngày hạn trả (§18.7.2, FE#273)', () => {
  const base = shops[0];
  const tiktok = { ...base, capabilities: { ...base.capabilities, returnWindow: 'platform_status' as const }, returnWindowDays: null };
  it('đang bán, sàn tính theo số ngày mà chưa có số ngày thì cần xử lý', () => {
    expect(missingReturnWindow({ ...base, returnWindowDays: null })).toBe(true);
    expect(needsAction({ ...base, returnWindowDays: null })).toBe(true);
  });
  it('có số ngày, sàn tự báo hạn, hay không còn bán thì không', () => {
    expect(missingReturnWindow(base)).toBe(false);
    expect(missingReturnWindow(tiktok)).toBe(false);
    expect(needsAction(tiktok)).toBe(false);
    expect(missingReturnWindow({ ...base, returnWindowDays: null, status: 'disconnected' })).toBe(false);
    expect(missingReturnWindow({ ...base, returnWindowDays: null, status: 'connecting' })).toBe(false);
  });
});

describe('tên hiển thị và lần đơn về gần nhất (FE#464)', () => {
  const base = shops[0];
  it('tên người dùng đặt thay tên thô trên sàn; trống hoặc null thì về tên sàn', () => {
    const tiktok = { ...base, shopName: 'SANDBOX_VN7703317749853964039' };
    expect(shopDisplayName({ ...tiktok, displayName: 'TikTok chính' })).toBe('TikTok chính');
    expect(shopDisplayName({ ...tiktok, displayName: null })).toBe('SANDBOX_VN7703317749853964039');
    expect(shopDisplayName({ ...tiktok, displayName: '  ' })).toBe('SANDBOX_VN7703317749853964039');
    expect(shopDisplayName(tiktok)).toBe('SANDBOX_VN7703317749853964039');
  });
  it('tìm được theo tên hiển thị, tên sàn và mã gian hàng', () => {
    const list = [{ ...base, displayName: 'TikTok chính', shopName: 'SANDBOX_VN77' }, shops[1]];
    expect(shopPage(list, { ...filters, search: 'tiktok' }).items.map((s) => s.id)).toEqual(['shop-0']);
    expect(shopPage(list, { ...filters, search: 'sandbox' }).total).toBe(1);
  });
  it('lấy mốc muộn nhất; chỉ có lượt đơn còn mở sau thiết lập vẫn tính là đã có đơn về', () => {
    expect(lastOrderPull(base)).toBeNull();
    expect(lastOrderPull({ ...base, openOrdersPulledAt: '2026-11-24T02:00:00Z', lastOrderSyncAt: null })).toEqual({
      at: '2026-11-24T02:00:00Z',
      openOrdersOnly: true,
    });
    expect(
      lastOrderPull({
        ...base,
        openOrdersPulledAt: '2026-11-24T02:00:00Z',
        lastOrderSyncAt: '2026-11-24T03:00:00Z',
        ordersPulledOkAt: '2026-11-24T03:05:00Z',
      }),
    ).toEqual({ at: '2026-11-24T03:05:00Z', openOrdersOnly: false });
  });
});
