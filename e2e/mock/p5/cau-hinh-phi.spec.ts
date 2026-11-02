import { test, expect, dangNhap, menu } from '../../fixtures';

test.describe('D4.4 · Phiên bản phí và thuế', () => {
  test('CEO soạn, chạy thử, gửi, tự duyệt; không hiện số giả cho dữ liệu giá chưa có', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo'); await menu(page, 'Cấu hình phí và thuế');
    await page.getByRole('button', { name: 'Soạn phiên bản', exact: true }).click(); const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Loại cấu hình', { exact: true }).selectOption('min_margin');
    await dialog.getByLabel('Biên tối thiểu (%)', { exact: true }).fill('101'); await dialog.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
    await expect(dialog.getByText('Từ 0 đến 100%', { exact: true })).toBeVisible();
    await dialog.getByLabel('Biên tối thiểu (%)', { exact: true }).fill('10'); await dialog.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Gửi duyệt', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Chạy thử', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Kết quả chạy thử', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Gửi duyệt', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Gửi duyệt', exact: true }).click();
    await page.getByRole('button', { name: 'Duyệt', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Duyệt', exact: true }).click();
    await expect(page.locator('[data-status=active]').first()).toBeVisible(); await expect(page.getByText('Tự duyệt', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Huỷ phiên bản', exact: true })).toHaveCount(0);
  });
  test('sửa nháp xoá kết quả chạy thử; Admin không có nút duyệt', async ({ page }) => {
    await dangNhap(page, 'admin@commerio.vn', 'admin'); await menu(page, 'Cấu hình phí và thuế');
    await page.getByRole('button', { name: 'Soạn phiên bản', exact: true }).click(); const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Loại cấu hình', { exact: true }).selectOption('min_margin'); await dialog.getByLabel('Biên tối thiểu (%)', { exact: true }).fill('10');
    await dialog.getByRole('button', { name: 'Lưu nháp', exact: true }).click(); await page.getByRole('button', { name: 'Chạy thử', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Gửi duyệt', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sửa nháp', exact: true }).click(); await dialog.getByLabel('Biên tối thiểu (%)', { exact: true }).fill('11'); await dialog.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Gửi duyệt', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Chạy thử', exact: true }).click(); await page.getByRole('button', { name: 'Gửi duyệt', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Gửi duyệt', exact: true }).click();
    await expect(page.locator('[data-status=pending_approval]').first()).toBeVisible(); await expect(page.getByRole('button', { name: 'Duyệt', exact: true })).toHaveCount(0);
  });
  test('bản sửa lỗi giữ bản gốc và ngày hồi tố', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo'); await menu(page, 'Cấu hình phí và thuế'); await page.locator('tbody tr').first().click();
    await page.getByRole('button', { name: 'Soạn bản sửa lỗi', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Lưu nháp', exact: true }).click();
    await expect(page.getByText(/Bản sửa lỗi; hồi tố từ/)).toBeVisible(); await expect(page.getByRole('link', { name: 'Xem bản được sửa', exact: true })).toBeVisible();
  });
  test('giá chờ có cờ Dưới đáy và xác nhận theo version', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo'); await menu(page, 'Giá chờ xác nhận');
    const row = page.locator('tbody tr').filter({ hasText: 'Dưới đáy' }).first(); await expect(row).toBeVisible();
    const id = await row.getAttribute('data-row-id'); await row.getByRole('button', { name: 'Xác nhận giá', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Xác nhận giá dưới đáy', exact: true }).click();
    await expect(page.locator(`tr[data-row-id="${id}"]`)).toHaveCount(0);
  });
});
