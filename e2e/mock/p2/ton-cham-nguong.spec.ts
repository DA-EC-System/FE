// SKU chạm ngưỡng: toast một lần, ghi vào chuông, nút mở hộp thêm vào đề nghị nhập điền sẵn số gợi ý (FE#318, US-TK-04;
// Documents/21 mục 13). Chấm "Đang cập nhật tức thời" chỉ ở trang tự đổi theo SSE.
import { dangNhap, dong, expect, menu, test, toast } from '../../fixtures';

test.describe('Tồn chạm ngưỡng', () => {
  test.beforeEach(async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await menu(page, 'Kho');
  });

  test('đặt ngưỡng làm SKU chạm ngưỡng: toast, chuông, hộp thêm vào đề nghị nhập', async ({ page }) => {
    const row = dong(page, 'prd-001-v2');
    const sku = (await row.locator('td').first().innerText()).match(/[A-Z]{2,}-[\w-]+/)?.[0] ?? '';
    await row.getByRole('button', { name: 'Đặt ngưỡng', exact: true }).click();
    await page.getByRole('dialog').locator('#min-qty').fill('9999');
    await page.getByRole('dialog').getByRole('button', { name: 'Lưu', exact: true }).click();

    const t = await toast(page, /đã chạm ngưỡng 9\.999/);
    if (sku) await expect(t).toContainText(sku);
    await t.getByRole('button', { name: 'Thêm vào đề nghị nhập', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Số lượng', { exact: true })).toHaveValue(/^[1-9]\d*$/);
    await dialog.getByRole('button', { name: 'Huỷ', exact: true }).click();

    await page.getByTestId('task-bell').click();
    const muc = page.getByTestId('stock-notices');
    await expect(muc).toContainText('đã chạm ngưỡng 9.999');
    await muc.getByRole('button', { name: 'Thêm vào đề nghị nhập', exact: true }).click();
    await expect(page.getByRole('dialog').getByLabel('Số lượng', { exact: true })).toHaveValue(/^[1-9]\d*$/);
  });

  test('chấm tức thời chỉ ở trang nối SSE', async ({ page }) => {
    await expect(page.getByTestId('realtime-status')).not.toHaveAttribute('data-status', 'manual');
    await menu(page, 'Nhật ký thao tác');
    await expect(page.getByTestId('realtime-status')).toHaveAttribute('data-status', 'manual');
    await expect(page.getByTestId('realtime-status')).toHaveText('Tải lại để xem mới');
  });
});
