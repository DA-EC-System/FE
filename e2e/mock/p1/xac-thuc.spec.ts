// P1 · Đăng nhập, phiên và chặn trang (FE#1; commerio-backend#4, #7)
import { type Page } from '@playwright/test';
import { dangNhap, duongDan, expect, menu, test } from '../../fixtures';

const dangNhapTay = async (page: Page, email: string, password: string) => {
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
};
const thanhBen = (page: Page) => page.locator('[data-sidebar="sidebar"]');

test.describe('P1 · Xác thực và chặn trang', () => {
  test('chưa đăng nhập thì về /login, đăng nhập xong quay lại đúng trang (AC-1)', async ({ page }) => {
    await page.goto('/c/cmp-001/catalog');
    await expect.poll(() => duongDan(page)).toBe('/login');
    await dangNhapTay(page, 'sale@commerio.vn', 'sale');
    await expect.poll(() => duongDan(page)).toBe('/c/cmp-001/catalog');
  });

  test('đã đăng nhập mở /login thì về trang chủ của phiên (AC-2)', async ({ page }) => {
    await dangNhap(page, 'sale@commerio.vn', 'sale');
    await page.goto('/login');
    await expect.poll(() => duongDan(page)).toMatch(/^\/c\/cmp-001/);
  });

  test('không giữ token trong localStorage, sessionStorage (AC-3)', async ({ page }) => {
    await dangNhap(page, 'sale@commerio.vn', 'sale');
    const dump = await page.evaluate(
      () => JSON.stringify({ ...window.localStorage }) + JSON.stringify({ ...window.sessionStorage }),
    );
    expect(dump).not.toMatch(/mock\.acc-|accessToken|refresh/i);
  });

  test('F5 vẫn ở trang đang mở (AC-4)', async ({ page }) => {
    await dangNhap(page, 'sale@commerio.vn', 'sale');
    await page.goto('/c/cmp-001/pricing');
    await page.reload();
    await expect.poll(() => duongDan(page)).toBe('/c/cmp-001/pricing');
    await expect(page.locator('main')).not.toContainText('không có quyền');
  });

  test('access token hết hạn thì tự làm mới, refresh cũng hết thì về /login (AC-4, AC-5)', async ({ page }) => {
    const ttl = { accessTtlMs: 2000, refreshTtlMs: 6000 };
    await page.addInitScript((ttl) => Object.assign(window, { __commerioMock: ttl }), ttl);
    await page.goto('/login');
    await dangNhapTay(page, 'sale@commerio.vn', 'sale');
    await expect.poll(() => duongDan(page)).toMatch(/^\/c\/cmp-001/);
    // Access 2 giây đã hết, refresh 6 giây còn: bấm menu vẫn mở được trang, không báo lỗi phiên
    await page.waitForTimeout(2500);
    await menu(page, 'Sản phẩm');
    await expect.poll(() => duongDan(page)).toBe('/c/cmp-001/catalog');
    await expect(page.locator('tbody tr[data-row-id]')).not.toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('hết hạn');
    // Cả refresh cũng hết
    await page.waitForTimeout(6500);
    await menu(page, 'Bảng giá');
    await expect.poll(() => duongDan(page), { timeout: 10000 }).toBe('/login');
  });

  test('khung trang, menu theo quyền; Sale không thấy Vai trò, Phân hệ (AC-6)', async ({ page }) => {
    await dangNhap(page, 'sale@commerio.vn', 'sale');
    await expect(page.locator('header')).toContainText('Thời trang ABC');
    await expect(thanhBen(page)).toContainText('Sản phẩm');
    await expect(thanhBen(page)).not.toContainText('Vai trò');
    await expect(thanhBen(page)).not.toContainText('Phân hệ');
    await page.getByRole('button', { name: 'Tài khoản', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'Đổi mật khẩu', exact: true })).toBeAttached();
    await expect(page.getByRole('menuitem', { name: 'Đăng xuất', exact: true })).toBeAttached();
  });

  test('Sale mở trang vai trò bằng URL thì báo không có quyền (AC-7)', async ({ page }) => {
    await dangNhap(page, 'sale@commerio.vn', 'sale');
    await page.goto('/c/cmp-001/admin/roles');
    await expect(page.locator('main')).toContainText('không có quyền');
    await expect(page.locator('tbody tr[data-row-id]')).toHaveCount(0);
  });

  test('phân hệ chưa bật thì báo chưa bật (AC-8)', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo', 'Minh Phát');
    await page.goto('/c/cmp-003/channel/shops');
    await expect(page.locator('main')).toContainText('Phân hệ chưa bật');
  });

  test('quản trị nền tảng vào /platform, không có menu khu công ty (AC-9)', async ({ page }) => {
    await page.goto('/login');
    await dangNhapTay(page, 'platform@commerio.vn', 'platform');
    await expect.poll(() => duongDan(page)).toMatch(/^\/platform/);
    await expect(thanhBen(page)).not.toContainText('Sản phẩm');
    await expect(thanhBen(page)).not.toContainText('Bảng giá');
  });

  test('nhân viên mở /platform thì bị chặn (AC-9)', async ({ page }) => {
    await dangNhap(page, 'sale@commerio.vn', 'sale');
    await page.goto('/platform/companies');
    await expect(page.locator('body')).toContainText('chỉ dành cho quản trị nền tảng');
    await expect(page.locator('tbody tr[data-row-id]')).toHaveCount(0);
  });

  test('còn mật khẩu thư mời thì luôn bị đưa tới /change-password (AC-10)', async ({ page }) => {
    await page.goto('/login');
    await dangNhapTay(page, 'moi@commerio.vn', 'moi12345');
    await expect.poll(() => duongDan(page)).toBe('/change-password');
    for (const p of ['/c/cmp-001', '/c/cmp-001/catalog', '/select-company']) {
      await page.goto(p);
      await expect.poll(() => duongDan(page)).toBe('/change-password');
    }
  });

  test('mở công ty không thuộc thì về trang chọn công ty (AC-11)', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await page.goto('/c/cmp-002');
    await expect.poll(() => duongDan(page)).toBe('/select-company');
  });

  test('đăng xuất rồi Back hay mở lại cũng không vào được (AC-12)', async ({ page }) => {
    await dangNhap(page, 'sale@commerio.vn', 'sale');
    await page.getByRole('button', { name: 'Tài khoản', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Đăng xuất', exact: true }).click();
    await expect.poll(() => duongDan(page)).toBe('/login');
    await page.goBack();
    await expect.poll(() => duongDan(page)).not.toMatch(/^\/c\//);
    await page.goto('/c/cmp-001/catalog');
    await expect.poll(() => duongDan(page)).toBe('/login');
  });
});
