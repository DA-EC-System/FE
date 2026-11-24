/**
 * Hàm dùng chung cho E2E chạy BE thật (`e2e/be`). FE không còn mock (Thành chốt 20/11/2026): mỗi file spec tự đăng ký
 * công ty giả qua API công khai (`e2e/be/congTyGia.ts`).
 *
 * Quy ước khi viết spec:
 * - Tên vai trò, nhãn là chuỗi thì so khớp nguyên chuỗi: `getByRole('button', { name: 'Lưu', exact: true })`.
 * - Tìm theo chữ dùng `chu('…')` (chuỗi con, phân biệt hoa thường), không truyền chuỗi trần vào `hasText`
 *   (Playwright so chuỗi trần không phân biệt hoa thường).
 */
import { test as base, type BrowserContext, expect, type Locator, type Page } from '@playwright/test';

export { expect };

/**
 * Công ty mới bị ép vào wizard thiết lập (FE#468: `mustWizard`, mọi route công ty về `/welcome`), spec không vào được
 * trang cần kiểm. Không có API bỏ qua (`POST /onboarding/complete` đòi đủ bước bắt buộc) và staging không vào được DB,
 * nên sửa phản hồi `GET /onboarding` trên trình duyệt: `mustWizard: false`, `completedAt` có giá trị, như công ty đã thiết
 * lập xong. Chỉ đổi điều FE thấy; BE không đổi gì. Fixture `context` của `test` dưới đây gọi sẵn; trang tự mở bằng
 * `browser.newPage` (như `taoCongTyGia`) thì tự gọi hàm này.
 */
export async function boQuaWizard(target: Page | BrowserContext): Promise<void> {
  await target.route(
    (url) => url.pathname === '/api/v1/onboarding',
    async (route) => {
      const res = await route.fetch();
      if (!res.ok()) return route.fulfill({ response: res });
      const body = (await res.json()) as { completedAt: string | null };
      await route.fulfill({ response: res, json: { ...body, mustWizard: false, completedAt: body.completedAt ?? new Date().toISOString() } });
    },
  );
}

/** `test` của Playwright, thêm: mọi context của fixture bỏ qua wizard thiết lập bắt buộc (`boQuaWizard`) */
export const test = base.extend({
  // Tham số thứ hai đặt `dung`, không đặt `use`: eslint react-hooks tưởng là hook
  context: async ({ context }, dung) => {
    await boQuaWizard(context);
    await dung(context);
  },
});

type Scope = Page | Locator;

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
