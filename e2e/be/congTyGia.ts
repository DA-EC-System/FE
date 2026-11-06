/**
 * Dựng công ty giả cho spec chạy với BE thật, chỉ qua API công khai (như người dùng tự làm), không ghi thẳng DB:
 * CI chạy trên staging không có quyền vào DB.
 *
 * Staging giới hạn 20 lần gọi /identity/register và /identity/login mỗi 15 phút mỗi IP. Mỗi file spec gọi hàm này một lần
 * trong `beforeAll` (đặt `test.describe.configure({ mode: 'serial' })`): một lần register, một lần login. Cookie refresh xoay
 * vòng mỗi lần dùng nên không dùng lại storageState giữa các test; các test trong file dùng chung một trang đã đăng nhập.
 * Gọi API thì dùng `token` (access token lấy từ phản hồi select-company của chính lần đăng nhập đó, sống 15 phút).
 */
import { randomUUID } from 'node:crypto';
import { type APIRequestContext, type Browser, type Page, expect, request, test } from '@playwright/test';

export interface CongTyGia {
  companyId: string;
  email: string;
  password: string;
  /** Trang đã đăng nhập, dùng chung cho mọi test trong file */
  page: Page;
  /** Access token của công ty (Bearer), sống 15 phút */
  token: string;
  /** Request context có sẵn baseURL và Authorization */
  api: APIRequestContext;
  dispose: () => Promise<void>;
}

/** Đăng ký công ty giả mới, đăng nhập bằng form trên một trang mới, trả trang và access token. */
export async function taoCongTyGia(
  browser: Browser,
  opts: { ten: string; optionalModules?: string[] },
): Promise<CongTyGia> {
  const { baseURL, viewport } = test.info().project.use;
  const suffix = randomUUID().replaceAll('-', '');
  const taxDigits = [...suffix].map((c) => Number.parseInt(c, 16) % 10).join('');
  const email = `${opts.ten}-${suffix.slice(0, 16)}@example.test`;
  const password = `Demo!${suffix.slice(0, 12)}aA1`;

  const anon = await request.newContext({ baseURL });
  const register = await anon.post('/api/v1/identity/register', {
    data: {
      company: { name: `Công ty giả kiểm thử ${opts.ten} ${suffix.slice(0, 8)}`, taxCode: taxDigits.slice(0, 10) },
      ceo: { fullName: 'CEO kiểm thử giả', email, password },
      optionalModules: opts.optionalModules ?? [],
      assistantDataConsent: false,
    },
  });
  expect(register.status(), await register.text()).toBe(201);
  const { companyId } = (await register.json()) as { companyId: string };
  await anon.dispose();

  const page = await browser.newPage({ baseURL, viewport });
  await page.goto('/login');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  const selected = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/v1/identity/select-company' && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  const res = await selected;
  expect(res.status(), await res.text()).toBe(200);
  const { accessToken: token } = (await res.json()) as { accessToken: string };
  await expect(page).toHaveURL(new RegExp(`/c/${companyId}`));
  // Chờ khung trang hiện rồi mới goto, không thì goto huỷ request đang bay (xem be/p1 dangNhap)
  await expect(page.getByTestId('nav-user')).toBeVisible();

  const api = await request.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  return {
    companyId,
    email,
    password,
    page,
    token,
    api,
    dispose: async () => {
      await api.dispose();
      await page.close();
    },
  };
}
