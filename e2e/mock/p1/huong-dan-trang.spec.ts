// P1 · Hướng dẫn lần đầu vào trang (FE#132): pop-up giới thiệu, tour từng bước, không hiện lại, mở lại bằng "?"
import { type Page } from '@playwright/test';
import { dangNhap, expect, menu, test, toast } from '../../fixtures';

// Spec khác tắt hướng dẫn qua storageState (playwright.config.ts); spec này bật lại
test.use({ storageState: { cookies: [], origins: [] } });

const popup = (page: Page) => page.getByTestId('page-guide');
const tour = (page: Page) => page.getByTestId('guide-tour');
const nutHoi = (page: Page) => page.getByRole('button', { name: 'Hướng dẫn trang này', exact: true });
const daXem = (page: Page) =>
  page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('commerio.guide.')).length);

/** Rời Tổng quan rồi quay lại bằng menu (không tải lại trang, mock giữ phiên) */
async function quayLaiTongQuan(page: Page) {
  await menu(page, 'Kênh bán');
  await expect(nutHoi(page)).toHaveCount(0);
  await menu(page, 'Tổng quan');
  await expect(nutHoi(page)).toBeVisible();
}

test.describe('Hướng dẫn trang', () => {
  test('lần đầu vào Tổng quan hiện pop-up; tour đi từng bước bằng nút và phím', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await expect(popup(page)).toBeVisible();
    await expect(popup(page).getByRole('heading', { name: 'Chào mừng tới Commerio' })).toBeVisible();
    await expect(popup(page).getByRole('listitem')).toHaveCount(3);

    await popup(page).getByRole('button', { name: 'Xem từng bước', exact: true }).click();
    await expect(popup(page)).toHaveCount(0);
    await expect(tour(page)).toBeVisible();
    await expect(tour(page)).toHaveAttribute('role', 'dialog');
    await expect(tour(page).getByText('Bước 1/5', { exact: true })).toBeVisible();
    await expect(tour(page).getByRole('heading', { name: 'Chỉ số chính', exact: true })).toBeVisible();
    // Focus nằm trong thẻ gợi ý
    await expect(tour(page).getByRole('button', { name: 'Tiếp', exact: true })).toBeFocused();
    await expect(page.getByTestId('guide-spotlight')).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(tour(page).getByText('Bước 2/5', { exact: true })).toBeVisible();
    await expect(tour(page).getByRole('heading', { name: 'Việc cần làm', exact: true })).toBeVisible();
    await tour(page).getByRole('button', { name: 'Quay lại', exact: true }).click();
    await expect(tour(page).getByText('Bước 1/5', { exact: true })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(tour(page).getByRole('heading', { name: 'Xem lại hướng dẫn', exact: true })).toBeVisible();
    await tour(page).getByRole('button', { name: 'Xong', exact: true }).click();
    await expect(tour(page)).toHaveCount(0);
    // Xem hết tour thì ghi đã xem
    expect(await daXem(page)).toBe(1);
  });

  test('Kiện hàng, đóng gói, yêu cầu trả có hướng dẫn riêng (FE#139)', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await popup(page).getByRole('button', { name: 'Để sau', exact: true }).click();

    await menu(page, 'Kiện hàng');
    await expect(popup(page).getByRole('heading', { name: 'Kiện hàng', exact: true })).toBeVisible();
    await popup(page).getByRole('button', { name: 'Xem từng bước', exact: true }).click();
    await expect(tour(page).getByText('Bước 1/3', { exact: true })).toBeVisible();
    await expect(tour(page).getByRole('heading', { name: 'Lọc theo trạng thái', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tour(page)).toHaveCount(0);

    await page.locator('tbody tr[data-row-id=pkg-1010]').click();
    await page.locator('[data-testid=package-actions]').getByRole('button', { name: 'Đóng gói', exact: true }).click();
    await expect(popup(page).getByRole('heading', { name: 'Đóng gói', exact: true })).toBeVisible();
    await popup(page).getByRole('button', { name: 'Xem từng bước', exact: true }).click();
    await expect(tour(page).getByRole('heading', { name: 'Quét mã', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    await menu(page, 'Yêu cầu trả');
    await expect(popup(page).getByRole('heading', { name: 'Yêu cầu trả hàng', exact: true })).toBeVisible();
    await popup(page).getByRole('button', { name: 'Xem từng bước', exact: true }).click();
    await expect(tour(page).getByText('Bước 1/3', { exact: true })).toBeVisible();
    await expect(tour(page).getByRole('heading', { name: 'Yêu cầu và kiện không khớp', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tour(page)).toHaveCount(0);
  });

  test('Esc đóng tour', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await popup(page).getByRole('button', { name: 'Xem từng bước', exact: true }).click();
    await expect(tour(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tour(page)).toHaveCount(0);
  });

  test('tích "Không hiện lại" thì quay lại trang không hiện nữa; nút "?" mở lại', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await expect(popup(page)).toBeVisible();
    await popup(page).getByRole('checkbox', { name: 'Không hiện lại' }).check();
    await popup(page).getByRole('button', { name: 'Để sau', exact: true }).click();
    await expect(popup(page)).toHaveCount(0);
    expect(await daXem(page)).toBe(1);

    await quayLaiTongQuan(page);
    await page.waitForTimeout(1200);
    await expect(popup(page)).toHaveCount(0);

    await nutHoi(page).click();
    await expect(popup(page)).toBeVisible();
  });

  test('"Để sau" không ghi đã xem; menu tài khoản "Bật lại tất cả hướng dẫn"', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await popup(page).getByRole('checkbox', { name: 'Không hiện lại' }).check();
    await popup(page).getByRole('button', { name: 'Để sau', exact: true }).click();
    expect(await daXem(page)).toBe(1);

    await page.getByTestId('nav-user').click();
    await page.getByRole('menuitem', { name: 'Bật lại tất cả hướng dẫn', exact: true }).click();
    await toast(page, 'Đã bật lại hướng dẫn');
    expect(await daXem(page)).toBe(0);

    await quayLaiTongQuan(page);
    await expect(popup(page)).toBeVisible();
    // Không tích ô thì "Để sau" không lưu, chỉ không tự hiện lại trong phiên này
    await popup(page).getByRole('button', { name: 'Để sau', exact: true }).click();
    expect(await daXem(page)).toBe(0);
    await quayLaiTongQuan(page);
    await page.waitForTimeout(1200);
    await expect(popup(page)).toHaveCount(0);
  });

  test('nút hành động chính làm nổi danh sách việc cần làm', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await popup(page).getByRole('button', { name: 'Xem việc cần làm', exact: true }).click();
    await expect(popup(page)).toHaveCount(0);
    await expect(page.locator('[data-guide="home-tasks"]')).toHaveAttribute('data-guide-pulse', '');
  });

  test('HelpTip cạnh tiêu đề có link mở tour', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await popup(page).getByRole('button', { name: 'Để sau', exact: true }).click();
    await page.getByRole('heading', { level: 1 }).locator('xpath=..').getByRole('button').click();
    await page.getByRole('button', { name: 'Xem hướng dẫn từng bước', exact: true }).click();
    await expect(tour(page).getByText('Bước 1/5', { exact: true })).toBeVisible();
  });

  test('Sản phẩm, Danh mục & thuộc tính, Kho có hướng dẫn riêng (FE#136)', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await popup(page).getByRole('button', { name: 'Để sau', exact: true }).click();
    const trang: [string, string, string][] = [
      ['Sản phẩm', 'Sản phẩm', 'Thêm sản phẩm'],
      ['Danh mục & thuộc tính', 'Danh mục và thuộc tính', 'Tạo danh mục trước'],
      ['Kho', 'Kho hàng', 'Tồn kho và phiếu kho'],
    ];
    for (const [muc, tieuDe, buoc1] of trang) {
      await menu(page, muc);
      await expect(popup(page)).toBeVisible();
      await expect(popup(page).getByRole('heading', { name: tieuDe, exact: true })).toBeVisible();
      await popup(page).getByRole('button', { name: 'Xem từng bước', exact: true }).click();
      await expect(tour(page).getByText(/^Bước 1\/\d$/)).toBeVisible();
      await expect(tour(page).getByRole('heading', { name: buoc1, exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(tour(page)).toHaveCount(0);
    }
  });

  test('Kho: tour trỏ cột khả dụng và mã SKU', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await popup(page).getByRole('button', { name: 'Để sau', exact: true }).click();
    await menu(page, 'Kho');
    await popup(page).getByRole('button', { name: 'Xem từng bước', exact: true }).click();
    // Nút "Kiểm kê" ở tab Phiếu kho đang ẩn nên bỏ bước đó: 4 bước
    await expect(tour(page).getByText('Bước 1/4', { exact: true })).toBeVisible();
    for (const t of ['Nhóm tồn', 'Cột khả dụng', 'Mở thẻ kho']) {
      await page.keyboard.press('ArrowRight');
      await expect(tour(page).getByRole('heading', { name: t, exact: true })).toBeVisible();
    }
  });

  test('Nhập hàng và các phiếu nhập có hướng dẫn riêng (FE#137)', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await popup(page).getByRole('button', { name: 'Để sau', exact: true }).click();
    await menu(page, 'Mua hàng');
    await expect(popup(page).getByRole('heading', { name: 'Nhập hàng', exact: true })).toBeVisible();
    await popup(page).getByRole('button', { name: 'Xem từng bước', exact: true }).click();
    await expect(tour(page).getByText('Bước 1/3', { exact: true })).toBeVisible();
    for (const t of ['Tạo đề nghị nhập', 'Nhà cung cấp']) {
      await page.keyboard.press('ArrowRight');
      await expect(tour(page).getByRole('heading', { name: t, exact: true })).toBeVisible();
    }
    await page.keyboard.press('Escape');

    const phieu: [string, string, string, string][] = [
      ['Đề nghị nhập', 'DN-000003', 'Đề nghị nhập', 'Đang ở bước nào'],
      ['Phiếu nhận', '', 'Phiếu nhận hàng', 'Số thực nhận'],
      ['Trả NCC', 'TN-000001', 'Trả hàng nhà cung cấp', 'Chọn dòng trả'],
    ];
    for (const [tab, so, tieuDe, buoc1] of phieu) {
      await menu(page, 'Mua hàng');
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await page.locator('tbody tr[data-row-id]').filter({ hasText: so }).first().click();
      await expect(popup(page).getByRole('heading', { name: tieuDe, exact: true })).toBeVisible();
      await popup(page).getByRole('button', { name: 'Xem từng bước', exact: true }).click();
      await expect(tour(page).getByRole('heading', { name: buoc1, exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(tour(page)).toHaveCount(0);
    }
  });

  test('Đơn hàng, chi tiết đơn, tạo đơn, khách hàng có hướng dẫn riêng (FE#138)', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await popup(page).getByRole('button', { name: 'Để sau', exact: true }).click();

    await menu(page, 'Đơn hàng');
    await expect(popup(page).getByRole('heading', { name: 'Đơn hàng', exact: true })).toBeVisible();
    await popup(page).getByRole('button', { name: 'Xem từng bước', exact: true }).click();
    await expect(tour(page).getByText('Bước 1/3', { exact: true })).toBeVisible();
    await expect(tour(page).getByRole('heading', { name: 'Lọc theo trạng thái', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    // Đơn tạo tay có khung thanh toán: tour đủ 5 bước
    await page.locator('tbody tr[data-row-id=ord-1003]').click();
    await expect(popup(page).getByRole('heading', { name: 'Chi tiết đơn', exact: true })).toBeVisible();
    await popup(page).getByRole('button', { name: 'Xem từng bước', exact: true }).click();
    await expect(tour(page).getByText('Bước 1/5', { exact: true })).toBeVisible();
    await expect(tour(page).getByRole('heading', { name: 'Đơn đang ở đâu', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tour(page)).toHaveCount(0);

    await menu(page, 'Đơn hàng');
    await page.getByRole('button', { name: 'Tạo đơn', exact: true }).click();
    await expect(popup(page).getByRole('heading', { name: 'Tạo đơn', exact: true })).toBeVisible();
    await popup(page).getByRole('button', { name: 'Xem từng bước', exact: true }).click();
    await expect(tour(page).getByRole('heading', { name: 'Khách hàng', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    await menu(page, 'Khách hàng');
    await expect(popup(page).getByRole('heading', { name: 'Khách hàng', exact: true })).toBeVisible();
    await popup(page).getByRole('button', { name: 'Xem từng bước', exact: true }).click();
    await expect(tour(page).getByRole('heading', { name: 'Tìm khách', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tour(page)).toHaveCount(0);
  });

  test('mobile chỉ hiện pop-up tóm tắt, không có tour', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await expect(popup(page)).toBeVisible();
    await expect(popup(page).getByRole('button', { name: 'Xem từng bước', exact: true })).toHaveCount(0);
    // Các bước liệt kê ngay trong pop-up
    await expect(popup(page).getByText('Việc quá hạn đứng đầu', { exact: false })).toBeVisible();
  });
});
