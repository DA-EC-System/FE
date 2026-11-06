// Nhãn "Tự duyệt" ở lịch sử trạng thái, nhật ký thao tác và báo cáo CEO (commerio-backend#246; Documents/21 mục 14.1,
// Documents/25 mục 11; US-CT-10 dòng 2, US-NH-03 dòng 9)
import { type Page } from '@playwright/test';
import { chua, dangNhap, expect, menu, test, toast } from '../../fixtures';

/** Đổi trang trong app, không nạp lại: dữ liệu mock nằm trong bộ nhớ trang */
const diToi = (page: Page, path: string) =>
  page.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);

/** CEO duyệt đề nghị chính mình lập (DN-000003 của dữ liệu mock) */
async function ceoTuDuyet(page: Page) {
  await menu(page, 'Mua hàng');
  await page.getByRole('tab', { name: 'Đề nghị nhập', exact: true }).click();
  await chua(page, 'DN-000003', 'tbody tr').click();
  await page.getByRole('button', { name: 'Duyệt', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Duyệt', exact: true }).click();
  await toast(page, 'DN-000003');
  await expect(page.getByTestId('request-status')).toContainText('Đã duyệt');
}

test.describe('Nền tảng · Nhãn tự duyệt', () => {
  test.beforeEach(({ page }) => dangNhap(page, 'ceo@commerio.vn', 'ceo'));

  test('lịch sử trạng thái gắn nhãn đúng bước tự duyệt', async ({ page }) => {
    await ceoTuDuyet(page);
    const lichSu = page.getByTestId('status-history');
    // Mới nhất trên cùng: bước Đã duyệt có nhãn, bước gửi duyệt trước đó không
    await expect(lichSu.locator('li').first().getByTestId('self-approved')).toHaveText('Tự duyệt');
    await expect(lichSu.getByTestId('self-approved')).toHaveCount(1);
  });

  test('nhật ký thao tác có nhãn, lọc riêng được các lần tự duyệt', async ({ page }) => {
    await ceoTuDuyet(page);
    await diToi(page, '/c/cmp-001/admin/audit-logs');
    const dong = chua(page, 'DN-000003', 'tbody tr').filter({ has: page.getByTestId('self-approved') });
    await expect(dong).toHaveCount(1);
    await page.getByRole('combobox', { name: 'Tự duyệt', exact: true }).click();
    await page.getByRole('option', { name: 'Chỉ lần tự duyệt', exact: true }).click();
    const rows = page.locator('tbody tr[data-row-id]');
    await expect(rows).toHaveCount(1);
    await expect(rows.first().getByTestId('self-approved')).toBeVisible();
  });

  test('báo cáo CEO liệt kê lần tự duyệt, bấm mở đúng chứng từ', async ({ page }) => {
    await ceoTuDuyet(page);
    await diToi(page, '/c/cmp-001/reports');
    const khung = page.getByTestId('self-approvals');
    await expect(khung.locator('tbody tr[data-row-id]')).toHaveCount(1);
    await expect(khung).toContainText('approve');
    await khung.getByRole('link', { name: 'Đề nghị nhập', exact: true }).click();
    await expect(page.getByTestId('request-status')).toContainText('Đã duyệt');
  });
});
