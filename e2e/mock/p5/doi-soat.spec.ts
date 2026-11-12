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
    await page.getByRole('button', { name: 'Về danh sách', exact: true }).click();
    await rows.filter({ hasText: 'Cần CEO duyệt' }).first().click();
    // Chờ trang chi tiết dựng xong rồi mới kiểm thiếu nút (FE#107: kiểm vắng mặt trên trang chưa tải luôn qua)
    await expect(page.getByText('Lệch vượt hạn mức, cần CEO duyệt trước khi chốt.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chốt lệch', exact: true })).toHaveCount(0);
  });
  test('CEO soạn cấu hình phí tự chốt lệch được, hiện nhãn Tự duyệt (BE#249)', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo'); await menu(page, 'Đối soát sàn');
    await page.locator('tbody tr').filter({ hasText: 'Trong hạn mức' }).filter({ hasText: 'Lệch tiền' }).first().click();
    await expect(page.getByText('Người soạn phí', { exact: true }).locator('..')).toContainText('Lê Hoàng Minh');
    await page.getByRole('button', { name: 'Chốt lệch', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByLabel('Lý do', { exact: true }).fill('CEO tự đối chiếu Seller Center');
    await dialog.getByRole('button', { name: 'Chốt lệch', exact: true }).click();
    await expect(page.locator('[data-status=resolved]').first()).toBeVisible();
    await expect(page.getByTestId('self-approved')).toHaveCount(2);
  });
  test('CEO duyệt lệch vượt ngưỡng, không tự thay đổi trạng thái đơn', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo'); await menu(page, 'Đối soát sàn');
    await page.locator('tbody tr').filter({ hasText: 'Cần CEO duyệt' }).first().click();
    await page.getByRole('button', { name: 'CEO duyệt lệch', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'CEO duyệt lệch', exact: true }).click();
    await expect(page.getByText('CEO duyệt', { exact: true }).locator('..')).not.toContainText('Chưa duyệt');
    await expect(page.locator('[data-status=mismatch]').first()).toBeVisible();
    // CEO duyệt xong vẫn ở trạng thái lệch, nút Chốt lệch hiện để chốt tiếp
    await expect(page.getByRole('button', { name: 'Chốt lệch', exact: true })).toBeVisible();
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
  test('đơn sàn trừ thuế khác ước tính có cờ Lệch thuế ở danh sách và chi tiết (E135, BE#250)', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo'); await menu(page, 'Đối soát sàn');
    const row = page.locator('tbody tr').filter({ has: page.locator('[data-flag=tax_mismatch]') });
    await expect(row).toHaveCount(1);
    await row.click();
    await expect(page.locator('[data-flag=tax_mismatch]')).toHaveText('Lệch thuế');
  });
  test('tổng dòng tiền không cộng giá vốn: chỉ tính số thực tế của sàn (§21.1, FE#140)', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo'); await menu(page, 'Đối soát sàn');
    await page.locator('tbody tr').filter({ has: page.locator('[data-flag=tax_mismatch]') }).click();
    const cogs = page.locator('tbody tr', { hasText: 'Giá vốn' });
    await expect(cogs).toContainText('300.000');
    await expect(cogs).toContainText('Không tính vào tổng');
    // Ước tính 500.000 đã thay bằng thực tế 460.000; giá vốn -300.000 không cộng
    await expect(page.getByTestId('lines-total')).toContainText('460.000');
    await expect(page.getByTestId('lines-total')).not.toContainText('160.000');
  });
  test('khung Dòng lệch: chốt ngay trên dòng, dòng chuyển Đã chốt rồi ẩn (FE#140)', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo'); await menu(page, 'Đối soát sàn');
    const panel = page.getByTestId('mismatch-panel');
    const dongChot = panel.locator('[data-row-id]').filter({ has: page.getByRole('button', { name: 'Chốt lệch', exact: true }) }).first();
    const ma = (await dongChot.getAttribute('data-row-id')) ?? '';
    const dong = panel.locator(`[data-row-id="${ma}"]`);
    await dong.getByRole('button', { name: 'Chốt lệch', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByLabel('Lý do', { exact: true }).fill('Đã đối chiếu Seller Center');
    await dialog.getByRole('button', { name: 'Chốt lệch', exact: true }).click();
    await expect(dong).toContainText('Đã chốt');
    await expect(dong).toHaveCount(0);
    await expect(page.locator('tbody tr', { hasText: ma }).first()).toContainText('Đã chốt lệch');
  });
  test('Sale không mở được trang tài chính', async ({ page }) => {
    await dangNhap(page, 'sale@commerio.vn', 'sale'); await page.goto('/c/cmp-001/finance/settlements');
    await expect(page.getByText('Vai trò của bạn trong công ty này không có quyền mở trang này.', { exact: true })).toBeVisible();
  });
});
