// P1 · Nhân viên, vai trò (FE#3 AC-1..AC-10; commerio-backend#8)
import { type Page } from '@playwright/test';
import { chon, chu, chua, dangNhap, expect, gan, loi, menu, mockApi, test, toast } from '../../fixtures';

const dongCo = (page: Page, text: string) => chua(page, text, 'tbody tr[data-row-id]');

test.describe('P1 · Nhân viên (CEO)', () => {
  test.beforeEach(async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await menu(page, 'Nhân viên');
    await expect(page.locator('tbody tr[data-row-id]').nth(1)).toBeAttached();
  });

  test('danh sách: CEO đứng đầu, tìm, lọc trạng thái và vai trò (AC-1)', async ({ page }) => {
    const rows = page.locator('tbody tr[data-row-id]');
    for (const h of ['Họ tên', 'Email', 'Vai trò', 'Trạng thái']) await expect(page.locator('thead')).toContainText(h);
    await expect(rows.first()).toContainText('Lê Hoàng Minh');
    await expect(rows.first()).toContainText('CEO');
    await expect(page.getByTestId('page-range')).toHaveText(/\d+–\d+ \/ \d+/);
    await page.getByRole('searchbox').fill('kho');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Ngô Văn Kho');
    await page.getByRole('searchbox').fill('');
    await chon(page, 'Trạng thái', 'Tạm khoá');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Hồ Đã Nghỉ');
    await chon(page, 'Trạng thái', 'Tất cả');
    await chon(page, 'Vai trò', 'Sale');
    await expect(async () => {
      const texts = await rows.allInnerTexts();
      expect(texts.length).toBeGreaterThanOrEqual(2);
      for (const t of texts) expect(t).toContain('Sale');
    }).toPass();
  });

  test('dòng CEO (chính mình) khoá nút, dòng khác bấm được (AC-2)', async ({ page }) => {
    const buttons = page.locator('tbody tr[data-row-id]').first().locator('button');
    await expect(buttons).toHaveCount(2);
    for (const b of await buttons.all()) await expect(b).toBeDisabled();
    await expect(dongCo(page, 'Trần Thị Bán Hàng').locator('button').first()).toBeEnabled();
  });

  // Mời bằng link (US-CT-05..07): e2e/mock/p1/moi-nhan-vien-link.spec.ts
  test('hộp thoại mời không có vai trò CEO; chưa chọn vai trò thì báo tại ô (AC-6)', async ({ page }) => {
    await page.getByRole('button', { name: 'Mời nhân viên', exact: true }).click();
    const checklist = page.getByTestId('role-checklist');
    await expect(checklist.locator('label', { hasText: /^CEO$/ })).toHaveCount(0);
    await page.getByRole('dialog').getByRole('button', { name: 'Tạo link mời', exact: true }).click();
    await expect(gan(checklist, 'data-slot', 'form-item').locator('[data-slot="form-message"]')).not.toBeEmpty();
  });

  test('permission_not_held, protected_account hiện câu tiếng Việt khác nhau (AC-6)', async ({ page }) => {
    await dongCo(page, 'kho@commerio.vn').getByRole('button', { name: 'Đổi vai trò', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const thongBao = dialog.locator('[role=alert],[role=status]').first();
    await mockApi(page, 'put', '/identity/staff/:id/roles', 403, { status: 403, title: 'Forbidden', code: 'permission_not_held' });
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(thongBao).toHaveText(/[À-ỹ]/);
    await expect(thongBao).not.toContainText('permission_not_held');
    const m1 = (await thongBao.textContent()) ?? '';
    await mockApi(page, 'put', '/identity/staff/:id/roles', 403, { status: 403, title: 'Forbidden', code: 'protected_account' });
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(thongBao).not.toHaveText(m1);
    await expect(thongBao).toHaveText(/[À-ỹ]/);
  });

  test('khoá có xác nhận; mở khoá gặp version_conflict thì báo trạng thái mới (AC-7)', async ({ page }) => {
    const alert = page.getByRole('alertdialog');
    await dongCo(page, 'Đỗ Mới Vào').getByRole('button', { name: 'Tạm khoá', exact: true }).click();
    await expect(alert).toContainText('Đỗ Mới Vào');
    await alert.getByRole('button', { name: 'Tạm khoá', exact: true }).click();
    await toast(page, 'Đã tạm khoá Đỗ Mới Vào');
    await expect(dongCo(page, 'Đỗ Mới Vào')).toContainText('Tạm khoá');

    await mockApi(page, 'post', '/identity/staff/:id/unlock', 409, {
      status: 409,
      title: 'Conflict',
      code: 'version_conflict',
      current: {
        accountId: 'acc-006',
        email: 'nghi@commerio.vn',
        fullName: 'Hồ Đã Nghỉ',
        roles: [],
        status: 'active',
        isCeo: false,
        joinedAt: '2026-02-01T08:00:00.000Z',
        version: 9,
      },
    });
    await dongCo(page, 'Hồ Đã Nghỉ').getByRole('button', { name: 'Mở khoá', exact: true }).click();
    await alert.getByRole('button', { name: 'Mở khoá', exact: true }).click();
    await expect(await toast(page, 'vừa được người khác sửa')).toContainText('hoạt động');
  });
});

test.describe('P1 · Vai trò', () => {
  test('CEO: vai trò có sẵn chỉ xem; tạo vai trò kiểm tên trùng; xoá vai trò còn người dùng (AC-8..AC-10)', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await menu(page, 'Vai trò');
    await expect(page.locator('thead')).toContainText('Số nhân viên');
    await expect(page.locator('tbody tr[data-row-id]').filter({ hasText: chu('Mặc định') })).toHaveCount(4);
    await dongCo(page, 'Sale').getByRole('button', { name: 'Xem quyền', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const checkboxes = dialog.getByRole('checkbox');
    await expect(checkboxes.first()).toBeAttached();
    for (const c of await checkboxes.all()) await expect(c).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Lưu', exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Đóng', exact: true }).first().click();

    await page.getByRole('button', { name: 'Tạo vai trò', exact: true }).click();
    await expect(dialog.locator('fieldset legend').nth(2)).toBeAttached();
    await expect(dialog.locator('button[role=checkbox][value^="platform."]')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(dialog.locator('[data-slot="form-message"]').nth(1)).toBeAttached();
    await dialog.locator('input[name=name]').fill('Sale');
    await chua(dialog, 'Xem, tra cứu sản phẩm', 'label').click();
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(loi(page, 'name')).not.toBeEmpty();
    await page.locator('input[name=name]').fill('Chăm sóc khách 2');
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
    await toast(page, 'Đã tạo vai trò Chăm sóc khách 2');
    await expect(dongCo(page, 'Chăm sóc khách 2')).toBeAttached();

    await dongCo(page, 'Chăm sóc khách hàng').getByRole('button', { name: 'Xoá', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Xoá', exact: true }).click();
    await toast(page, 'còn nhân viên');
    await expect(dongCo(page, 'Chăm sóc khách hàng')).toBeAttached();
  });

  test('Admin: vai trò có quyền mình không có thì chỉ xem (AC-10)', async ({ page }) => {
    await dangNhap(page, 'admin@commerio.vn', 'admin');
    await menu(page, 'Vai trò');
    const row = dongCo(page, 'Nhân viên kho');
    await expect(row.getByRole('button', { name: 'Xem quyền', exact: true })).toBeAttached();
    await expect(row.getByRole('button', { name: 'Xoá', exact: true })).toHaveCount(0);
    await row.getByRole('button', { name: 'Xem quyền', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveText(/mặc định|quyền mà bạn không có/);
    await page.getByRole('dialog').getByRole('button', { name: 'Đóng', exact: true }).first().click();

    // Tạo vai trò: quyền Admin không có thì khoá, rê vào thấy lý do (FE#141)
    await page.getByRole('button', { name: 'Tạo vai trò', exact: true }).click();
    const khoa = page.getByRole('dialog').locator('[data-blocked-reason]');
    await expect(khoa.first()).toHaveAttribute('data-blocked-reason', /không có quyền này/);
  });
});
