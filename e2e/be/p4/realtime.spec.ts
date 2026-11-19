import { type APIRequestContext, type Browser, type BrowserContext, type Page, request } from '@playwright/test';
import { dong, expect, test, toast } from '../../fixtures';

// FE#287 với BE thật (commerio-backend#216, Documents/21 §13.2): một tab đổi trạng thái kiện, tab kia thấy ngay, không tải lại.
// Hai tab là hai phiên đăng nhập riêng (hai context), mỗi tab giữ một luồng realtime của công ty.
//
// Chuẩn bị giống `kien-ban-giao-nhan-hoan.spec.ts` bước 1–4: kiện E2E_PACKING_CODE ở Chờ lấy hàng, WireMock ở
// `ready_to_ship`, cùng biến E2E_PACKING_EMAIL, E2E_PACKING_PASSWORD, E2E_PACKING_COMPANY_ID, E2E_PACKING_CODE
// (E2E_LAZADA_MOCK_ADMIN_URL nếu cổng admin WireMock khác http://127.0.0.1:8091).
// Spec bàn giao rồi đảo bàn giao nên kiện quay về Chờ lấy hàng, sàn không đổi bước: chạy xong vẫn chạy được
// `kien-ban-giao-nhan-hoan`. Playwright xếp file theo tên (`realtime` đứng sau `kien-`), nên chạy spec này bằng lệnh riêng,
// sau `dong-goi-rts-van-don` và trước `kien-ban-giao-nhan-hoan`:
//   `pnpm exec playwright test --project=be e2e/be/p4/realtime.spec.ts`

interface Package {
  id: string;
  code: string;
  status: string;
}

const email = process.env.E2E_PACKING_EMAIL ?? '';
const password = process.env.E2E_PACKING_PASSWORD ?? '';
const companyId = process.env.E2E_PACKING_COMPANY_ID ?? '';
const packageCode = process.env.E2E_PACKING_CODE ?? '';
const mockAdmin = process.env.E2E_LAZADA_MOCK_ADMIN_URL ?? 'http://127.0.0.1:8091';
const CHUAN_BI = 'chạy dong-goi-rts-van-don trước, xem phần chuẩn bị ở đầu kien-ban-giao-nhan-hoan.spec.ts';
const LY_DO_DAO = 'Kiểm realtime hai tab, hàng còn trên kệ';

test.describe.configure({ mode: 'serial' });

