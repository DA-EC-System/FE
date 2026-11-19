// P1 · Việc nền lỗi (FE#145; Documents/21 §14.5, commerio-backend#102)
import { type Page } from '@playwright/test';
import { chon, chua, dangNhap, expect, menu, mockApi, test, toast } from '../../fixtures';

const dongCo = (page: Page, text: string) => chua(page, text, 'tbody tr[data-row-id]');
const dongViec = (page: Page) => page.locator('tbody tr[data-row-id]');
const thanhBen = (page: Page) => page.locator('[data-sidebar="sidebar"]');
const KHONG_CO_QUYEN = /403|không có quyền/i;

test.describe('P1 · Việc nền lỗi', () => {
  test('Admin xem việc lỗi: nhãn loại việc, tên gian hàng, lọc theo loại', async ({ page }) => {
    await dangNhap(page, 'admin@commerio.vn', 'admin');
    await menu(page, 'Việc nền lỗi');
    await expect(dongViec(page)).toHaveCount(4);
    // Mới nhất trước; tên gian hàng lấy từ danh sách gian hàng; hàng lạ hiện nguyên tên
    await expect(dongViec(page).first()).toContainText('Làm mới token sàn');
    await expect(dongCo(page, 'Lấy đơn')).toContainText('ABC Fashion TikTok Shop');
    await expect(dongCo(page, 'Lấy đơn')).toContainText('access token hết hạn');
    await expect(dongCo(page, 'report.daily_rollup')).toContainText('Không theo gian hàng');
    await chon(page, 'Loại việc', 'Đồng bộ listing');
    await expect(dongViec(page)).toHaveCount(1);
    await expect(dongViec(page)).toContainText('ABC Fashion LazMall');
  });

  test('chạy lại có xác nhận, xong thì dòng biến mất; việc không còn thì báo 404', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await menu(page, 'Việc nền lỗi');
    const dong = dongCo(page, 'Lấy đơn');
    await dong.getByRole('button', { name: 'Chạy lại', exact: true }).click();
    const hop = page.getByRole('alertdialog');
    await expect(hop).toContainText('ABC Fashion TikTok Shop');
    await hop.getByRole('button', { name: 'Huỷ', exact: true }).click();
    await expect(dongViec(page)).toHaveCount(4);

    await dong.getByRole('button', { name: 'Chạy lại', exact: true }).click();
    await hop.getByRole('button', { name: 'Chạy lại', exact: true }).click();
    await toast(page, 'Đã đưa việc Lấy đơn về hàng chạy lại');
    await expect(dongViec(page)).toHaveCount(3);
    await expect(page.locator('tbody')).not.toContainText('Lấy đơn');

    await mockApi(page, 'post', '/platform/jobs/dead/:id/retry', 404, { status: 404, code: 'not_found' });
    await dongCo(page, 'Đồng bộ listing').getByRole('button', { name: 'Chạy lại', exact: true }).click();
    await hop.getByRole('button', { name: 'Chạy lại', exact: true }).click();
    await expect(page.locator('[data-sonner-toast]').last()).toBeAttached();
    await expect(dongViec(page)).toHaveCount(3);
  });

  test('rỗng thì báo "Không có việc lỗi"; BE lỗi thì hiện lỗi', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await mockApi(page, 'get', '/platform/jobs/dead', 200, { items: [], total: 0, page: 1, pageSize: 20 });
    await menu(page, 'Việc nền lỗi');
    await expect(page.locator('tbody')).toContainText('Không có việc lỗi');

    await mockApi(page, 'get', '/platform/jobs/dead', 403, { status: 403, code: 'forbidden' });
    await chon(page, 'Loại việc', 'Lấy đơn');
    await expect(page.locator('main [role=alert]').first()).toBeVisible();
  });

  test('Sale không có quyền: không thấy menu, mở URL thì bị chặn', async ({ page }) => {
    await dangNhap(page, 'sale@commerio.vn', 'sale');
    await expect(thanhBen(page)).not.toContainText('Việc nền lỗi');
    await page.goto('/c/cmp-001/admin/dead-jobs');
    await expect(page.locator('main')).toHaveText(KHONG_CO_QUYEN);
  });
});
