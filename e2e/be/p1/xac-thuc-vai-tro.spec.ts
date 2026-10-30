// P1 với BE thật · Đăng ký, đăng nhập, refresh token, đổi mật khẩu, vai trò (FE#1 AC-13, FE#2, FE#3; commerio-backend#4, #8)
// Không dùng mockApi. Mỗi lần chạy tự đăng ký công ty mới nên chạy lại được trên cùng database.
import { type APIRequestContext, type Page } from '@playwright/test';
import { chu, chua, duongDan, expect, loi, menu, test, thayChu, toast } from '../../fixtures';

const RUN = Date.now().toString().slice(-7);
const MAT_KHAU = 'matkhau123';
const UUID = '[0-9a-f-]{36}';

/** Mã số thuế 10 số, khác nhau giữa các công ty trong một lần chạy */
const maSoThue = (n: number) => `03${RUN}${n}`;
const emailCeo = (n: number) => `ceo${n}.${RUN}@commerio.test`;

const dangKyApi = async (api: APIRequestContext, n: number): Promise<string> =>
  (
    await (
      await api.post('/api/v1/identity/register', {
        data: {
          company: { name: `Công ty E2E ${RUN}-${n}`, taxCode: maSoThue(n) },
          ceo: { fullName: `CEO Thử ${n}`, email: emailCeo(n), password: MAT_KHAU },
          optionalModules: ['report'],
        },
      })
    ).json()
  ).companyId;

const dangNhapTay = async (page: Page, email: string, password: string) => {
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
};
const dangNhap = async (page: Page, email: string, password = MAT_KHAU) => {
  await page.goto('/login');
  await dangNhapTay(page, email, password);
  await expect.poll(() => duongDan(page)).toMatch(new RegExp(`^/c/${UUID}`));
};
/** Gọi đăng nhập trong trang, trả mã HTTP (không đổi phiên đang mở) */
const thuDangNhap = (page: Page, email: string, password: string) =>
  page.evaluate(
    ({ email, password }) =>
      fetch('/api/v1/identity/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }).then((r) => r.status),
    { email, password },
  );
const dongCo = (page: Page, text: string) => chua(page, text, 'tbody tr[data-row-id]');
const cookieRefresh = async (page: Page) => (await page.context().cookies()).find((c) => c.name === 'commerio_refresh');
const laApi = (url: string, path: string) => new URL(url).pathname === path;

let congTy1 = '';
test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  congTy1 = String(await dangKyApi(api, 1));
  await api.dispose();
});

test.describe('P1-BE · Đăng ký, đăng nhập (commerio-backend#4)', () => {
  test('đăng ký qua form thì sang /login điền sẵn email, đăng nhập vào thẳng công ty (FE#2 AC-4, AC-9)', async ({ page }) => {
    await page.goto('/register');
    const values = {
      companyName: `Công ty Form ${RUN}`,
      taxCode: maSoThue(9),
      fullName: 'Nguyễn Văn Form',
      email: `form.${RUN}@commerio.test`,
      password: MAT_KHAU,
      confirmPassword: MAT_KHAU,
    };
    for (const [name, value] of Object.entries(values)) await page.locator(`input[name="${name}"]`).fill(value);
    await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
    await expect.poll(() => duongDan(page)).toBe('/login');
    await thayChu(page, 'Đăng ký công ty thành công');
    await expect(page.locator('input[name=email]')).toHaveValue(values.email);
    await page.locator('input[name=password]').fill(MAT_KHAU);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect.poll(() => duongDan(page)).toMatch(new RegExp(`^/c/${UUID}`));
  });

  test('email đã có tài khoản thì báo tại ô (FE#2 AC-5)', async ({ page }) => {
    await page.goto('/register');
    const values = {
      companyName: 'Công ty Trùng',
      taxCode: maSoThue(8),
      fullName: 'Người Trùng',
      email: emailCeo(1),
      password: MAT_KHAU,
      confirmPassword: MAT_KHAU,
    };
    for (const [name, value] of Object.entries(values)) await page.locator(`input[name="${name}"]`).fill(value);
    await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
    await expect(loi(page, 'email')).toHaveText('Email này đã có tài khoản');
  });

  test('sai mật khẩu hay email không tồn tại cùng một câu (FE#2 AC-8)', async ({ page }) => {
    await page.goto('/login');
    await dangNhapTay(page, emailCeo(1), 'saimatkhau1');
    await thayChu(page, 'Email hoặc mật khẩu không đúng', '[role=alert]');
    await dangNhapTay(page, `khong.co.${RUN}@commerio.test`, MAT_KHAU);
    await thayChu(page, 'Email hoặc mật khẩu không đúng', '[role=alert]');
    await expect.poll(() => duongDan(page)).toBe('/login');
  });

  test('chưa đăng nhập thì về /login, đăng nhập xong quay lại đúng trang (FE#1 AC-1)', async ({ page }) => {
    await page.goto(`/c/${congTy1}/catalog`);
    await expect.poll(() => duongDan(page)).toBe('/login');
    await dangNhapTay(page, emailCeo(1), MAT_KHAU);
    await expect.poll(() => duongDan(page)).toBe(`/c/${congTy1}/catalog`);
  });
});