test.describe('P4-BE · realtime kiện giữa hai tab (Lazada giả lập)', () => {
  let skipReason = '';
  let ctxA: BrowserContext;
  let ctxB: BrowserContext;
  let tabA: Page;
  let tabB: Page;
  let api: APIRequestContext;
  let pkg: Package;

  /** Đăng nhập bằng form ở một context mới; trả trang và access token (lấy từ phản hồi select-company) */
  const dangNhapContext = async (browser: Browser) => {
    const { baseURL, viewport } = test.info().project.use;
    const ctx = await browser.newContext({ baseURL, viewport });
    const page = await ctx.newPage();
    await page.goto('/login');
    await page.locator('input[name=email]').fill(email);
    await page.locator('input[name=password]').fill(password);
    const selected = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/v1/identity/select-company' && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    const res = await selected;
    expect(res.status(), await res.text()).toBe(200);
    const { accessToken } = (await res.json()) as { accessToken: string };
    await expect(page).toHaveURL(new RegExp(`/c/${companyId}(?:/|$)`));
    return { ctx, page, accessToken };
  };
  const trangThai = (page: Page) => page.getByTestId('package-status');
  const nutKien = (page: Page, name: string) => page.getByTestId('package-actions').getByRole('button', { name, exact: true });
  const moKien = async (page: Page) => {
    await page.goto(`/c/${companyId}/fulfillment/packages/${pkg.id}`);
    await expect(trangThai(page)).toBeVisible();
    await expect(page.getByTestId('realtime-status')).toHaveAttribute('data-status', 'open');
  };
  /** Dấu trên window: còn nguyên nghĩa là tab chưa tải lại */
  const danhDau = (page: Page) => page.evaluate(() => ((window as unknown as { __fe287?: number }).__fe287 = 287));
  const conDanhDau = (page: Page) => page.evaluate(() => (window as unknown as { __fe287?: number }).__fe287);

  test.beforeAll(async ({ browser }) => {
    const { baseURL } = test.info().project.use;
    if (!email || !password || !companyId || !packageCode) {
      skipReason = 'Cần tài khoản và kiện thử của Lazada giả lập (E2E_PACKING_*)';
      return;
    }
    if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1') {
      skipReason = 'Luồng ghi này chạy trên BE cục bộ trỏ sàn giả lập';
      return;
    }
    const admin = await request.newContext();
    const state = await admin.get(`${mockAdmin}/__admin/scenarios`).catch(() => null);
    const step = state?.ok()
      ? ((await state.json()) as { scenarios: { name: string; state: string }[] }).scenarios.find((s) => s.name === 'don')?.state
      : undefined;
    await admin.dispose();
    if (!state?.ok()) {
      skipReason = `Không gọi được WireMock ở ${mockAdmin}: ${CHUAN_BI}`;
      return;
    }

    const a = await dangNhapContext(browser);
    ctxA = a.ctx;
    tabA = a.page;
    api = await request.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer ${a.accessToken}` } });
    const found = await api.get(`/api/v1/fulfillment/packages?tab=awaiting_pickup&search=${encodeURIComponent(packageCode)}`);
    expect(found.status(), await found.text()).toBe(200);
    const item = ((await found.json()) as { items: Package[] }).items.find((p) => p.code === packageCode);
    if (!item || step !== 'ready_to_ship') {
      skipReason = `Kiện ${packageCode} phải ở Chờ lấy hàng và sàn ở ready_to_ship (sàn đang ${step || '?'}): ${CHUAN_BI}`;
      return;
    }
    pkg = item;
    const b = await dangNhapContext(browser);
    ctxB = b.ctx;
    tabB = b.page;
  });

  test.beforeEach(() => {
    test.skip(Boolean(skipReason), skipReason);
  });

  test.afterAll(async () => {
    await ctxA?.close();
    await ctxB?.close();
    await api?.dispose();
  });

  test('tab A bàn giao kiện: tab B đang mở trang kiện thấy Đang giao, không tải lại', async () => {
    await moKien(tabB);
    await expect(trangThai(tabB)).toContainText('Chờ lấy hàng');
    await danhDau(tabB);

    await moKien(tabA);
    await nutKien(tabA, 'Bàn giao').click();
    await toast(tabA, `Đã bàn giao kiện ${pkg.code}`);
    await expect(trangThai(tabA)).toContainText('Đang giao');

    await expect(trangThai(tabB)).toContainText('Đang giao', { timeout: 10_000 });
    expect(await conDanhDau(tabB)).toBe(287);
  });

  test('tab B đang mở hàng đợi Đang giao; tab A đảo bàn giao: kiện rời hàng đợi ở tab B, kiện về Chờ lấy hàng', async () => {
    await tabB.goto(`/c/${companyId}/fulfillment/packages?tab=shipping`);
    await expect(dong(tabB, pkg.id)).toBeVisible();
    await danhDau(tabB);

    await nutKien(tabA, 'Đảo bàn giao').click();
    const dialog = tabA.getByRole('dialog', { name: 'Đảo bàn giao' });
    await dialog.getByTestId('reason-input').fill(LY_DO_DAO);
    await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await toast(tabA, `${pkg.code}: Đảo bàn giao`);
    await expect(trangThai(tabA)).toContainText('Chờ lấy hàng');

    await expect(dong(tabB, pkg.id)).toHaveCount(0, { timeout: 10_000 });
    expect(await conDanhDau(tabB)).toBe(287);
    const res = await api.get(`/api/v1/fulfillment/packages/${pkg.id}`);
    expect(((await res.json()) as Package).status).toBe('awaiting_pickup');
  });
});
