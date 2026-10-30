/**
 * Hàm dùng chung cho E2E. Dữ liệu mock nằm trong bộ nhớ trang nên mỗi lần
 * `page.goto` là một bộ dữ liệu mới: mỗi test tự đăng nhập, không phụ thuộc test trước.
 *
 * Quy ước khi viết spec:
 * - Tên vai trò, nhãn là chuỗi thì so khớp nguyên chuỗi: `getByRole('button', { name: 'Lưu', exact: true })`.
 * - Tìm theo chữ dùng `chu('…')` (chuỗi con, phân biệt hoa thường), không truyền chuỗi trần vào `hasText`
 *   (Playwright so chuỗi trần không phân biệt hoa thường).
 */
import { expect, type Locator, type Page } from '@playwright/test';

export { expect, test } from '@playwright/test';

type Method = 'get' | 'post' | 'put' | 'delete';
type Scope = Page | Locator;

interface MswBridge {
  worker: { use: (...handlers: unknown[]) => void };
  http: Record<Method, (path: string, resolver: () => Response, options?: { once?: boolean }) => unknown>;
  HttpResponse: { json: (body: unknown, init?: ResponseInit) => Response };
  fire: (
    companyId: string,
    type: string,
    shopId?: string,
    params?: Record<string, string>,
  ) => { ok: true; entry: { message: string } } | { ok: false; message: string };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Chuỗi con, phân biệt hoa thường; RegExp giữ nguyên */
export const chu = (text: string | RegExp) => (typeof text === 'string' ? new RegExp(escape(text)) : text);

/** Đường dẫn hiện tại, dùng với `expect.poll(() => duongDan(page))` */
export const duongDan = (page: Page) => new URL(page.url()).pathname;

/** Phần tử đầu tiên chứa chữ; có `selector` thì chỉ xét phần tử khớp selector */
export const chua = (scope: Scope, text: string | RegExp, selector?: string) =>
  (selector ? scope.locator(selector, { hasText: chu(text) }) : scope.getByText(chu(text))).first();

/** Có phần tử chứa chữ trong trang (không cần đang hiện) */
export const thayChu = async (scope: Scope, text: string | RegExp, selector?: string) =>
  expect(chua(scope, text, selector)).toBeAttached();

/** Tổ tiên gần nhất khớp thuộc tính, như `.closest('[data-slot="form-item"]')` */
export const gan = (el: Locator, attr: string, value: string) =>
  el.locator(`xpath=ancestor-or-self::*[@${attr}="${value}"][1]`);

/** Dòng lỗi dưới ô có `name` */
export const loi = (scope: Scope, name: string) =>
  gan(scope.locator(`[name="${name}"]`), 'data-slot', 'form-item').locator('[data-slot="form-message"]');

/** Mọi phần tử khớp đều thoả `check`, thử lại tới khi có ít nhất một phần tử và đều thoả */
export const moiPhanTu = async (els: Locator, check: (text: string) => void) =>
  expect(async () => {
    const texts = await els.allInnerTexts();
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) check(t);
  }).toPass();

/** Đăng nhập; tài khoản nhiều công ty thì chọn công ty có tên chứa `congTy` */
export async function dangNhap(page: Page, email: string, password: string, congTy = 'Thời trang ABC') {
  await page.goto('/login');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect.poll(() => duongDan(page)).toMatch(/^\/(c\/|select-company)/);
  // Tài khoản một công ty cũng đi qua /select-company rồi tự chuyển: chỉ bấm khi trang chọn công ty còn hiện.
  // Bỏ nút của thanh bên (bộ chuyển công ty cũng chứa tên công ty).
  const nut = page.locator('button:not([data-sidebar])', { hasText: chu(congTy) }).first();
  await expect(async () => {
    if (duongDan(page) === '/select-company') await nut.click({ timeout: 1000 });
    expect(duongDan(page)).toMatch(/^\/c\/cmp-/);
  }).toPass();
}

/** Bấm mục trên thanh bên theo đúng chữ */
export const menu = (page: Page, label: string) =>
  page.locator('[data-sidebar="menu-button"]', { hasText: new RegExp(`^\\s*${label}\\s*$`) }).first().click();

/** Dòng bảng có `data-row-id` */
export const dong = (scope: Scope, id: string) => scope.locator(`tbody tr[data-row-id="${id}"]`);

/** Chờ thông báo (sonner) chứa đoạn chữ, trả về thông báo đó */
export async function toast(page: Page, text: string | RegExp) {
  const el = chua(page, text, '[data-sonner-toast]');
  await expect(el).toBeAttached();
  return el;
}

/** Chọn một mục trong Select (combobox) theo nhãn. Danh sách lựa chọn nằm ở portal nên tìm trên cả trang */
export async function chon(scope: Scope, label: string, option: string | RegExp) {
  const page = 'page' in scope ? scope.page() : scope;
  await scope.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** Lần gọi kế tiếp tới `/api/v1<path>` trả về `status` + `body` (chỉ khi chạy MSW) */
export async function mockApi(page: Page, method: Method, path: string, status: number, body: unknown) {
  await page.evaluate(
    ({ method, path, status, body }) => {
      const bridge = (window as unknown as { __msw?: MswBridge }).__msw;
      if (!bridge) throw new Error('Cần chạy Vite dev với MSW (VITE_USE_MOCKS) để giả lập phản hồi BE');
      const { worker, http, HttpResponse } = bridge;
      worker.use(http[method](`*/api/v1${path}`, () => HttpResponse.json(body, { status }), { once: true }));
    },
    { method, path, status, body },
  );
}

/** Sàn giả lập phát sự kiện thẳng vào mock, không qua trang sàn giả lập; trả câu kết quả (FE#81) */
export async function phatSuKienSan(page: Page, type: string, shopId?: string, params: Record<string, string> = {}) {
  const companyId = duongDan(page).split('/')[2] ?? '';
  return page.evaluate(
    ({ companyId, type, shopId, params }) => {
      const bridge = (window as unknown as { __msw?: MswBridge }).__msw;
      if (!bridge) throw new Error('Cần chạy Vite dev với MSW (VITE_USE_MOCKS) để giả lập phản hồi BE');
      const result = bridge.fire(companyId, type, shopId, params);
      if (!result.ok) throw new Error(result.message);
      return result.entry.message;
    },
    { companyId, type, shopId, params },
  );
}
