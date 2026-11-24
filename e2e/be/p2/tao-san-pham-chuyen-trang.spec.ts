// P2 · Tạo sản phẩm xong chuyển sang trang sửa của đúng sản phẩm đó (FE#463): URL /catalog/products/:id, chỉ một
// toast, tiêu đề được focus, khung "Đã tạo sản phẩm · Tiếp theo" hiện tới khi đóng. Kèm redirect /catalog/products → /catalog
// (FE#464). Một công ty giả riêng (e2e/be/congTyGia.ts), danh mục dựng qua API công khai.
import { type Page, expect, test } from '@playwright/test';
import { type CongTyGia, taoCongTyGia } from '../congTyGia';

test.describe.configure({ mode: 'serial' });

let cty: CongTyGia;
let page: Page;
const tenDanhMuc = 'Mũ kiểm thử';
const tenSanPham = 'Mũ lưỡi trai kiểm thử';

test.beforeAll(async ({ browser }) => {
  cty = await taoCongTyGia(browser, { ten: 'tao-sp' });
  page = cty.page;
  const res = await cty.api.post('/api/v1/catalog/groups', { data: { name: tenDanhMuc } });
  expect(res.status(), await res.text()).toBe(201);
});

test.afterAll(async () => {
  await cty?.dispose();
});

test('tạo sản phẩm: chuyển sang trang sửa, một toast, focus tiêu đề, khung Tiếp theo', async () => {
  await page.goto(`/c/${cty.companyId}/catalog/products/new`);
  await page.getByLabel('Tên sản phẩm').fill(tenSanPham);
  await page.getByRole('combobox', { name: 'Danh mục sản phẩm' }).click();
  await page.getByPlaceholder('Gõ để tìm hoặc tạo nhóm…').fill(tenDanhMuc);
  await page.getByRole('option', { name: tenDanhMuc, exact: true }).click();

  const post = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/catalog/products');
  await page.getByRole('button', { name: 'Tạo sản phẩm', exact: true }).click();
  const res = await post;
  expect(res.status(), await res.text()).toBe(201);
  const { id } = (await res.json()) as { id: string };

  await expect(page).toHaveURL(new RegExp(`/catalog/products/${id}\\?created=1$`));
  const next = page.getByTestId('created-next-steps');
  await expect(next).toBeVisible();
  await expect(next.getByRole('heading', { name: 'Đã tạo sản phẩm · Tiếp theo' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  // Form giữ nguyên instance, tên đã lưu hiện ngay
  await expect(page.getByLabel('Tên sản phẩm')).toHaveValue(tenSanPham);
  // Chỉ một toast, hiện sau khi xong
  const toasts = page.locator('[data-sonner-toast]');
  await expect(toasts.filter({ hasText: `Đã tạo ${tenSanPham}` })).toHaveCount(1);
  await expect(toasts).toHaveCount(1);
  // Bước đăng sản phẩm có trong khung
  await expect(next.getByText('Đăng sản phẩm').first()).toBeVisible();
});

test('đóng khung Tiếp theo: bỏ ?created=1, tải lại không hiện lại', async () => {
  await page.getByRole('button', { name: 'Đóng hướng dẫn tiếp theo' }).click();
  await expect(page.getByTestId('created-next-steps')).toHaveCount(0);
  await expect(page).not.toHaveURL(/created=1/);
  await page.reload();
  await expect(page.getByLabel('Tên sản phẩm')).toHaveValue(tenSanPham);
  await expect(page.getByTestId('created-next-steps')).toHaveCount(0);
});

test('gõ /catalog/products thì về danh sách /catalog', async () => {
  await page.goto(`/c/${cty.companyId}/catalog/products`);
  await expect(page).toHaveURL(new RegExp(`/c/${cty.companyId}/catalog$`));
  await expect(page.getByText(tenSanPham)).toBeVisible();
});