test.describe('P1-BE · Phiên, cookie, Bearer (FE#1 AC-13)', () => {
  test('gọi /api/v1/identity/*, refresh nằm trong cookie HttpOnly, các API khác gửi Bearer', async ({ page }) => {
    const goi: Promise<{ url: string; auth?: string }>[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url()).pathname;
      if (url.startsWith('/api/v1/')) goi.push(req.allHeaders().then((h) => ({ url, auth: h.authorization })));
    });
    const login = page.waitForResponse((r) => laApi(r.url(), '/api/v1/identity/login') && r.request().method() === 'POST');
    await dangNhap(page, emailCeo(1));

    const body = (await (await login).json()) as { accessToken: string; refreshToken?: string };
    expect(typeof body.accessToken).toBe('string');
    expect(body, 'refresh token không nằm trong body').not.toHaveProperty('refreshToken');
    // Không giữ token trong localStorage, sessionStorage (FE#1 AC-3)
    const dump = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    expect(dump).not.toContain(body.accessToken);
    await expect(async () => {
      const c = await cookieRefresh(page);
      expect(c, 'cookie commerio_refresh').toBeDefined();
      expect(c?.httpOnly).toBe(true);
      expect(c?.path).toBe('/api/v1/identity');
      expect(c?.sameSite).toBe('Strict');
    }).toPass();
    expect(await page.evaluate(() => document.cookie)).not.toContain('commerio_refresh');

    await expect(async () => {
      const ds = await Promise.all(goi);
      const xacThuc = ds.filter((g) => /\/(login|register|refresh|logout)$/.test(g.url));
      const conLai = ds.filter((g) => !xacThuc.includes(g));
      expect(xacThuc.length, 'có gọi API xác thực').toBeGreaterThan(0);
      for (const g of xacThuc) expect(g.url).toMatch(/^\/api\/v1\/identity\//);
      expect(conLai.length, 'có gọi API cần đăng nhập').toBeGreaterThan(0);
      for (const g of conLai) expect(g.auth, g.url).toMatch(/^Bearer \S+/);
    }).toPass();
  });

  test('F5 thì dùng cookie refresh lấy access token mới, vẫn ở trang đang mở (FE#1 AC-4)', async ({ page }) => {
    await dangNhap(page, emailCeo(1));
    await page.goto(`/c/${congTy1}/catalog`);
    const cuoiCu = (await cookieRefresh(page))?.value;
    const refresh = page.waitForResponse((r) => laApi(r.url(), '/api/v1/identity/refresh') && r.request().method() === 'POST');
    await page.reload();
    expect((await refresh).status()).toBe(200);
    await expect.poll(() => duongDan(page)).toBe(`/c/${congTy1}/catalog`);
    await expect(page.locator('main')).not.toContainText('không có quyền');
    // Refresh token xoay vòng: cookie mới khác cookie cũ
    await expect.poll(async () => (await cookieRefresh(page))?.value).not.toBe(cuoiCu);
  });

  test('đăng xuất xoá cookie; Back hay mở lại đều về /login (FE#1 AC-12)', async ({ page }) => {
    await dangNhap(page, emailCeo(1));
    await page.getByRole('button', { name: 'Tài khoản', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Đăng xuất', exact: true }).click();
    await expect.poll(() => duongDan(page)).toBe('/login');
    await expect.poll(() => cookieRefresh(page)).toBeUndefined();
    await page.goBack();
    await expect.poll(() => duongDan(page)).not.toMatch(/^\/c\//);
    await page.goto(`/c/${congTy1}/catalog`);
    await expect.poll(() => duongDan(page)).toBe('/login');
  });
});

test.describe('P1-BE · Đổi mật khẩu (commerio-backend#4)', () => {
  test('mật khẩu hiện tại sai thì báo tại ô; đổi xong mật khẩu cũ hết dùng được (FE#2 AC-14, AC-15)', async ({ page, request }) => {
    await dangKyApi(request, 2);
    await dangNhap(page, emailCeo(2));
    await page.getByRole('button', { name: 'Tài khoản', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Đổi mật khẩu', exact: true }).click();
    await expect.poll(() => duongDan(page)).toBe('/change-password');
    const doi = async (current: string, next: string) => {
      for (const [name, value] of Object.entries({ currentPassword: current, newPassword: next, confirmPassword: next }))
        await page.locator(`input[name="${name}"]`).fill(value);
      await page.getByRole('button', { name: 'Lưu mật khẩu mới', exact: true }).click();
    };
    await doi('saimatkhau1', 'matkhau999');
    await expect(loi(page, 'currentPassword')).toHaveText('Mật khẩu hiện tại không đúng');
    await doi(MAT_KHAU, 'matkhau999');
    await thayChu(page, 'Đã đổi mật khẩu. Lần đăng nhập sau dùng mật khẩu mới.');
    await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
    await expect.poll(() => duongDan(page)).toMatch(new RegExp(`^/c/${UUID}`));
    expect(await thuDangNhap(page, emailCeo(2), MAT_KHAU)).toBe(401);
    expect(await thuDangNhap(page, emailCeo(2), 'matkhau999')).toBe(200);
  });
});

test.describe('P1-BE · Vai trò (commerio-backend#8)', () => {
  test('CEO: vai trò có sẵn chỉ xem; tạo vai trò kiểm tên trùng; xoá vai trò tự tạo (FE#3 AC-8, AC-9)', async ({ page }) => {
    const ten = `Chăm sóc ${RUN}`;
    await dangNhap(page, emailCeo(1));
    await menu(page, 'Vai trò');
    await expect(page.locator('thead')).toContainText('Số tài khoản');
    await expect(page.locator('tbody tr[data-row-id]').filter({ hasText: chu('Có sẵn') }).nth(2)).toBeAttached();
    await dongCo(page, 'Sale').getByRole('button', { name: 'Xem tập quyền', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const checkboxes = dialog.getByRole('checkbox');
    await expect(checkboxes.first()).toBeAttached();
    for (const c of await checkboxes.all()) await expect(c).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Lưu', exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();

    await page.getByRole('button', { name: 'Tạo vai trò', exact: true }).click();
    await expect(dialog.locator('button[role=checkbox][value^="platform."]')).toHaveCount(0);
    await dialog.locator('input[name=name]').fill('Sale');
    // Nhãn quyền do BE trả về, khác câu chữ của mock
    await chua(dialog, /^Xem.*sản phẩm/, 'label').click();
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(loi(page, 'name')).not.toBeEmpty();
    await page.locator('input[name=name]').fill(ten);
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
    await toast(page, `Đã tạo vai trò ${ten}`);
    await expect(dongCo(page, ten)).toBeAttached();

    // Tải lại trang: vai trò vừa tạo vẫn còn, tức đã lưu ở BE
    await page.reload();
    await dongCo(page, ten).getByRole('button', { name: 'Xoá', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Xoá', exact: true }).click();
    await toast(page, `Đã xoá vai trò ${ten}`);
    await expect(page.locator('tbody tr[data-row-id]', { hasText: chu(ten) })).toHaveCount(0);
  });

  test('API vai trò, quyền: không có Bearer thì 401, có Bearer thì trả được (commerio-backend#8)', async ({ page, request }) => {
    expect((await request.get('/api/v1/identity/roles')).status()).toBe(401);
    await dangNhap(page, emailCeo(1));
    const quyen = page.waitForResponse((r) => laApi(r.url(), '/api/v1/identity/permissions') && r.request().method() === 'GET');
    await menu(page, 'Vai trò');
    await page.getByRole('button', { name: 'Tạo vai trò', exact: true }).click();
    const res = await quyen;
    expect((await res.request().allHeaders()).authorization).toMatch(/^Bearer /);
    // 304 khi trình duyệt còn bản cache cùng ETag
    expect([200, 304]).toContain(res.status());
  });
});

