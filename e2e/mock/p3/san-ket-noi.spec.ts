// FE#99: response đúng hợp đồng BE; bảng và khu kết nối tải độc lập.
import { chon, chua, dangNhap, dong, duongDan, expect, menu, mockApi, test, toast } from '../../fixtures';

test.describe('P3 · Danh sách sàn kết nối được', () => {
  test.beforeEach(async ({ page }) => dangNhap(page, 'ceo@commerio.vn', 'ceo'));

  test('chỉ hiện sàn connectable API trả, dùng tên API và không cần gợi ý viết cứng', async ({ page }) => {
    await mockApi(page, 'get', '/channel/shops/platforms', 200, { items: [
      { platform: 'lazada', name: 'Lazada từ API', connectable: true },
      { platform: 'new-market', name: 'Sàn mới', connectable: true },
      { platform: 'shopee', name: 'Shopee', connectable: false },
    ] });
    await menu(page, 'Kênh bán');
    await page.getByRole('button', { name: 'Thêm gian hàng', exact: true }).click();
    await expect(page.locator('[data-testid=connect-section] [data-platform]')).toHaveCount(2);
    const section = page.locator('[data-testid=connect-section]');
    await expect(section.getByRole('button', { name: 'Kết nối Lazada từ API', exact: true })).toBeAttached();
    await expect(section.getByRole('button', { name: 'Kết nối Sàn mới', exact: true })).toBeAttached();
    await expect(chua(section, 'Shopee')).toHaveCount(0);
    await expect(chua(section, 'TikTok')).toHaveCount(0);
    // API chưa trả methods thì chỉ có đăng nhập sàn
    await expect(section.getByRole('button', { name: /^Dán token/ })).toHaveCount(0);
  });

  test('nút trên thẻ theo methods: chỉ token thì không có Đăng nhập', async ({ page }) => {
    await mockApi(page, 'get', '/channel/shops/platforms', 200, { items: [
      { platform: 'lazada', name: 'Lazada', connectable: true, methods: ['oauth', 'token'] },
      { platform: 'mock', name: 'Sàn giả lập (mock)', connectable: true, methods: ['token'] },
    ] });
    await menu(page, 'Kênh bán');
    await page.getByRole('button', { name: 'Thêm gian hàng', exact: true }).click();
    const lazada = page.locator('[data-platform=lazada]');
    await expect(lazada.getByRole('button', { name: 'Kết nối Lazada', exact: true })).toContainText('Đăng nhập Lazada');
    await expect(lazada.getByRole('button', { name: 'Dán token Lazada', exact: true })).toBeAttached();
    const mock = page.locator('[data-platform=mock]');
    await expect(mock.getByRole('button', { name: /^Kết nối/ })).toHaveCount(0);
    await expect(mock.getByRole('button', { name: 'Dán token Sàn giả lập (mock)', exact: true })).toBeAttached();
  });

  test('dán token: bắt buộc access token, sàn từ chối thì ở lại, đúng thì sang thiết lập', async ({ page }) => {
    await menu(page, 'Kênh bán');
    await page.getByRole('button', { name: 'Thêm gian hàng', exact: true }).click();
    await page.getByRole('button', { name: 'Dán token Sàn giả lập (mock)', exact: true }).click();
    const form = page.locator('[data-testid=token-form]');
    await form.getByRole('button', { name: 'Kết nối', exact: true }).click();
    await expect(chua(form, 'Nhập access token')).toBeVisible();
    await form.getByLabel('Access token', { exact: true }).fill('sai');
    await form.getByRole('button', { name: 'Kết nối', exact: true }).click();
    await expect(chua(form, 'Sàn từ chối token này')).toBeVisible();
    await form.getByRole('button', { name: 'Chọn sàn khác', exact: true }).click();
    await expect(form).toHaveCount(0);
    await page.getByRole('button', { name: 'Dán token Sàn giả lập (mock)', exact: true }).click();
    await page.getByLabel('Access token', { exact: true }).fill('tok-abc123');
    await form.getByRole('button', { name: 'Kết nối', exact: true }).click();
    await toast(page, 'Đã kết nối Shop thử ABC123. Hoàn tất thiết lập để bắt đầu bán.');
    await expect.poll(() => duongDan(page)).toMatch(/\/setup$/);
  });

  test('rỗng hiện hướng dẫn, đóng hộp thoại thì về bảng gian hàng', async ({ page }) => {
    await mockApi(page, 'get', '/channel/shops/platforms', 200, { items: [] });
    await menu(page, 'Kênh bán');
    await page.getByRole('button', { name: 'Thêm gian hàng', exact: true }).click();
    await expect(
      chua(page, 'Chưa có sàn nào được bật. Liên hệ quản trị nền tảng để kết nối sàn mới.'),
    ).toBeVisible();
    await expect(page.locator('[data-testid=connect-section] [data-platform]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid=connect-section]')).toHaveCount(0);
    await expect(dong(page, 'shp-001')).toBeVisible();
  });

  test('lỗi chỉ ảnh hưởng khu kết nối, thử lại nạp được bốn sàn mock', async ({ page }) => {
    await mockApi(page, 'get', '/channel/shops/platforms', 503, { status: 503, detail: 'Chưa tải được sàn' });
    await menu(page, 'Kênh bán');
    await expect(dong(page, 'shp-001')).toBeAttached();
    await page.getByRole('button', { name: 'Thêm gian hàng', exact: true }).click();
    const section = page.locator('[data-testid=connect-section]');
    await expect(section.locator('[data-platform]')).toHaveCount(0);
    await section.getByRole('button', { name: 'Thử lại', exact: true }).click();
    await expect(section.locator('[data-platform]')).toHaveCount(4);
  });

  test('lọc từ toàn bộ items, gồm sàn ở trang sau và gian hàng đã ngắt', async ({ page }) => {
    const items = Array.from({ length: 31 }, (_, i) => ({
      id: `demo-${i}`, companyId: 'cmp-001', shopName: `Cửa hàng ${i}`, externalShopId: `SELLER-${i}`,
      platform: i === 30 ? 'mock' : 'lazada', status: i === 30 ? 'disconnected' : 'active',
      region: 'VN', accessExpiresAt: null, refreshExpiresAt: null, orderCutoffAt: null, pendingJobs: 0,
      listingCount: 0, version: 1, createdAt: '2026-10-29T00:00:00Z', updatedAt: '2026-10-29T00:00:00Z',
    }));
    await mockApi(page, 'get', '/channel/shops', 200, { items });
    await mockApi(page, 'get', '/channel/shops/platforms', 200, { items: [{ platform: 'shopee', name: 'Shopee', connectable: true }] });
    await menu(page, 'Kênh bán');
    await expect(page.locator('tbody tr[data-row-id]')).toHaveCount(25);
    await page.getByRole('combobox', { name: 'Sàn', exact: true }).click();
    await expect(page.getByRole('option', { name: 'Shopee', exact: true })).toHaveCount(0);
    await page.getByRole('option', { name: 'Sàn giả lập (mock)', exact: true }).click();
    await expect(dong(page, 'demo-30')).toBeAttached();
    await expect(page.locator('tbody tr[data-row-id]')).toHaveCount(1);
    await page.getByPlaceholder('Tìm theo tên hoặc mã gian hàng...', { exact: true }).fill('seller-30');
    await expect(dong(page, 'demo-30')).toBeAttached();
    await chon(page, 'Sàn', 'Lazada');
    await expect(chua(page, 'Không có gian hàng khớp bộ lọc')).toBeVisible();
  });
});

test.describe('P3 · Sàn kết nối được: thiếu quyền kết nối', () => {
  test('Sale xem được bảng gian hàng nhưng không có nút Thêm gian hàng', async ({ page }) => {
    await dangNhap(page, 'sale@commerio.vn', 'sale');
    await menu(page, 'Kênh bán');
    await expect(dong(page, 'shp-001')).toBeAttached();
    await expect(page.getByRole('button', { name: 'Thêm gian hàng', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Kết nối / })).toHaveCount(0);
  });
});
