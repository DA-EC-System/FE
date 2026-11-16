// P1 · Mời nhân viên bằng link (FE#148: US-CT-05 tạo link, US-CT-06 trang /tham-gia, US-CT-07 tab Chờ duyệt;
// US-CT-05 AC 4–6: tab Link đã tạo, huỷ link)
// Dữ liệu mock nằm trong bộ nhớ trang: chuyển trang bằng pushState để giữ link vừa tạo và yêu cầu vừa nộp.
import { type Page } from '@playwright/test';
import { chua, dangNhap, expect, loi, menu, mockApi, test, toast } from '../../fixtures';

const MOCK_OTP = '123456';

/** Chuyển trang trong ứng dụng, không tải lại (giữ dữ liệu mock) */
const toi = (page: Page, path: string) =>
  page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);

const dongCo = (page: Page, text: string) => chua(page, text, 'tbody tr[data-row-id]');

async function taoLink(page: Page, vaiTro = 'Sale') {
  await page.getByRole('button', { name: 'Mời nhân viên', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await chua(dialog.getByTestId('role-checklist'), vaiTro, 'label').click();
  await dialog.getByRole('button', { name: 'Tạo link mời', exact: true }).click();
  const link = await dialog.getByRole('textbox', { name: 'Link mời' }).inputValue();
  expect(link).toMatch(/\/tham-gia#mock-/);
  const url = new URL(link);
  return url.pathname + url.hash;
}

/** Điền trang tham gia tới bước đặt mật khẩu */
async function xacMinh(page: Page, email: string, fullName: string) {
  await expect(page.getByText('Công ty Cổ phần Thời trang ABC').first()).toBeVisible();
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=fullName]').fill(fullName);
  await page.getByRole('button', { name: 'Gửi mã xác minh', exact: true }).click();
  await expect(page.getByText(`Mã 6 số gửi tới ${email}`)).toBeVisible();
  await page.locator('input[name=code]').fill(MOCK_OTP);
  await page.getByRole('button', { name: 'Xác minh', exact: true }).click();
}

test.describe('P1 · Mời nhân viên bằng link', () => {
  test.beforeEach(async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await menu(page, 'Nhân viên');
    await expect(page.locator('tbody tr[data-row-id]').nth(1)).toBeAttached();
  });

  test('trọn luồng: tạo link → tham gia → duyệt → nhân viên đăng nhập được', async ({ page }) => {
    const path = await taoLink(page);
    const dialog = page.getByRole('dialog');
    // Đóng khi chưa sao chép thì hỏi lại
    await dialog.getByTestId('invitation-link').getByRole('button', { name: 'Đóng', exact: true }).click();
    await expect(dialog).toContainText('Bạn chưa sao chép link');
    await dialog.getByRole('button', { name: 'Vẫn đóng', exact: true }).click();
    await expect(dialog).toBeHidden();

    await toi(page, path);
    await xacMinh(page, 'moi.nv@gmail.com', 'Phan Văn Mới');
    await page.locator('input[name=password]').fill('MatKhau@123');
    await page.locator('input[name=confirmPassword]').fill('MatKhau@123');
    await page.getByRole('button', { name: 'Gửi yêu cầu tham gia', exact: true }).click();
    await expect(page.getByTestId('join-done')).toContainText('đang chờ duyệt');

    // Chưa duyệt thì chưa đăng nhập được
    const dangNhapApi = () =>
      page.evaluate(async () => {
        const res = await fetch('/api/v1/identity/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'moi.nv@gmail.com', password: 'MatKhau@123' }),
        });
        return res.status;
      });
    expect(await dangNhapApi()).not.toBe(200);

    await toi(page, '/c/cmp-001/admin/staff?tab=pending');
    await expect(page.getByTestId('pending-count')).toHaveText('3');
    const row = dongCo(page, 'Phan Văn Mới');
    await expect(row).toContainText('Sale');
    await expect(row).toContainText('Lê Hoàng Minh');
    await row.getByRole('button', { name: 'Duyệt', exact: true }).click();
    await toast(page, 'Đã duyệt Phan Văn Mới');
    await expect(dongCo(page, 'Phan Văn Mới')).toHaveCount(0);
    expect(await dangNhapApi()).toBe(200);

    await page.getByRole('tab', { name: /Nhân viên/ }).click();
    await expect(dongCo(page, 'moi.nv@gmail.com')).toContainText('Sale');
  });

  test('sao chép link thì đóng không hỏi lại (US-CT-05)', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
    await taoLink(page);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Link chỉ hiện một lần');
    await dialog.getByRole('button', { name: 'Sao chép', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Đã sao chép', exact: true })).toBeVisible();
    await dialog.getByTestId('invitation-link').getByRole('button', { name: 'Đóng', exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  test('tạo link bị chặn quyền: câu tiếng Việt, không lộ mã lỗi (US-CT-05)', async ({ page }) => {
    await page.getByRole('button', { name: 'Mời nhân viên', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await chua(dialog.getByTestId('role-checklist'), 'Sale', 'label').click();
    await mockApi(page, 'post', '/identity/invitations', 403, { status: 403, title: 'Forbidden', code: 'permission_not_held' });
    await dialog.getByRole('button', { name: 'Tạo link mời', exact: true }).click();
    const alert = dialog.locator('[role=alert]').first();
    await expect(alert).toHaveText(/[À-ỹ]/);
    await expect(alert).not.toContainText('permission_not_held');
    await expect(dialog.getByTestId('invitation-link')).toHaveCount(0);
  });

  test('trang tham gia: link sai báo dừng; gửi lại mã sớm thì đếm ngược; đổi email (US-CT-06)', async ({ page }) => {
    await toi(page, '/tham-gia#khong-ton-tai');
    await expect(page.getByTestId('join-fatal')).toHaveText(/[À-ỹ]/);
    await expect(page.locator('input[name=email]')).toHaveCount(0);

    await toi(page, '/c/cmp-001/admin/staff');
    const path = await taoLink(page, 'Sale');
    await page.getByTestId('invitation-link').getByRole('button', { name: 'Đóng', exact: true }).click();
    await page.getByTestId('invitation-link').getByRole('button', { name: 'Vẫn đóng', exact: true }).click();
    await toi(page, path);
    await expect(page.getByText('Công ty Cổ phần Thời trang ABC').first()).toBeVisible();
    // Email sai định dạng báo tại ô
    await page.locator('input[name=email]').fill('khong-phai-email');
    await page.locator('input[name=fullName]').fill('Người Thử');
    await page.getByRole('button', { name: 'Gửi mã xác minh', exact: true }).click();
    await expect(loi(page, 'email')).not.toBeEmpty();
    await page.locator('input[name=email]').fill('thu.lai@gmail.com');
    await page.getByRole('button', { name: 'Gửi mã xác minh', exact: true }).click();
    await page.getByRole('button', { name: 'Gửi lại mã', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Thử lại sau \d+ giây$/ }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Đổi email', exact: true }).click();
    await expect(page.locator('input[name=email]')).toHaveValue('thu.lai@gmail.com');
  });

  test('trang tham gia: mã sai báo tại ô, email đã là thành viên thì dừng (US-CT-06)', async ({ page }) => {
    const path = await taoLink(page);
    await page.getByTestId('invitation-link').getByRole('button', { name: 'Đóng', exact: true }).click();
    await page.getByTestId('invitation-link').getByRole('button', { name: 'Vẫn đóng', exact: true }).click();
    await toi(page, path);
    await expect(page.getByText('Công ty Cổ phần Thời trang ABC').first()).toBeVisible();
    await page.locator('input[name=email]').fill('ma.sai@gmail.com');
    await page.locator('input[name=fullName]').fill('Mã Sai');
    await page.getByRole('button', { name: 'Gửi mã xác minh', exact: true }).click();
    await page.locator('input[name=code]').fill('000000');
    await page.getByRole('button', { name: 'Xác minh', exact: true }).click();
    await expect(loi(page, 'code')).toHaveText(/[À-ỹ]/);

    await mockApi(page, 'post', '/identity/join/verify', 409, { status: 409, title: 'Conflict', code: 'already_member' });
    await page.locator('input[name=code]').fill(MOCK_OTP);
    await page.getByRole('button', { name: 'Xác minh', exact: true }).click();
    await expect(page.getByTestId('join-fatal')).toContainText('nhân viên');
  });

  test('tab Chờ duyệt: cột, link hết hạn vẫn duyệt được, từ chối có hỏi lại (US-CT-07)', async ({ page }) => {
    await page.getByRole('tab', { name: /Chờ duyệt/ }).click();
    await expect(page).toHaveURL(/tab=pending/);
    for (const h of ['Người đăng ký', 'Vai trò của link', 'Người tạo link', 'Nộp lúc', 'Hạn link'])
      await expect(page.locator('thead')).toContainText(h);
    await expect(page.getByTestId('pending-count')).toHaveText('2');

    const hetHan = dongCo(page, 'Vũ Văn Hết Hạn');
    await expect(hetHan).toContainText('Đã hết hạn');
    await expect(hetHan.getByRole('button', { name: 'Duyệt', exact: true })).toBeEnabled();

    await dongCo(page, 'Đỗ Thị Ứng Viên').getByRole('button', { name: 'Từ chối', exact: true }).click();
    const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog'));
    await expect(confirm).toContainText('Đỗ Thị Ứng Viên');
    await confirm.getByRole('button', { name: 'Từ chối', exact: true }).click();
    await toast(page, 'Đã từ chối yêu cầu của Đỗ Thị Ứng Viên');
    await expect(dongCo(page, 'Đỗ Thị Ứng Viên')).toHaveCount(0);
    await expect(page.getByTestId('pending-count')).toHaveText('1');

    await hetHan.getByRole('button', { name: 'Duyệt', exact: true }).click();
    await toast(page, 'Đã duyệt Vũ Văn Hết Hạn');
    await expect(page.getByText('Không có yêu cầu nào chờ duyệt')).toBeVisible();
  });

  test('tab Chờ duyệt: người khác vừa xử lý (version_conflict), vai trò đã đổi (US-CT-07)', async ({ page }) => {
    await page.getByRole('tab', { name: /Chờ duyệt/ }).click();
    const row = dongCo(page, 'Đỗ Thị Ứng Viên');
    await expect(row).toBeVisible();

    await mockApi(page, 'post', '/identity/invitations/:id/approve', 409, {
      status: 409,
      title: 'Conflict',
      code: 'version_conflict',
      current: { id: 'inv-001', status: 'approved', fullName: 'Đỗ Thị Ứng Viên', email: 'ungvien@gmail.com' },
    });
    await row.getByRole('button', { name: 'Duyệt', exact: true }).click();
    await toast(page, 'vừa được người khác xử lý');

    await mockApi(page, 'post', '/identity/invitations/:id/approve', 409, {
      status: 409,
      title: 'Conflict',
      code: 'invitation_outdated',
    });
    await row.getByRole('button', { name: 'Duyệt', exact: true }).click();
    const loiToast = await toast(page, /vai trò/i);
    await expect(loiToast).not.toContainText('invitation_outdated');
  });

  test('tab Link đã tạo: link mới hiện, huỷ thì người cầm link báo không hợp lệ (US-CT-05 AC 4, 5; US-CT-06 AC 8)', async ({ page }) => {
    const path = await taoLink(page, 'Sale');
    await page.getByTestId('invitation-link').getByRole('button', { name: 'Đóng', exact: true }).click();
    await page.getByTestId('invitation-link').getByRole('button', { name: 'Vẫn đóng', exact: true }).click();
    const id = path.split('#mock-')[1]!;

    await page.getByRole('tab', { name: /Link đã tạo/ }).click();
    await expect(page).toHaveURL(/tab=links/);
    for (const h of ['Trạng thái', 'Vai trò của link', 'Người tạo', 'Tạo lúc', 'Hạn link'])
      await expect(page.locator('thead')).toContainText(h);
    const row = page.locator(`tbody tr[data-row-id="${id}"]`);
    await expect(row).toContainText('Chưa dùng');
    await expect(row).toContainText('Sale');
    // Link có sẵn trong mock vẫn ở đó
    await expect(page.locator('tbody tr[data-row-id="inv-003"]')).toBeVisible();

    await row.getByRole('button', { name: 'Huỷ link', exact: true }).click();
    const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog'));
    await expect(confirm).toContainText('không dùng được nữa');
    await confirm.getByRole('button', { name: 'Huỷ link', exact: true }).click();
    await toast(page, 'Đã huỷ link mời');
    await expect(row).toHaveCount(0);

    await toi(page, path);
    await expect(page.getByTestId('join-fatal')).toContainText('đã bị huỷ');
    await expect(page.locator('input[name=email]')).toHaveCount(0);
  });

  test('tab Link đã tạo: link đang đăng ký hiện email; người đó vừa nộp thì huỷ báo version_conflict (US-CT-05 AC 6)', async ({ page }) => {
    const path = await taoLink(page, 'Sale');
    await page.getByTestId('invitation-link').getByRole('button', { name: 'Đóng', exact: true }).click();
    await page.getByTestId('invitation-link').getByRole('button', { name: 'Vẫn đóng', exact: true }).click();
    const id = path.split('#mock-')[1]!;
    await toi(page, path);
    await page.locator('input[name=email]').fill('dang.ky@gmail.com');
    await page.locator('input[name=fullName]').fill('Đang Đăng Ký');
    await page.getByRole('button', { name: 'Gửi mã xác minh', exact: true }).click();
    await expect(page.getByText('Mã 6 số gửi tới dang.ky@gmail.com')).toBeVisible();

    await toi(page, '/c/cmp-001/admin/staff?tab=links');
    const row = page.locator(`tbody tr[data-row-id="${id}"]`);
    await expect(row).toContainText('Đang đăng ký');
    await expect(row).toContainText('dang.ky@gmail.com');

    await mockApi(page, 'post', '/identity/invitations/:id/revoke', 409, {
      status: 409,
      title: 'Conflict',
      code: 'version_conflict',
      current: { id, status: 'pending', email: 'dang.ky@gmail.com', fullName: 'Đang Đăng Ký' },
    });
    await row.getByRole('button', { name: 'Huỷ link', exact: true }).click();
    const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog'));
    await expect(confirm).toContainText('dang.ky@gmail.com');
    await confirm.getByRole('button', { name: 'Huỷ link', exact: true }).click();
    const canhBao = await toast(page, 'Chờ duyệt');
    await expect(canhBao).not.toContainText('version_conflict');
  });
});

test('chỉ có quyền xem nhân viên: thấy tab Link đã tạo nhưng không có nút huỷ, không mời được (US-CT-05 AC 4)', async ({ page }) => {
  await dangNhap(page, 'kiemsoat@commerio.vn', 'kiemsoat');
  await menu(page, 'Nhân viên');
  await expect(page.getByRole('button', { name: 'Mời nhân viên', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: /Link đã tạo/ }).click();
  await expect(page.locator('tbody tr[data-row-id="inv-003"]')).toContainText('Chưa dùng');
  await expect(page.getByRole('button', { name: 'Huỷ link', exact: true })).toHaveCount(0);
});
