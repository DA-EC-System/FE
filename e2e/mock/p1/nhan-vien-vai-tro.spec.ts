// P1 · Nhân viên, vai trò (FE#3 AC-1..AC-10; commerio-backend#8)
import { type Page } from '@playwright/test';
import { chon, chu, chua, dangNhap, expect, gan, loi, menu, mockApi, test, toast } from '../../fixtures';

const dongCo = (page: Page, text: string) => chua(page, text, 'tbody tr[data-row-id]');
const vaiTro = (page: Page, name: string) => chua(page.getByTestId('role-checklist'), name, 'label').click();
const guiMoi = (page: Page) =>
  page.getByRole('dialog').getByRole('button', { name: 'Lưu và gửi thư mời', exact: true }).click();
const moFormMoi = async (page: Page, email: string, fullName: string, role?: string) => {
  await page.getByRole('button', { name: 'Thêm nhân viên', exact: true }).click();
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=fullName]').fill(fullName);
  if (role) await vaiTro(page, role);
};

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

  test('bỏ trống báo tại ô; lỗi 422 gắn vào ô (AC-3); không có CEO trong danh sách vai trò (AC-6)', async ({ page }) => {
    await page.getByRole('button', { name: 'Thêm nhân viên', exact: true }).click();
    const checklist = page.getByTestId('role-checklist');
    await expect(checklist.locator('label', { hasText: /^CEO$/ })).toHaveCount(0);
    await guiMoi(page);
    await expect(loi(page, 'email')).not.toBeEmpty();
    await expect(loi(page, 'fullName')).not.toBeEmpty();
    await expect(gan(checklist, 'data-slot', 'form-item').locator('[data-slot="form-message"]')).not.toBeEmpty();

    await page.locator('input[name=email]').fill('loi.422@congty.vn');
    await page.locator('input[name=fullName]').fill('Người Lỗi');
    await vaiTro(page, 'Sale');
    await mockApi(page, 'post', '/identity/staff', 422, {
      status: 422,
      title: 'Dữ liệu không hợp lệ',
      code: 'validation_failed',
      errors: { email: 'Email này BE không nhận' },
    });
    await guiMoi(page);
    await expect(loi(page, 'email')).toHaveText('Email này BE không nhận');
  });

  test('mời tài khoản mới (invited) và tài khoản đã có ở công ty khác (added) (AC-4)', async ({ page }) => {
    await moFormMoi(page, 'nv.moi@congty.vn', 'Phan Nhân Viên Mới', 'Sale');
    await guiMoi(page);
    await toast(page, 'Đã tạo tài khoản và gửi thư mời tới nv.moi@congty.vn');
    await expect(dongCo(page, 'nv.moi@congty.vn')).toBeAttached();

    await moFormMoi(page, 'da.co@congtykhac.vn', 'Đã Có Tài Khoản', 'Sale');
    await mockApi(page, 'post', '/identity/staff', 201, {
      outcome: 'added',
      member: {
        accountId: 'acc-x',
        email: 'da.co@congtykhac.vn',
        fullName: 'Đã Có Tài Khoản',
        roles: [{ id: 'role-sale', name: 'Sale' }],
        status: 'active',
        isCeo: false,
        pendingFirstLogin: false,
        joinedAt: '2026-10-18T00:00:00.000Z',
        version: 1,
      },
    });
    await guiMoi(page);
    await expect(await toast(page, /Đã thêm .* vào công ty/)).not.toContainText('mật khẩu');
  });

  test('email đã là thành viên thì hỏi thêm vai trò; CEO thì chặn (AC-5)', async ({ page }) => {
    const dialog = page.getByRole('dialog');
    await moFormMoi(page, 'sale@commerio.vn', 'Trần Thị Bán Hàng', 'Nhân viên kho');
    await guiMoi(page);
    await expect(page.getByTestId('already-member')).toContainText('sale@commerio.vn');
    await expect(page.getByTestId('already-member')).toContainText('Sale');
    await dialog.getByRole('button', { name: 'Không', exact: true }).click();
    await expect(page.locator('input[name=email]')).toHaveValue('sale@commerio.vn');
    await guiMoi(page);
    await dialog.getByRole('button', { name: 'Thêm vai trò', exact: true }).click();
    await toast(page, 'Đã thêm vai trò');
    await expect(dongCo(page, 'sale@commerio.vn')).toContainText('Nhân viên kho');
    await expect(dongCo(page, 'sale@commerio.vn')).toContainText('Sale');

    await moFormMoi(page, 'ceo@commerio.vn', 'Lê Hoàng Minh', 'Sale');
    await guiMoi(page);
    await expect(page.getByTestId('already-member')).toContainText('không đổi được vai trò');
    await expect(dialog.getByRole('button', { name: 'Thêm vai trò', exact: true })).toHaveCount(0);
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
    await expect(page.locator('thead')).toContainText('Số tài khoản');
    await expect(page.locator('tbody tr[data-row-id]').filter({ hasText: chu('Có sẵn') })).toHaveCount(3);
    await dongCo(page, 'Sale').getByRole('button', { name: 'Xem tập quyền', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const checkboxes = dialog.getByRole('checkbox');
    await expect(checkboxes.first()).toBeAttached();
    for (const c of await checkboxes.all()) await expect(c).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Lưu', exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();

    await page.getByRole('button', { name: 'Tạo vai trò', exact: true }).click();
    await expect(dialog.locator('fieldset legend').nth(2)).toBeAttached();
    await expect(dialog.locator('button[role=checkbox][value^="platform."]')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(dialog.locator('[data-slot="form-message"]').nth(1)).toBeAttached();
    await dialog.locator('input[name=name]').fill('Sale');
    await chua(dialog, 'Xem sản phẩm', 'label').click();
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(loi(page, 'name')).not.toBeEmpty();
    await page.locator('input[name=name]').fill('Chăm sóc khách 2');
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
    await toast(page, 'Đã tạo vai trò Chăm sóc khách 2');
    await expect(dongCo(page, 'Chăm sóc khách 2')).toBeAttached();

    await dongCo(page, 'Chăm sóc khách hàng').getByRole('button', { name: 'Xoá', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Xoá', exact: true }).click();
    await toast(page, 'còn tài khoản');
    await expect(dongCo(page, 'Chăm sóc khách hàng')).toBeAttached();
  });

  test('Admin: vai trò có quyền mình không có thì chỉ xem (AC-10)', async ({ page }) => {
    await dangNhap(page, 'admin@commerio.vn', 'admin');
    await menu(page, 'Vai trò');
    const row = dongCo(page, 'Nhân viên kho');
    await expect(row.getByRole('button', { name: 'Xem tập quyền', exact: true })).toBeAttached();
    await expect(row.getByRole('button', { name: 'Xoá', exact: true })).toHaveCount(0);
    await row.getByRole('button', { name: 'Xem tập quyền', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveText(/có sẵn|quyền bạn không có/);
  });
});
