// P1 · Bảng lệnh Ctrl K (FE#133): đi nhanh tới trang, thao tác nhanh theo quyền
import { type Page } from '@playwright/test';
import { dangNhap, duongDan, expect, test } from '../../fixtures';

const bang = (page: Page) => page.getByRole('dialog', { name: 'Tìm và chạy lệnh' });
const o = (page: Page) => bang(page).getByRole('combobox', { name: 'Tìm trang, thao tác' });
const lenh = (page: Page) => bang(page).locator('[cmdk-item]');

/** Đợi header dựng xong rồi mới bấm Ctrl K */
async function moBang(page: Page) {
  await expect(page.getByTestId('open-command-palette')).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(bang(page)).toBeVisible();
}

test.describe('P1 · Bảng lệnh', () => {
  test('Ctrl K, gõ "kho", Enter tới trang Kho; Esc đóng', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await moBang(page);
    await o(page).fill('kho');
    await expect(lenh(page).first()).toHaveText(/^Kho/);
    await expect(lenh(page).first().locator('mark')).toHaveText('Kho');
    await page.keyboard.press('Enter');
    await expect(bang(page)).toBeHidden();
    await expect.poll(() => duongDan(page)).toMatch(/\/inventory$/);

    await page.getByTestId('open-command-palette').click();
    await expect(o(page)).toHaveValue('');
    await page.keyboard.press('Escape');
    await expect(bang(page)).toBeHidden();
  });

  test('gõ không dấu vẫn khớp, ↓ chọn mục kế, chữ khớp tô xanh', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await moBang(page);
    await o(page).fill('doi soat');
    await expect(lenh(page).filter({ hasText: 'Đối soát sàn' }).locator('mark')).toHaveText('Đối soát');
    await o(page).fill('don');
    await expect(lenh(page).first()).toHaveAttribute('data-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(lenh(page).nth(1)).toHaveAttribute('data-selected', 'true');
    await o(page).fill('khong co trang nay');
    await expect(bang(page)).toContainText('Không thấy trang hay thao tác nào khớp.');
  });

  test('không hiện trang, thao tác thiếu quyền: Kho không thấy Sổ tiền, Tạo đơn', async ({ page }) => {
    await dangNhap(page, 'kho@commerio.vn', 'kho');
    await moBang(page);
    await o(page).fill('so tien');
    await expect(lenh(page)).toHaveCount(0);
    await o(page).fill('tao don');
    await expect(lenh(page)).toHaveCount(0);
    await o(page).fill('');
    await expect(lenh(page).filter({ hasText: /^Kho/ })).toHaveCount(1);
    await expect(lenh(page).filter({ hasText: 'Thêm gian hàng' })).toHaveCount(0);
  });

  test('Thêm gian hàng mở luôn hộp thêm, kể cả khi đang ở trang Kênh bán', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    for (let i = 0; i < 2; i++) {
      await moBang(page);
      await o(page).fill('them gian');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog', { name: 'Thêm gian hàng' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Thêm gian hàng' })).toBeHidden();
    }
    expect(duongDan(page)).toMatch(/\/channel\/shops$/);
  });
});
