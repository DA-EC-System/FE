import { test, expect, dangNhap, menu } from '../../fixtures';

test.describe('D4.4 · Phiên bản phí và thuế', () => {
  test('CEO soạn, chạy thử, gửi, tự duyệt; không hiện số giả cho dữ liệu giá chưa có', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo'); await menu(page, 'Cấu hình phí và thuế');
    await page.getByRole('button', { name: 'Soạn phiên bản', exact: true }).click(); const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Loại cấu hình', { exact: true }).selectOption('min_margin');
    await dialog.getByLabel('Lãi tối thiểu trên giá vốn (%)', { exact: true }).fill('101'); await dialog.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
    await expect(dialog.getByText('Từ 0 đến 100%', { exact: true })).toBeVisible();
    await dialog.getByLabel('Lãi tối thiểu trên giá vốn (%)', { exact: true }).fill('10'); await dialog.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
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
    await dialog.getByLabel('Loại cấu hình', { exact: true }).selectOption('min_margin'); await dialog.getByLabel('Lãi tối thiểu trên giá vốn (%)', { exact: true }).fill('10');
    await dialog.getByRole('button', { name: 'Lưu nháp', exact: true }).click(); await page.getByRole('button', { name: 'Chạy thử', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Gửi duyệt', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sửa nháp', exact: true }).click(); await dialog.getByLabel('Lãi tối thiểu trên giá vốn (%)', { exact: true }).fill('11'); await dialog.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Gửi duyệt', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Chạy thử', exact: true }).click(); await page.getByRole('button', { name: 'Gửi duyệt', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Gửi duyệt', exact: true }).click();
    await expect(page.locator('[data-status=pending_approval]').first()).toBeVisible(); await expect(page.getByRole('button', { name: 'Duyệt', exact: true })).toHaveCount(0);
  });
  test('bản sửa lỗi giữ bản gốc và ngày hồi tố', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo'); await menu(page, 'Cấu hình phí và thuế'); await page.locator('tbody tr').first().click();
    await page.getByRole('button', { name: 'Soạn bản sửa lỗi', exact: true }).click();
    // Documents/21 §21.4: bản sửa lỗi cùng ngày hiệu lực với bản bị sửa, FE khoá ô ngày
    await expect(page.getByRole('dialog').getByLabel('Ngày hiệu lực', { exact: true })).toBeDisabled();
    await page.getByRole('dialog').getByRole('button', { name: 'Lưu nháp', exact: true }).click();
    await expect(page.getByText(/Bản sửa lỗi; hồi tố từ/)).toBeVisible(); await expect(page.getByRole('link', { name: 'Xem bản được sửa', exact: true })).toBeVisible();
  });
  test('Đang áp dụng hôm nay: mỗi ô một bản, có lịch bản chờ hiệu lực; bản chờ so với bản đang áp dụng (#144)', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo'); await menu(page, 'Cấu hình phí và thuế');
    const panel = page.getByTestId('active-configs');
    await expect(panel.getByTestId('active-config').filter({ hasText: 'Loại hình kinh doanh' })).toContainText('Doanh nghiệp');
    await expect(panel.getByTestId('active-config').filter({ hasText: 'Biểu thuế' })).toContainText('Thuế suất GTGT đầu ra 10%');
    const fee = panel.getByTestId('active-config').filter({ hasText: 'Phí sàn' });
    await expect(fee).toContainText('Tổng phí sàn 6%');
    await fee.getByRole('link', { name: /^Bản mới áp dụng từ / }).click();
    await expect(page.locator('[data-status=scheduled]').first()).toBeVisible();
    const bang = page.getByTestId('config-payload');
    await expect(bang.getByRole('link', { name: 'Bản đang áp dụng', exact: true })).toBeVisible();
    await expect(bang.locator('tr[data-changed]')).toHaveCount(1);
    await expect(bang.locator('tr[data-changed]')).toContainText('4%');
    await expect(bang.locator('tr[data-changed]')).toContainText('3%');
  });
  test('quy tắc thuế có thuế GTGT đầu ra, giải thích chỉ áp cho doanh nghiệp (#144)', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo'); await menu(page, 'Cấu hình phí và thuế');
    await page.getByRole('button', { name: 'Soạn phiên bản', exact: true }).click(); const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Loại cấu hình', { exact: true }).selectOption('tax_rules');
    await dialog.getByLabel('Thuế GTGT sàn khấu trừ (%)', { exact: true }).fill('1'); await dialog.getByLabel('Thuế TNCN sàn khấu trừ (%)', { exact: true }).fill('0.5');
    await dialog.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
    await expect(dialog.getByText('Nhập số hợp lệ', { exact: true })).toBeVisible();
    await dialog.getByLabel('Thuế suất GTGT đầu ra (%)', { exact: true }).fill('8');
    await dialog.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
    const dong = page.getByTestId('config-payload').locator('tr').filter({ hasText: 'Thuế suất GTGT đầu ra' });
    await expect(dong).toContainText('8%'); await expect(dong).toContainText('10%');
    await dong.getByRole('button').hover();
    await expect(page.getByRole('tooltip').first()).toContainText('Chỉ dùng cho doanh nghiệp');
  });
  test('giá chờ có cờ Dưới đáy và xác nhận theo version', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo'); await menu(page, 'Giá chờ xác nhận');
    const row = page.locator('tbody tr').filter({ hasText: 'Dưới đáy' }).first(); await expect(row).toBeVisible();
    const id = await row.getAttribute('data-row-id'); await row.getByRole('button', { name: 'Xác nhận giá', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Xác nhận giá dưới đáy', exact: true }).click();
    await expect(page.locator(`tr[data-row-id="${id}"]`)).toHaveCount(0);
  });
});
