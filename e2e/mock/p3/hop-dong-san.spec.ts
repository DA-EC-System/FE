import { type Page } from '@playwright/test';
import { chon, chua, dangNhap, dong, duongDan, expect, menu, mockApi, test, thayChu } from '../../fixtures';

interface MswHandlerBridge {
  worker: { use: (handler: unknown) => void };
  http: Record<'get' | 'post', (path: string, fn: (args: { request: Request }) => Response | Promise<Response>) => unknown>;
  HttpResponse: { json: (data: unknown) => Response };
}

const navigateCallback = (page: Page, query: string) =>
  page.evaluate((query) => {
    window.history.pushState({}, '', `/c/cmp-001/channel/shops/oauth-callback/mock?${query}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, query);

test.describe('FE #102, #103 · Hợp đồng sàn', () => {
  test.beforeEach(async ({ page }) => dangNhap(page, 'ceo@commerio.vn', 'ceo'));

  test('chuyển đủ query, callback một shop đã có đang thiết lập thì mời làm tiếp (§18.7.4)', async ({ page }) => {
    await page.evaluate(() => {
      const bridge = (window as unknown as { __msw: MswHandlerBridge }).__msw;
      bridge.worker.use(bridge.http.post('*/api/v1/channel/shops/mock/callback', async ({ request }) => {
        (window as unknown as { __callbackBody: unknown }).__callbackBody = await request.json();
        const item = {
          shop: { id: 'shp-001', status: 'connecting', shopName: 'Shop thử' },
          created: false,
          reconnect: null,
          previousStatus: 'connecting',
          remoteSkuCount: 3,
        };
        return bridge.HttpResponse.json({ ...item, shops: [item] });
      }));
    });
    await navigateCallback(page, 'state=s1&code=abc&shop_id=123&main_account_id=456&extra=a%2Bb');
    // created: false là gian hàng đã có (bảng §18.7.4); còn đang thiết lập thì mời làm tiếp
    const ketQua = page.locator('[data-outcome=already_connected]');
    await expect(ketQua).toContainText('Shop thử đã có trong Commerio');
    await expect(ketQua).toContainText('chưa xong thiết lập lần đầu');
    // shp-001 của mock đang active nên trang thiết lập chuyển ngay sang trang gian hàng: chờ sự kiện điều hướng, không đọc URL sau đó
    const toSetup = page.waitForURL(/\/shops\/shp-001\/setup$/);
    await ketQua.getByRole('button', { name: 'Tiếp tục thiết lập', exact: true }).click();
    await toSetup;
    expect(await page.evaluate(() => (window as unknown as { __callbackBody: unknown }).__callbackBody)).toEqual({
      state: 's1',
      params: { code: 'abc', shop_id: '123', main_account_id: '456', extra: 'a+b' },
    });
  });

  test('từ chối uỷ quyền không gọi callback', async ({ page }) => {
    await mockApi(page, 'post', '/channel/shops/mock/callback', 500, { detail: 'Không được gọi callback' });
    await navigateCallback(page, 'state=s1&error=access_denied');
    await expect(page.locator('[data-outcome=declined]')).toContainText('Chưa kết nối gian hàng nào.');
    await page.getByRole('button', { name: 'Về danh sách gian hàng', exact: true }).click();
    await expect.poll(() => duongDan(page)).toBe('/c/cmp-001/channel/shops');
  });

  test('nhiều shop hiện màn kết quả với đúng số lượng, để sau thì về danh sách', async ({ page }) => {
    const item = { shop: { id: 'shp-001', status: 'connecting', shopName: 'Shop thử' }, created: true, reconnect: null };
    const second = { ...item, created: false, shop: { ...item.shop, id: 'shp-002', status: 'active', shopName: 'Shop cũ' } };
    await mockApi(page, 'post', '/channel/shops/mock/callback', 201, { ...item, shops: [item, second] });
    await navigateCallback(page, 'state=s1&code=abc');
    const ketQua = page.locator('[data-outcome=multiple]');
    await expect(ketQua).toContainText('Một lần uỷ quyền, 2 gian hàng');
    const shops = ketQua.locator('[data-testid=connected-shops] li');
    await expect(shops).toHaveCount(2);
    await expect(shops.nth(0)).toContainText('Mới');
    await expect(shops.nth(1)).toContainText('Đã có');
    await expect(ketQua.getByRole('button', { name: 'Thiết lập Shop thử', exact: true })).toBeAttached();
    await expect(ketQua.getByRole('button', { name: 'Xem Shop cũ', exact: true })).toBeAttached();
    await ketQua.getByRole('button', { name: 'Để sau', exact: true }).click();
    await expect.poll(() => duongDan(page)).toBe('/c/cmp-001/channel/shops');
  });

  test('MSW nối hai shop của tài khoản chính và hiện nút thiết lập từng shop', async ({ page }) => {
    await menu(page, 'Kênh bán');
    await page.getByRole('button', { name: 'Thêm gian hàng', exact: true }).click();
    const section = page.locator('[data-testid=connect-section]');
    await section.getByRole('button', { name: 'Sàn giả lập (mock)', exact: true }).click();
    await section.getByRole('button', { name: 'Tiếp tục tới Sàn giả lập (mock)', exact: true }).click();
    await expect.poll(() => duongDan(page)).toBe('/mock-oauth/authorize');
    const state = new URL(page.url()).searchParams.get('state')!;
    const code = btoa(encodeURIComponent(JSON.stringify({ externalShopId: 'multi-test', shopName: 'Shop tài khoản chính' })));
    await navigateCallback(page, new URLSearchParams({ state, code, main_account_id: 'main-test' }).toString());
    const ketQua = page.locator('[data-outcome=multiple]');
    await expect(ketQua).toContainText('Một lần uỷ quyền, 2 gian hàng');
    await expect(ketQua.getByRole('button', { name: 'Thiết lập Shop tài khoản chính 2', exact: true })).toBeAttached();
    await ketQua.getByRole('button', { name: 'Để sau', exact: true }).click();
    const row = chua(page, 'Shop tài khoản chính 2', 'tbody tr');
    await thayChu(row, 'Đang thiết lập');
    await expect(row.getByRole('button', { name: 'Thiết lập', exact: true })).toBeAttached();
  });

  test('nhãn lấy boolean BE, hạn hiển thị lấy hạn uỷ quyền gần hơn, sàn lạ không trống', async ({ page }) => {
    const base = { companyId: 'cmp-001', platform: 'shopee_v2', externalShopId: 'x', shopName: 'Shop mới', status: 'active', region: null,
      accessExpiresAt: null, refreshExpiresAt: '2099-12-01T00:00:00Z', authExpiresAt: '2099-01-02T00:00:00Z',
      capabilities: { listingReview: false, hideBy: 'deactivate', splitLevel: 'none', returnWindow: 'days' }, pendingJobs: 0, listingCount: 0, version: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' };
    await mockApi(page, 'get', '/channel/shops', 200, { items: [
      { ...base, id: 'a', tokenExpiringSoon: true },
      { ...base, id: 'b', tokenExpiringSoon: false, authExpiresAt: '2020-01-01T00:00:00Z' },
    ] });
    await menu(page, 'Kênh bán');
    await expect(dong(page, 'a')).toContainText('shopee_v2');
    await expect(dong(page, 'a').locator('[data-testid=shop-expiring]')).toContainText('02/01/2099');
    await expect(dong(page, 'b')).toBeAttached();
    await expect(dong(page, 'b').locator('[data-testid=shop-expiring]')).toHaveCount(0);
  });

  test('bộ lọc khách hàng có kênh ở trang sau và không mất sau khi lọc', async ({ page }) => {
    await page.evaluate(() => {
      const bridge = (window as unknown as { __msw: MswHandlerBridge }).__msw;
      bridge.worker.use(bridge.http.get('*/api/v1/sales/customers', ({ request }) => {
        const query = new URL(request.url).searchParams;
        const second = query.get('page') === '2' || query.get('channel') === 'shopee_v2';
        return bridge.HttpResponse.json({ items: [{ id: second ? 'c2' : 'c1', name: second ? 'Khách sàn mới' : 'Khách tạo tay',
          phone: '', email: '', channels: [second ? 'shopee_v2' : 'manual'], orderCount: 0, totalSpent: 0, lastOrderAt: null,
          createdAt: '2026-01-01' }], total: query.has('channel') ? 1 : 2, page: Number(query.get('page') ?? 1), pageSize: 100 });
      }));
    });
    await menu(page, 'Khách hàng');
    await chon(page, 'Kênh', 'shopee_v2');
    await thayChu(page, 'Khách sàn mới', 'tbody');
    await page.getByRole('combobox', { name: 'Kênh', exact: true }).click();
    await expect(page.getByRole('option', { name: 'Tạo tay', exact: true })).toBeAttached();
  });
});
