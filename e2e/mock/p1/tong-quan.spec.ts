// P1 · Trang Tổng quan theo Test_UI v4 (FE#134): dải chỉ số, việc cần làm, doanh thu theo ngày, vai trò
import { type Page } from '@playwright/test';
import { dangNhap, duongDan, expect, test } from '../../fixtures';

const kpi = (page: Page, key: string) => page.locator(`[data-kpi="${key}"]`);
const daiChiSo = (page: Page) => page.getByRole('group', { name: 'Chỉ số chính' });

test.describe('Tổng quan', () => {
  test('CEO thấy doanh thu, lợi nhuận 7 ngày kèm so sánh và sparkline; số việc khớp danh sách', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await expect(page.getByRole('heading', { level: 1, name: 'Tổng quan' })).toBeVisible();
    await expect(daiChiSo(page)).toBeVisible();

    await expect(kpi(page, 'revenue')).toContainText('Doanh thu 7 ngày');
    await expect(kpi(page, 'revenue')).toContainText(/₫/);
    await expect(kpi(page, 'revenue')).toContainText(/so với 7 ngày trước|Chưa có số 7 ngày trước/);
    await expect(kpi(page, 'revenue').getByTestId('sparkline')).toBeVisible();
    await expect(kpi(page, 'profit')).toContainText('Biên lợi nhuận');

    // Cách tính nằm ở nút "?" cạnh tên, không viết dưới số
    await page.getByRole('button', { name: 'Giải thích: Doanh thu 7 ngày', exact: true }).hover();
    await expect(page.getByRole('tooltip').filter({ hasText: '7 ngày gần nhất' }).first()).toBeVisible();
    await page.mouse.move(0, 0);

    const list = page.getByTestId('task-list');
    await expect(list).toBeVisible();
    // Trang chủ hiện 6 việc đầu; mở hết để đếm
    const xemHet = page.getByRole('button', { name: /^Xem tất cả \d+ việc$/ });
    if (await xemHet.count()) await xemHet.click();
    const tong = await list.locator('li').count();
    const quaHan = await list.locator('li[data-severity=overdue]').count();
    const sapHan = await list.locator('li[data-severity=due_soon]').count();
    await expect(kpi(page, 'overdue')).toContainText(String(quaHan));
    await expect(kpi(page, 'due-soon')).toContainText(String(sapHan));
    await expect(kpi(page, 'due-soon')).toContainText(`Trong ${tong} việc cần làm`);
  });

  test('nút "Mở" của một việc đưa tới đúng chứng từ', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    const dong = page.getByTestId('task-list').locator('li').first();
    const mo = dong.getByRole('link', { name: /^Mở / });
    const toi = await mo.getAttribute('href');
    expect(toi).toBeTruthy();
    await mo.click();
    await expect.poll(() => duongDan(page)).toBe(toi);
  });

  test('biểu đồ doanh thu đổi 7/14/30 ngày; link Xem chứng từ tự duyệt mở Nhật ký lọc sẵn (FE#249)', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    const nhom = page.getByRole('group', { name: 'Số ngày' });
    await expect(nhom.getByRole('button', { name: '14 ngày' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('home-revenue-chart')).toBeVisible();
    await nhom.getByRole('button', { name: '30 ngày' }).click();
    await expect(nhom.getByRole('button', { name: '30 ngày' })).toHaveAttribute('aria-pressed', 'true');
    await expect(nhom.getByRole('button', { name: '14 ngày' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('home-revenue-chart')).toBeVisible();

    await expect(page.getByRole('link', { name: 'Xem báo cáo kinh doanh' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Xem chứng từ tự duyệt' }).click();
    await expect.poll(() => duongDan(page)).toBe('/c/cmp-001/admin/audit-logs');
    await expect(page).toHaveURL(/selfApproved=true/);
    await expect(page.getByRole('combobox', { name: 'Tự duyệt', exact: true })).toContainText('Chỉ lần tự duyệt');
  });

  test('không có quyền báo cáo thì chỉ thấy chỉ số việc, không thấy doanh thu', async ({ page }) => {
    await dangNhap(page, 'kho@commerio.vn', 'kho');
    await expect(daiChiSo(page)).toBeVisible();
    await expect(kpi(page, 'overdue')).toBeVisible();
    await expect(kpi(page, 'due-soon')).toBeVisible();
    await expect(kpi(page, 'revenue')).toHaveCount(0);
    await expect(kpi(page, 'profit')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Số ngày' })).toHaveCount(0);
    await expect(page.getByText('Vai trò của bạn')).toBeVisible();
    // Kho không có platform.audit.view: không thấy link chứng từ tự duyệt
    await expect(page.getByRole('link', { name: 'Xem chứng từ tự duyệt' })).toHaveCount(0);
  });
});
