// P2 · Giá muốn bán, nhãn SKU, xoá hẳn trên BE thật (FE#260; Documents/21 §17.1–17.4, commerio-backend#344, #345).
// Một công ty giả riêng (e2e/be/congTyGia.ts), sản phẩm nền dựng qua API công khai.
// BE chưa có targetNetPrice / code (BE#344, #345 chưa lên môi trường này) thì bỏ qua, không đỏ.
import { type Page, expect, test } from '@playwright/test';
import { type CongTyGia, taoCongTyGia } from '../congTyGia';

test.describe.configure({ mode: 'serial' });

let cty: CongTyGia;
let page: Page;
let productId: string;
let variantId: string;
let boQua: string | undefined;

interface Variant {
  id: string;
  standardPrice: number | null;
  targetNetPrice?: number | null;
  readiness?: string;
  missing?: string[];
  presence?: string;
  businessStatus?: string;
}
interface Detail {
  code?: string;
  version: number;
  variants: Variant[];
}

const tao = async <T>(path: string, data: object): Promise<T> => {
  const res = await cty.api.post(`/api/v1${path}`, { data });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as T;
};
const chiTiet = async (): Promise<Detail> => {
  const res = await cty.api.get(`/api/v1/catalog/products/${productId}`);
  expect(res.status()).toBe(200);
  return (await res.json()) as Detail;
};
const sku = () => page.locator(`tbody tr[data-row-id="${variantId}"]`);
const o = (nhan: string) => page.getByRole('dialog').getByRole('textbox', { name: nhan, exact: true });

test.beforeAll(async ({ browser }) => {
  cty = await taoCongTyGia(browser, { ten: 'giamuonban' });
  page = cty.page;
  const group = await tao<{ id: string }>('/catalog/groups', { name: 'Áo giá muốn bán' });
  ({ id: productId } = await tao<{ id: string }>('/catalog/products', {
    name: 'Áo kiểm thử giá muốn bán',
    groupId: group.id,
    axes: [],
    variants: [{ options: [] }],
  }));
  const p = await chiTiet();
  variantId = p.variants[0]!.id;
  if (p.code === undefined || !('targetNetPrice' in p.variants[0]!))
    boQua = 'BE chưa trả code / targetNetPrice (commerio-backend#344, #345 chưa lên môi trường này)';
});

test.afterAll(async () => {
  await cty?.dispose();
});

test('mã sản phẩm ở đầu trang; SKU mới thiếu giá muốn bán, chưa lên sàn', async () => {
  test.skip(Boolean(boQua), boQua);
  const p = await chiTiet();
  await page.goto(`/c/${cty.companyId}/catalog/products/${productId}`);
  await expect(page.getByTestId('product-code')).toHaveText(p.code!);
  await expect(sku().getByTestId('variant-readiness')).toContainText('Chờ hoàn thiện');
  await expect(sku().getByTestId('variant-readiness')).toContainText('giá muốn bán');
  await expect(sku().locator('[data-testid=variant-status] [data-status=not_listed]')).toBeVisible();
});

test('sửa giá chuẩn và giá muốn bán: hết thiếu giá muốn bán, BE lưu cả hai', async () => {
  test.skip(Boolean(boQua), boQua);
  await sku().getByRole('button', { name: /^Sửa thông tin / }).click();
  await o('Giá chuẩn (đ)').fill('199.000');
  await o('Giá muốn bán – số muốn thực nhận (đ)').fill('170.000');
  const patch = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && new URL(r.url()).pathname.endsWith(`/variants/${variantId}`),
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Lưu', exact: true }).click();
  const res = await patch;
  expect(res.status(), await res.text()).toBe(200);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await expect(sku().getByTestId('variant-price')).toContainText('199.000');
  await expect(sku().getByTestId('variant-target-price')).toContainText('170.000');
  await expect(sku().getByTestId('variant-readiness')).not.toContainText('giá muốn bán');
  const v = (await chiTiet()).variants[0]!;
  expect(v).toMatchObject({ standardPrice: 199000, targetNetPrice: 170000 });
  expect(v.missing).not.toContain('price');
});

test('tạm ngừng rồi bỏ tạm ngừng: nhãn chính đổi theo trạng thái kinh doanh', async () => {
  test.skip(Boolean(boQua), boQua);
  const alert = page.getByRole('alertdialog');
  await sku().getByRole('button', { name: /^Đổi trạng thái/ }).click();
  await page.getByRole('menuitem', { name: 'Tạm ngừng', exact: true }).click();
  await alert.getByRole('button', { name: 'Tạm ngừng', exact: true }).click();
  await expect(sku().locator('[data-testid=variant-status] [data-status=paused]')).toBeVisible();
  expect((await chiTiet()).variants[0]!.businessStatus).toBe('paused');

  await sku().getByRole('button', { name: /^Đổi trạng thái/ }).click();
  await page.getByRole('menuitem', { name: 'Bỏ tạm ngừng', exact: true }).click();
  await alert.getByRole('button', { name: 'Bỏ tạm ngừng', exact: true }).click();
  await expect(sku().locator('[data-testid=variant-status] [data-status=not_listed]')).toBeVisible();
  expect((await chiTiet()).variants[0]!.businessStatus).toBe('selling');
});

test('sản phẩm chưa ảnh, mọi SKU Chờ hoàn thiện: xoá hẳn được', async () => {
  test.skip(Boolean(boQua), boQua);
  await page.getByRole('button', { name: 'Xoá hẳn', exact: true }).click();
  const del = page.waitForResponse((r) => r.request().method() === 'DELETE');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Xoá hẳn', exact: true }).click();
  expect((await del).status()).toBe(204);
  await expect.poll(() => new URL(page.url()).pathname).toMatch(/\/catalog$/);
  const res = await cty.api.get(`/api/v1/catalog/products/${productId}`);
  expect(res.status()).toBe(404);
});
