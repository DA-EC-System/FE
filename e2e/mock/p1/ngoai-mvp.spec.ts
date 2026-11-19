// P1 · Màn ngoài MVP (Documents/27 mục 8.1): không còn lối vào từ menu, nút, Ctrl K; URL gõ thẳng hiện "Ngoài phạm vi MVP"
// trong khung app và không gọi API của màn đã gỡ (FE#249)
import { type Page } from '@playwright/test';
import { dangNhap, expect, test } from '../../fixtures';

const API_DA_GO = /\/api\/v1\/(sales\/customers|sales\/order-variants|sales\/orders\/new|report\/(shops|self-approvals|export))/;

/** Ghi lại mọi lời gọi tới API của màn đã gỡ */
function ghiApiDaGo(page: Page) {
  const urls: string[] = [];
  page.on('request', (r) => {
    if (API_DA_GO.test(r.url())) urls.push(r.url());
  });
  return urls;
}

test.describe('P1 · Màn ngoài MVP', () => {
  test('CEO: menu, Ctrl K, trang Đơn hàng không còn Khách hàng, Báo cáo kinh doanh, Tạo đơn', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    const menu = page.locator('[data-sidebar="menu-button"]');
    await expect(menu.filter({ hasText: 'Đơn hàng' }).first()).toBeVisible();
    await expect(menu.filter({ hasText: 'Khách hàng' })).toHaveCount(0);
    await expect(menu.filter({ hasText: 'Báo cáo kinh doanh' })).toHaveCount(0);

    await page.getByTestId('open-command-palette').click();
    const bang = page.getByRole('dialog', { name: 'Tìm và chạy lệnh' });
    const o = bang.getByRole('combobox', { name: 'Tìm trang, thao tác' });
    for (const q of ['tao don', 'khach hang', 'bao cao kinh doanh']) {
      await o.fill(q);
      await expect(bang.locator('[cmdk-item]')).toHaveCount(0);
    }
    await page.keyboard.press('Escape');

    await menu.filter({ hasText: 'Đơn hàng' }).first().click();
    await expect(page.locator('tbody tr[data-row-id]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tạo đơn', exact: true })).toHaveCount(0);
  });

  for (const [path, moTa] of [
    ['/sales/orders/new', 'Đơn tạo tay và hồ sơ khách không thuộc bản này. Đơn từ sàn xem ở Đơn hàng.'],
    ['/sales/customers', 'Đơn tạo tay và hồ sơ khách không thuộc bản này. Đơn từ sàn xem ở Đơn hàng.'],
    ['/sales/customers/cus-001', 'Đơn tạo tay và hồ sơ khách không thuộc bản này. Đơn từ sàn xem ở Đơn hàng.'],
    ['/reports', 'Lợi nhuận theo đơn xem ở Sổ giao dịch, số liệu chính ở Tổng quan.'],
  ] as const) {
    test(`gõ thẳng ${path}: trang Ngoài phạm vi MVP trong khung app, không gọi API đã gỡ`, async ({ page }) => {
      await dangNhap(page, 'ceo@commerio.vn', 'ceo');
      const daGoi = ghiApiDaGo(page);
      await page.goto(`/c/cmp-001${path}`);
      await expect(page.getByRole('heading', { name: 'Chưa có trong phiên bản này', exact: true })).toBeVisible();
      await expect(page.getByText('Commerio chỉ bán qua sàn', { exact: true })).toBeVisible();
      await expect(page.getByText(moTa, { exact: true })).toBeVisible();
      // Khung app còn: menu bên trái vẫn đi được
      await expect(page.locator('[data-sidebar="menu-button"]').filter({ hasText: 'Đơn hàng' }).first()).toBeVisible();
      expect(daGoi).toEqual([]);
    });
  }

  test('trang kết quả cổng thanh toán đã gỡ: /thanh-toan/ket-qua là trang không tìm thấy', async ({ page }) => {
    await page.goto('/thanh-toan/ket-qua');
    await expect(page.getByText('Không tìm thấy trang', { exact: true })).toBeVisible();
    await expect(page.getByText('Cảm ơn bạn')).toHaveCount(0);
  });

  test('chi tiết đơn: tên khách là chữ, không link sang hồ sơ khách', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await page.goto('/c/cmp-001/sales/orders/ord-1003');
    const khach = page.locator('[data-guide=order-info]');
    await expect(khach).toContainText('Trần Minh Châu');
    await expect(khach.locator('a[href*="/sales/customers/"]')).toHaveCount(0);
  });
});
