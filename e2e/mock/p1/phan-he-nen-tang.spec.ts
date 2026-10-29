// P1 · Phân hệ, nhật ký thao tác, quản trị nền tảng, phân quyền (FE#3 AC-2, AC-11..AC-16; commerio-backend#8, #10)
import { type Page } from '@playwright/test';
import { chon, chua, dangNhap, duongDan, expect, gan, menu, mockApi, moiPhanTu, test, toast } from '../../fixtures';

const dongCo = (page: Page, text: string) => chua(page, text, 'tbody tr[data-row-id]');
const thanhBen = (page: Page) => page.locator('[data-sidebar="sidebar"]');
const KHONG_CO_QUYEN = /403|không có quyền/i;

test.describe('P1 · Phân hệ, nhật ký (CEO)', () => {
  test.beforeEach(({ page }) => dangNhap(page, 'ceo@commerio.vn', 'ceo'));

  test('5 thẻ phân hệ; Kênh bán đã có dữ liệu thì không tắt được (AC-11)', async ({ page }) => {
    await menu(page, 'Phân hệ');
    await expect(page.locator('[data-module]')).toHaveCount(5);
    const channel = page.locator('[data-module="channel"]');
    await expect(channel.getByRole('button', { name: 'Tắt', exact: true })).toBeDisabled();
    await expect(channel.getByTestId('has-data-note')).toContainText('không tắt được');
  });

  test('bật Trợ lý AI phải tích đồng ý; module_state_changed thì báo (AC-12)', async ({ page }) => {
    await menu(page, 'Phân hệ');
    const assistant = page.locator('[data-module="assistant"]');
    await assistant.getByRole('button', { name: 'Bật', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Đồng ý và bật', exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Không đồng ý', exact: true }).click();
    await expect(assistant).toContainText('Đang tắt');
    await assistant.getByRole('button', { name: 'Bật', exact: true }).click();
    await dialog.getByRole('checkbox').click();
    await dialog.getByRole('button', { name: 'Đồng ý và bật', exact: true }).click();
    await toast(page, 'Đã bật Trợ lý AI');
    await expect(assistant).toContainText('Đang bật');

    await mockApi(page, 'put', '/platform/modules/:code', 409, {
      status: 409,
      title: 'Conflict',
      code: 'module_state_changed',
      current: { code: 'assistant', enabled: false, hasData: false, enabledAt: null, enabledBy: null, aiConsentAt: null, aiConsentBy: null },
    });
    await assistant.getByRole('button', { name: 'Tắt', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Tắt', exact: true }).click();
    await toast(page, 'vừa được người khác tắt');
  });

  test('nhật ký: lọc theo thao tác, xem trước/sau (AC-13)', async ({ page }) => {
    await menu(page, 'Nhật ký thao tác');
    const rows = page.locator('tbody tr[data-row-id]');
    await expect(rows).not.toHaveCount(0);
    await chon(page, 'Thao tác', 'Sửa');
    await moiPhanTu(rows, (t) => expect(t).toContain('Sửa'));
    await rows.first().click();
    await expect(page.getByTestId('audit-diff').locator('tr[data-changed]')).not.toHaveCount(0);
  });
});

test.describe('P1 · Phân quyền khu quản trị công ty', () => {
  test('Admin: không có Phân hệ, có Nhật ký; mở Phân hệ bằng URL bị chặn (AC-11, AC-13)', async ({ page }) => {
    await dangNhap(page, 'admin@commerio.vn', 'admin');
    await expect(thanhBen(page)).toContainText('Nhật ký thao tác');
    await expect(thanhBen(page)).not.toContainText('Phân hệ');
    await page.goto('/c/cmp-001/admin/modules');
    await expect(page.locator('main')).toHaveText(KHONG_CO_QUYEN);
  });

  test('Sale: xem danh sách nhân viên không có nút thao tác; Phân hệ, Nhật ký bị chặn (AC-2, AC-11, AC-13)', async ({ page }) => {
    await dangNhap(page, 'sale@commerio.vn', 'sale');
    await expect(thanhBen(page)).not.toContainText('Phân hệ');
    await expect(thanhBen(page)).not.toContainText('Nhật ký thao tác');
    await page.goto('/c/cmp-001/admin/staff');
    await expect(page.getByRole('button', { name: 'Thêm nhân viên', exact: true })).toHaveCount(0);
    await expect(page.locator('tbody button')).toHaveCount(0);
    for (const p of ['/c/cmp-001/admin/audit-logs', '/c/cmp-001/admin/modules']) {
      await page.goto(p);
      await expect(page.locator('main')).toHaveText(KHONG_CO_QUYEN);
    }
  });
});

test.describe('P1 · Quản trị nền tảng', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name=email]').fill('platform@commerio.vn');
    await page.locator('input[name=password]').fill('platform');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect.poll(() => duongDan(page)).toMatch(/^\/platform/);
  });

  test('khoá công ty phải có lý do; mở khoá không hỏi lý do (AC-14)', async ({ page }) => {
    await menu(page, 'Công ty');
    await expect(page.locator('thead')).not.toHaveText(/doanh thu|đơn hàng|sản phẩm/i);
    await dongCo(page, 'Đồ chơi').getByRole('button', { name: 'Khoá', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Khoá công ty', exact: true }).click();
    const reason = page.locator('textarea[name=reason]');
    await expect(gan(reason, 'data-slot', 'form-item').locator('[data-slot="form-message"]')).toHaveText('Cần nhập lý do khoá');
    await reason.fill('Kiểm thử khoá');
    await page.getByRole('dialog').getByRole('button', { name: 'Khoá công ty', exact: true }).click();
    await toast(page, 'Đã khoá');
    await expect(dongCo(page, 'Đồ chơi')).toContainText('Đã khoá');

    await dongCo(page, 'Nông sản').getByRole('button', { name: 'Mở khoá', exact: true }).click();
    const alert = page.getByRole('alertdialog');
    await expect(alert.locator('textarea')).toHaveCount(0);
    await alert.getByRole('button', { name: 'Mở khoá', exact: true }).click();
    await toast(page, 'Đã mở khoá');

    await menu(page, 'Nhật ký nền tảng');
    await expect(page.locator('tbody tr[data-row-id]')).not.toHaveCount(0);
  });

  test('version_conflict thì báo trạng thái mới; 404 thì "Không tìm thấy" (AC-16)', async ({ page }) => {
    await menu(page, 'Công ty');
    await mockApi(page, 'post', '/platform/companies/:id/lock', 409, {
      status: 409,
      title: 'Conflict',
      code: 'version_conflict',
      current: { id: 'cmp-002', name: 'Công ty TNHH Mỹ phẩm XYZ', status: 'locked', lockReason: 'Khoá ở phiên khác', version: 7 },
    });
    await dongCo(page, 'Mỹ phẩm XYZ').getByRole('button', { name: 'Khoá', exact: true }).click();
    await page.locator('textarea[name=reason]').fill('Thử xung đột');
    await page.getByRole('dialog').getByRole('button', { name: 'Khoá công ty', exact: true }).click();
    await expect(await toast(page, 'vừa được người khác đổi')).toContainText('đã khoá');

    await mockApi(page, 'post', '/platform/companies/:id/unlock', 404, { status: 404, title: 'Không tìm thấy', code: 'not_found' });
    await dongCo(page, 'Nông sản').getByRole('button', { name: 'Mở khoá', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Mở khoá', exact: true }).click();
    await toast(page, 'Không tìm thấy');
  });

  test('quản trị nền tảng mở trang công ty thì bị chặn, không lộ dữ liệu (AC-15)', async ({ page }) => {
    await page.goto('/c/cmp-001/admin/staff');
    await expect(page.locator('body')).toHaveText(KHONG_CO_QUYEN);
    await expect(page.locator('body')).not.toContainText('ceo@commerio.vn');
  });
});
