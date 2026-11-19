// P1 · Mở nhiều tab cùng lúc: mỗi tab ở lại đúng trang; đăng xuất một tab thì tab kia về đăng nhập (FE#317)
import { dangNhap, duongDan, expect, test } from '../../fixtures';

test.describe('P1 · Nhiều tab cùng một phiên', () => {
  test('mở song song hai trang: cả hai ở đúng URL, đăng xuất một tab thì tab kia về /login', async ({ page, context }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    const urls = ['/c/cmp-001/sales/orders', '/c/cmp-001/sales/returns'];

    // Lặp vài lần: tab xong trước báo tài khoản trong lúc tab kia còn đang khởi động.
    for (let lan = 0; lan < 3; lan++) {
      const tabs = await Promise.all(urls.map(() => context.newPage()));
      await Promise.all(tabs.map((t, i) => t.goto(urls[i])));
      for (const t of tabs) {
        await expect(t.locator('[data-sidebar="sidebar"]')).toBeVisible();
      }
      await page.waitForTimeout(1500);
      for (const [i, t] of tabs.entries()) expect(duongDan(t)).toBe(urls[i]);
      await Promise.all(tabs.map((t) => t.close()));
    }

    const khac = await context.newPage();
    await khac.goto(urls[0]);
    await expect(khac.locator('[data-sidebar="sidebar"]')).toBeVisible();
    await page.getByTestId('nav-user').click();
    await page.getByRole('menuitem', { name: 'Đăng xuất', exact: true }).click();
    await expect.poll(() => duongDan(page)).toBe('/login');
    await expect.poll(() => duongDan(khac)).toBe('/login');
  });
});
