// P1 · Bấm đúp nút tạo, gửi (FE#247; Documents/25 N5: bấm hai lần thì kết quả như một lần).
// Hai cú bấm liền trong cùng một lượt JS: React chưa kịp vẽ nút khoá, đúng khe hở test staging 17/11 bắt được
import { type Locator, type Page } from '@playwright/test';
import { chua, dangNhap, duongDan, expect, menu, test } from '../../fixtures';

const bamDup = (button: Locator) =>
  button.evaluate((b: HTMLElement) => {
    b.click();
    b.click();
  });

/** Đếm request theo phương thức, đường dẫn */
function demRequest(page: Page, method: string, path: RegExp) {
  const seen: string[] = [];
  page.on('request', (r) => {
    if (r.method() === method && path.test(new URL(r.url()).pathname)) seen.push(r.url());
  });
  return seen;
}

const soToast = (page: Page, text: string) => chua(page, text, '[data-sonner-toast]');

test.describe('P1 · Bấm đúp chỉ ra một request', () => {
  test('Tạo link mời, Huỷ link: một request, một link, một toast', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await menu(page, 'Nhân viên');
    await page.getByRole('tab', { name: /Link đã tạo/ }).click();
    const rows = page.locator('tbody tr[data-row-id]');
    await expect(rows.first()).toBeAttached();
    const truoc = await rows.count();

    const tao = demRequest(page, 'POST', /\/identity\/invitations$/);
    await page.getByRole('button', { name: 'Mời nhân viên', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await chua(dialog.getByTestId('role-checklist'), 'Sale', 'label').click();
    await bamDup(dialog.getByRole('button', { name: 'Tạo link mời', exact: true }));
    const link = await dialog.getByRole('textbox', { name: 'Link mời' }).inputValue();
    const id = link.split('#mock-')[1]!;
    expect(tao).toHaveLength(1);
    await dialog.getByTestId('invitation-link').getByRole('button', { name: 'Đóng', exact: true }).click();
    await dialog.getByTestId('invitation-link').getByRole('button', { name: 'Vẫn đóng', exact: true }).click();
    await expect(rows).toHaveCount(truoc + 1);

    const huy = demRequest(page, 'POST', /\/identity\/invitations\/[^/]+\/revoke$/);
    await page.locator(`tbody tr[data-row-id="${id}"]`).getByRole('button', { name: 'Huỷ link', exact: true }).click();
    const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog'));
    await bamDup(confirm.getByRole('button', { name: 'Huỷ link', exact: true }));
    await expect(soToast(page, 'Đã huỷ link mời')).toHaveCount(1);
    await expect(rows).toHaveCount(truoc);
    expect(huy).toHaveLength(1);
    await expect(page.locator('[data-sonner-toast][data-type=error]')).toHaveCount(0);
  });

  test('Tạo vai trò: một request, một vai trò', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await menu(page, 'Vai trò');
    await expect(page.locator('thead')).toContainText('Số tài khoản');
    const tao = demRequest(page, 'POST', /\/identity\/roles$/);
    await page.getByRole('button', { name: 'Tạo vai trò', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[name=name]').fill('Vai trò bấm đúp');
    await chua(dialog, 'Xem, tra cứu sản phẩm', 'label').click();
    await bamDup(dialog.getByRole('button', { name: 'Lưu', exact: true }));
    await expect(soToast(page, 'Đã tạo vai trò Vai trò bấm đúp')).toHaveCount(1);
    await expect(page.locator('tbody tr[data-row-id]').filter({ hasText: 'Vai trò bấm đúp' })).toHaveCount(1);
    expect(tao).toHaveLength(1);
    await expect(page.locator('[data-sonner-toast][data-type=error]')).toHaveCount(0);
  });

  test('Đăng ký: một request, sang trang đăng nhập, không báo email đã có', async ({ page }) => {
    await page.goto('/register');
    const values = {
      companyName: 'Công ty Bấm Đúp',
      taxCode: '0312999777',
      fullName: 'Nguyễn Văn B',
      email: 'bam.dup@congtythu.vn',
      password: 'matkhau123',
      confirmPassword: 'matkhau123',
    };
    for (const [name, value] of Object.entries(values)) await page.locator(`input[name="${name}"]`).fill(value);
    const dangKy = demRequest(page, 'POST', /\/identity\/register$/);
    await bamDup(page.getByRole('button', { name: 'Đăng ký', exact: true }));
    await expect.poll(() => duongDan(page)).toBe('/login');
    expect(dangKy).toHaveLength(1);
  });
});
