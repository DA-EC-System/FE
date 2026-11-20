// P1 với BE thật · Trang giới thiệu ở `/` (FE#401, Documents/27 US-CT-14). Không dùng mockApi.
import { duongDan, expect, test } from '../../fixtures';
import { type CongTyGia, taoCongTyGia } from '../congTyGia';

const UUID = '[0-9a-f-]{36}';

test.describe('P1 · Trang giới thiệu (BE thật)', () => {
  test('AC-1, AC-2: chưa đăng nhập mở / thấy trang giới thiệu, hai nút dẫn tới /register và /login', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Quản lý bán hàng đa sàn cho doanh nghiệp');
    expect(duongDan(page)).toBe('/');
    await expect(page.locator('#hoi-dap [data-slot="collapsible-trigger"]')).toHaveCount(6);

    await page.getByRole('banner').getByRole('link', { name: 'Đăng ký công ty' }).click();
    await expect.poll(() => duongDan(page)).toBe('/register');
    await page.goBack();
    await page.getByRole('banner').getByRole('link', { name: 'Đăng nhập' }).click();
    await expect.poll(() => duongDan(page)).toBe('/login');
  });

  test('AC-4: chưa đăng nhập mở link sâu thì về /login, không về trang giới thiệu', async ({ page }) => {
    await page.goto('/c/00000000-0000-4000-8000-000000000000/sales/orders');
    await expect.poll(() => duongDan(page)).toBe('/login');
  });

  test.describe('đã đăng nhập', () => {
    let cty: CongTyGia;
    test.beforeAll(async ({ browser }) => {
      cty = await taoCongTyGia(browser, { ten: 'Trang giới thiệu' });
    });
    test.afterAll(async () => {
      await cty?.dispose();
    });

    test('AC-3: mở / thì vào thẳng công ty, không thấy trang giới thiệu', async () => {
      await cty.page.goto('/');
      await expect.poll(() => duongDan(cty.page)).toMatch(new RegExp(`^/c/${UUID}`));
      await expect(cty.page.getByRole('heading', { name: 'Quản lý bán hàng đa sàn cho doanh nghiệp' })).toHaveCount(0);
    });
  });
});
