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
    await expect(popup(page).getByRole('heading', { name: 'Chào mừng tới trang Tổng quan' })).toBeVisible();
    await expect(popup(page).getByRole('listitem')).toHaveCount(3);

    await popup(page).getByRole('button', { name: 'Xem từng bước', exact: true }).click();
    await expect(popup(page)).toHaveCount(0);
    await expect(tour(page)).toBeVisible();
    await expect(tour(page)).toHaveAttribute('role', 'dialog');
    await expect(tour(page).getByText('Bước 1/4', { exact: true })).toBeVisible();
    await expect(tour(page).getByRole('heading', { name: 'Việc cần làm', exact: true })).toBeVisible();
    // Focus nằm trong thẻ gợi ý
    await expect(tour(page).getByRole('button', { name: 'Tiếp', exact: true })).toBeFocused();
    await expect(page.getByTestId('guide-spotlight')).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(tour(page).getByText('Bước 2/4', { exact: true })).toBeVisible();
    await expect(tour(page).getByRole('heading', { name: 'Vai trò của bạn', exact: true })).toBeVisible();
    await tour(page).getByRole('button', { name: 'Quay lại', exact: true }).click();
    await expect(tour(page).getByText('Bước 1/4', { exact: true })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(tour(page).getByRole('heading', { name: 'Xem lại hướng dẫn', exact: true })).toBeVisible();
    await tour(page).getByRole('button', { name: 'Xong', exact: true }).click();
    await expect(tour(page)).toHaveCount(0);
    // Xem hết tour thì ghi đã xem
    expect(await daXem(page)).toBe(1);
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
    await expect(tour(page).getByText('Bước 1/4', { exact: true })).toBeVisible();
  });

  test('mobile chỉ hiện pop-up tóm tắt, không có tour', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await expect(popup(page)).toBeVisible();
    await expect(popup(page).getByRole('button', { name: 'Xem từng bước', exact: true })).toHaveCount(0);
    // Các bước liệt kê ngay trong pop-up
    await expect(popup(page).getByText('Vai trò quyết định menu', { exact: false })).toBeVisible();
  });
});
