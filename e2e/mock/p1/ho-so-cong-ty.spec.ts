// Hồ sơ công ty: địa chỉ đăng ký, tổ chức chịu trách nhiệm hàng hoá (FE#267, commerio-backend#292)
import type { Page } from '@playwright/test';
import { chua, dangNhap, expect, menu, test, toast } from '../../fixtures';

const thanhBen = (page: Page) => page.locator('[data-sidebar="sidebar"]');
const KHONG_CO_QUYEN = /403|không có quyền/i;

test.describe('Hồ sơ công ty', () => {
  test('Admin sửa tổ chức chịu trách nhiệm, lưu xong ghi nhật ký; để trống thì theo tên công ty', async ({ page }) => {
    await dangNhap(page, 'admin@commerio.vn', 'admin');
    await menu(page, 'Hồ sơ công ty');
    const form = page.getByTestId('company-profile-form');
    await expect(form.getByTestId('company-name')).toHaveText('Công ty Cổ phần Thời trang ABC');
    await expect(form.getByTestId('effective-responsible')).toContainText('Công ty Cổ phần Thời trang ABC');

    await form.getByLabel('Tên tổ chức').fill('Xưởng may ABC');
    await form.getByRole('button', { name: 'Lưu' }).click();
    await toast(page, 'Đã lưu hồ sơ công ty');
    await expect(form.getByTestId('effective-responsible')).toContainText('Xưởng may ABC');

    await menu(page, 'Nhật ký thao tác');
    const dong = chua(page, 'Công ty Cổ phần Thời trang ABC', 'tbody tr[data-row-id]').first();
    await expect(dong.getByTestId('audit-operation')).toHaveText('Sửa');
    await dong.getByRole('button', { name: 'Chi tiết' }).click();
    await expect(page.getByRole('dialog').getByTestId('audit-diff')).toContainText('Tổ chức chịu trách nhiệm hàng hoá');
    await page.keyboard.press('Escape');

    await menu(page, 'Hồ sơ công ty');
    await form.getByLabel('Tên tổ chức').fill('');
    await form.getByRole('button', { name: 'Lưu' }).click();
    await toast(page, 'Đã lưu hồ sơ công ty');
    await expect(form.getByTestId('effective-responsible')).toContainText('Đang điền lên sàn: Công ty Cổ phần Thời trang ABC');
  });

  test('Sale không thấy mục Hồ sơ công ty, mở thẳng đường dẫn bị chặn', async ({ page }) => {
    await dangNhap(page, 'sale@commerio.vn', 'sale');
    await expect(thanhBen(page)).not.toContainText('Hồ sơ công ty');
    await page.goto('/c/cmp-001/admin/company');
    await expect(page.locator('main')).toHaveText(KHONG_CO_QUYEN);
  });
});
