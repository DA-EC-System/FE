import { test, expect, dangNhap, menu, chon, mockApi } from '../../fixtures';

test.describe('D4.2–D4.3 · Đối soát', () => {
  test('Admin chốt trong ngưỡng, bắt lý do và không chốt vượt ngưỡng', async ({ page }) => {
    await dangNhap(page, 'admin@commerio.vn', 'admin'); await menu(page, 'Đối soát sàn');
    const rows = page.locator('tbody tr'); await expect(rows.first()).toBeVisible();
    await rows.filter({ hasText: 'Trong hạn mức' }).filter({ hasText: 'Lệch tiền' }).first().click();
    await page.getByRole('button', { name: 'Chốt lệch', exact: true }).click();
    const dialog = page.getByRole('alertdialog'); await dialog.getByRole('button', { name: 'Chốt lệch', exact: true }).click();
    await expect(dialog.getByText('Nhập lý do', { exact: true })).toBeVisible();
    await dialog.getByLabel('Lý do', { exact: true }).fill('Đã xác minh khoản phí với sàn');
    await dialog.getByRole('button', { name: 'Chốt lệch', exact: true }).click();
    await expect(page.locator('[data-status=resolved]').first()).toBeVisible();
    await page.getByRole('link', { name: '← Đối soát sàn', exact: true }).click();
    await rows.filter({ hasText: 'Cần CEO duyệt' }).first().click();
    await expect(page.getByRole('button', { name: 'Chốt lệch', exact: true })).toHaveCount(0);
    await expect(page.getByText('Lệch vượt hạn mức, cần CEO duyệt trước khi chốt.', { exact: true })).toBeVisible();
  });
  test('CEO duyệt lệch vượt ngưỡng, không tự thay đổi trạng thái đơn', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo'); await menu(page, 'Đối soát sàn');
    await page.locator('tbody tr').filter({ hasText: 'Cần CEO duyệt' }).first().click();
    await page.getByRole('button', { name: 'CEO duyệt lệch', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'CEO duyệt lệch', exact: true }).click();
    await expect(page.getByText(/Đã duyệt:/)).toBeVisible(); await expect(page.locator('[data-status=mismatch]').first()).toBeVisible();
  });
  test('kéo quyết toán 202 rồi tự cập nhật, khớp sao kê cần mã', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo'); await menu(page, 'Đối soát sàn');
    await page.getByRole('tab', { name: 'Lần đối soát', exact: true }).click();
    await chon(page, 'Gian hàng', 'ABC Fashion Official'); await page.getByRole('button', { name: 'Kéo quyết toán', exact: true }).click();
    await expect(page.locator('tbody tr').first()).toContainText('Hoàn tất', { timeout: 10000 });
    await page.getByRole('tab', { name: 'Khớp sao kê', exact: true }).click();
    await page.locator('tbody').getByRole('button', { name: 'Khớp sao kê', exact: true }).first().click();
    const dialog = page.getByRole('alertdialog'); await dialog.getByRole('button', { name: 'Khớp sao kê', exact: true }).click();
    await expect(dialog.getByText('Nhập mã sao kê', { exact: true })).toBeVisible();
    await dialog.getByLabel('Mã sao kê', { exact: true }).fill('BANK-DEMO-001'); await dialog.getByRole('button', { name: 'Khớp sao kê', exact: true }).click();
    await expect(page.locator('tbody')).toContainText('BANK-DEMO-001');
  });
  test('409 không chốt lạc phiên bản và giữ lý do để người dùng xem', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo'); await menu(page, 'Đối soát sàn');
    await page.locator('tbody tr').filter({ hasText: 'Lệch tiền' }).first().click();
    const id = new URL(page.url()).pathname.split('/').pop();
    await mockApi(page, 'post', `/finance/payments/${id}/resolve`, 409, { status: 409, code: 'version_conflict' });
    await page.getByRole('button', { name: 'Chốt lệch', exact: true }).click(); const dialog = page.getByRole('alertdialog');
    await dialog.getByLabel('Lý do', { exact: true }).fill('Kiểm tra'); await dialog.getByRole('button', { name: 'Chốt lệch', exact: true }).click();
    await expect(dialog).toContainText('Dữ liệu vừa được người khác sửa'); await expect(page.locator('[data-status=mismatch]').first()).toBeVisible();
  });
  test('Sale không mở được trang tài chính', async ({ page }) => {
    await dangNhap(page, 'sale@commerio.vn', 'sale'); await page.goto('/c/cmp-001/finance/settlements');
    await expect(page.getByText('Vai trò của bạn trong công ty này không có quyền mở trang này.', { exact: true })).toBeVisible();
  });
});
