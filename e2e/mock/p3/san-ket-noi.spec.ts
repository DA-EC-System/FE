// FE#99: response đúng hợp đồng BE; bảng và khu kết nối tải độc lập.
import { chon, chua, dangNhap, dong, duongDan, expect, menu, mockApi, test, toast } from '../../fixtures';

test.describe('P3 · Danh sách sàn kết nối được', () => {
  test.beforeEach(async ({ page }) => dangNhap(page, 'ceo@commerio.vn', 'ceo'));

  test('dùng tên API, sàn chưa nối được vẫn hiện thẻ khoá kèm lý do', async ({ page }) => {
    await mockApi(page, 'get', '/channel/shops/platforms', 200, { items: [
      { platform: 'lazada', name: 'Lazada từ API', connectable: true },
      { platform: 'new-market', name: 'Sàn mới', connectable: true },
      { platform: 'shopee', name: 'Shopee', connectable: false, reason: 'Chưa duyệt ứng dụng trên Shopee Open Platform' },
    ] });
    await menu(page, 'Kênh bán');
    await page.getByRole('button', { name: 'Thêm gian hàng', exact: true }).click();
    const section = page.locator('[data-testid=connect-section]');
    await expect(section.locator('[data-platform]')).toHaveCount(3);
    // Sàn nối được đầu tiên được chọn sẵn
    await expect(section.getByRole('button', { name: 'Lazada từ API', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(section.getByRole('button', { name: 'Sàn mới', exact: true })).toHaveAttribute('aria-pressed', 'false');
    const shopee = section.locator('[data-platform=shopee]');
    await expect(shopee).toHaveAttribute('aria-disabled', 'true');
    await expect(shopee.locator('[data-testid=platform-reason]')).toHaveText('Chưa duyệt ứng dụng trên Shopee Open Platform');
    // Thẻ khoá có aria-disabled nên Playwright không bấm thường; bấm vẫn báo lý do
    await shopee.dispatchEvent('click');
    await toast(page, 'Shopee: Chưa duyệt ứng dụng trên Shopee Open Platform');
    await expect(section.getByRole('button', { name: 'Tiếp tục tới Lazada từ API', exact: true })).toBeAttached();
    await section.getByRole('button', { name: 'Sàn mới', exact: true }).click();
    await expect(section.getByRole('button', { name: 'Tiếp tục tới Sàn mới', exact: true })).toBeAttached();
    // API chưa trả methods thì chỉ có uỷ quyền, không có lựa chọn cách nối
    await expect(section.getByRole('radiogroup', { name: 'Cách kết nối' })).toHaveCount(0);
  });

  test('cách nối theo methods: hai cách thì chọn, chỉ token thì không có uỷ quyền', async ({ page }) => {
    await mockApi(page, 'get', '/channel/shops/platforms', 200, { items: [
      { platform: 'lazada', name: 'Lazada', connectable: true, methods: ['oauth', 'token'] },
      { platform: 'mock', name: 'Sàn giả lập (mock)', connectable: true, methods: ['token'] },
    ] });
    await menu(page, 'Kênh bán');
    await page.getByRole('button', { name: 'Thêm gian hàng', exact: true }).click();
    const section = page.locator('[data-testid=connect-section]');
    await expect(section.locator('[data-platform=lazada]')).toContainText('Đăng nhập Lazada');
    await expect(section.getByRole('radio', { name: /^Uỷ quyền qua Lazada/ })).toBeChecked();
    await section.getByRole('radio', { name: /^Dán token/ }).click();
    await expect(section.getByRole('button', { name: 'Tiếp tục', exact: true })).toBeAttached();
    await section.getByRole('button', { name: 'Sàn giả lập (mock)', exact: true }).click();
    await expect(section.getByRole('radiogroup', { name: 'Cách kết nối' })).toHaveCount(0);
    await expect(section.getByRole('button', { name: /^Tiếp tục tới/ })).toHaveCount(0);
    await expect(section.getByRole('button', { name: 'Tiếp tục', exact: true })).toBeAttached();
  });

  test('dán token: bắt buộc access token, sàn từ chối thì ở lại, đúng thì hiện kết quả rồi thiết lập', async ({ page }) => {
    await menu(page, 'Kênh bán');
    await page.getByRole('button', { name: 'Thêm gian hàng', exact: true }).click();
    const section = page.locator('[data-testid=connect-section]');
    const quaToken = async () => {
      await section.getByRole('button', { name: 'Sàn giả lập (mock)', exact: true }).click();
      await section.getByRole('radio', { name: /^Dán token/ }).click();
      await section.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
    };
    await quaToken();
    const form = page.locator('[data-testid=token-form]');
    await form.getByRole('button', { name: 'Kết nối', exact: true }).click();
    await expect(chua(form, 'Nhập access token')).toBeVisible();
    await form.getByLabel('Access token', { exact: true }).fill('sai');
    await form.getByRole('button', { name: 'Kết nối', exact: true }).click();
    await expect(chua(form, 'Sàn từ chối token này')).toBeVisible();
    await form.getByRole('button', { name: 'Chọn sàn khác', exact: true }).click();
    await expect(form).toHaveCount(0);
    await quaToken();
    await page.getByLabel('Access token', { exact: true }).fill('tok-abc123');
    await form.getByRole('button', { name: 'Kết nối', exact: true }).click();
    const ketQua = section.locator('[data-outcome=connected]');
    await expect(ketQua).toContainText('Đã nối Shop thử ABC123');
    await ketQua.getByRole('button', { name: 'Thiết lập ngay', exact: true }).click();
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
    await expect(page.getByRole('button', { name: 'Thiết lập', exact: true })).toHaveCount(0);
  });
});
