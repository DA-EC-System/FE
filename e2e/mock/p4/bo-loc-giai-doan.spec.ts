// P4 · Danh sách đơn: bộ lọc Giai đoạn chỉ hiện giai đoạn hợp tab và Nguồn (FE#288)
import { type Page } from '@playwright/test';
import { chon, dangNhap, expect, menu, test } from '../../fixtures';

const giaiDoan = (page: Page) => page.getByRole('combobox', { name: 'Trạng thái chi tiết', exact: true });

async function cacMuc(page: Page) {
  await giaiDoan(page).click();
  const muc = await page.getByRole('option').allTextContents();
  await page.keyboard.press('Escape');
  return muc;
}

test.describe('P4 · Bộ lọc giai đoạn của danh sách đơn', () => {
  test.beforeEach(async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await menu(page, 'Đơn hàng');
  });

  test('tab Đang xử lý, Nguồn = Sàn: đúng 12 giai đoạn; tab Đã hoàn tất ẩn bộ lọc', async ({ page }) => {
    await page.getByRole('tab', { name: /Đang xử lý/ }).click();
    await chon(page, 'Kênh bán', 'Sàn');
    expect(await cacMuc(page)).toEqual([
      'Tất cả',
      'Chưa ghép SKU',
      'Đang huỷ',
      'Thiếu hàng',
      'Chờ đóng gói',
      'Đã đóng gói',
      'Chờ lấy hàng',
      'Đang giao',
      'Đang tự giao',
      'Giao thất bại',
      'Đang hoàn',
      'Thất lạc',
      'Chờ hoàn tất',
    ]);

    await page.getByRole('tab', { name: /Chưa thanh toán/ }).click();
    expect(await cacMuc(page)).toEqual(['Tất cả', 'Chưa ghép SKU', 'Chờ thanh toán']);

    await page.getByRole('tab', { name: /Đã hoàn tất/ }).click();
    await expect(giaiDoan(page)).toHaveCount(0);
    await page.getByRole('tab', { name: /Đã huỷ/ }).click();
    await expect(giaiDoan(page)).toHaveCount(0);
  });

  test('đổi tab mà giai đoạn đang lọc không còn hợp thì bỏ khỏi URL', async ({ page }) => {
    await page.getByRole('tab', { name: /Đang xử lý/ }).click();
    await chon(page, 'Trạng thái chi tiết', 'Chờ đóng gói');
    await expect.poll(() => new URL(page.url()).searchParams.get('stage')).toBe('reserved');

    const tai = page.waitForRequest((r) => /\/sales\/orders\?/.test(r.url()) && r.url().includes('status=unpaid'));
    await page.getByRole('tab', { name: /Chưa thanh toán/ }).click();
    expect(new URL((await tai).url()).searchParams.get('stage')).toBeNull();
    await expect.poll(() => new URL(page.url()).searchParams.get('stage')).toBeNull();
    await expect(giaiDoan(page)).toHaveText('Tất cả');
  });
});
