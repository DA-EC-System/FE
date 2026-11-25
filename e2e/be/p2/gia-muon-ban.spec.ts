// P2 · Giá muốn bán, nhãn SKU, xoá hẳn trên BE thật (FE#260; Documents/21 §17.1–17.4, commerio-backend#344, #345).
// Bảng biến thể sửa từng ô có khoá (FE#475): khoá thì bấm đúp không mở ô; mở khoá, sửa, Enter lưu, tải lại vẫn còn;
// ngưỡng tồn đặt lần đầu rồi sửa lại không báo xung đột giả.
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
  sku: string;
  weightG?: number | null;
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

test.beforeAll(async ({ browser }) => {
  cty = await taoCongTyGia(browser, { ten: 'giamuonban' });
  page = cty.page;
  const group = await tao<{ id: string }>('/catalog/groups', { name: 'Áo giá muốn bán' });
  ({ id: productId } = await tao<{ id: string }>('/catalog/products', {
    name: 'Áo kiểm thử giá muốn bán mẫu',
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
  await expect(sku().getByTestId('variant-readiness')).toContainText('giá muốn thực nhận');
  await expect(sku().locator('[data-testid=variant-status] [data-status=not_listed]')).toBeVisible();
});

test('bảng biến thể mặc định khoá: bấm đúp không mở ô sửa', async () => {
  test.skip(Boolean(boQua), boQua);
  const khoa = page.getByRole('button', { name: 'Khoá sửa', exact: true });
  await expect(khoa).toHaveAttribute('aria-pressed', 'true');
  await expect(sku().getByTestId('variant-price')).toHaveAttribute('aria-readonly', 'true');
  await sku().getByTestId('variant-price').dblclick();
  await expect(page.locator('[data-grid-editor]')).toHaveCount(0);
  // Đang khoá, gõ vào ô cũng không mở
  await page.keyboard.type('5');
  await expect(page.locator('[data-grid-editor]')).toHaveCount(0);
});

test('mở khoá, sửa giá chuẩn và giá muốn bán từng ô: Enter lưu ngay, tải lại vẫn còn', async () => {
  test.skip(Boolean(boQua), boQua);
  const khoa = page.getByRole('button', { name: 'Khoá sửa', exact: true });
  await khoa.click();
  await expect(khoa).toHaveAttribute('aria-pressed', 'false');
  const luu = () =>
    page.waitForResponse((r) => r.request().method() === 'PATCH' && new URL(r.url()).pathname.endsWith(`/variants/${variantId}`));

  // Bấm đúp mở ô, Enter lưu
  await sku().getByTestId('variant-price').dblclick();
  const oGia = page.getByRole('textbox', { name: /^Giá chuẩn / });
  await oGia.fill('199.000');
  let res = luu();
  await oGia.press('Enter');
  expect((await res).status()).toBe(200);
  await expect(page.locator('[data-grid-editor]')).toHaveCount(0);
  await expect(sku().getByTestId('variant-price')).toContainText('199.000');

  // Gõ đè trên ô đang chọn, Enter lưu
  await sku().getByTestId('variant-target-price').click();
  await page.keyboard.type('170000');
  res = luu();
  await page.keyboard.press('Enter');
  expect((await res).status()).toBe(200);
  await expect(sku().getByTestId('variant-target-price')).toContainText('170.000');
  await expect(sku().getByTestId('variant-readiness')).not.toContainText('giá muốn thực nhận');

  // Số chữ sai: không gửi, ô vẫn mở kèm lỗi
  await sku().getByTestId('variant-weight').dblclick();
  const oKhoiLuong = page.getByRole('textbox', { name: /^Khối lượng \(g\) / });
  await oKhoiLuong.fill('60000');
  await oKhoiLuong.press('Enter');
  await expect(oKhoiLuong).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Cân nặng tối đa 50 kg')).toBeVisible();
  await oKhoiLuong.press('Escape');

  await page.reload();
  await expect(sku().getByTestId('variant-price')).toContainText('199.000');
  await expect(sku().getByTestId('variant-target-price')).toContainText('170.000');
  // Trạng thái mở khoá nhớ theo bảng
  await expect(page.getByRole('button', { name: 'Khoá sửa', exact: true })).toHaveAttribute('aria-pressed', 'false');
  const v = (await chiTiet()).variants[0]!;
  expect(v).toMatchObject({ standardPrice: 199000, targetNetPrice: 170000 });
  expect(v.missing).not.toContain('price');
  expect(v).not.toMatchObject({ weightG: 60000 });
});

test('sửa hàng loạt: mở khoá, sửa khối lượng một ô, Enter lưu qua PATCH bulk, tải lại vẫn còn', async () => {
  test.skip(Boolean(boQua), boQua);
  const { sku: ma } = (await chiTiet()).variants[0]!;
  await page.goto(`/c/${cty.companyId}/catalog?mode=bulk`);
  await expect(page.getByRole('button', { name: /^Lưu \d+ SKU/ })).toHaveCount(0);
  const dong = () => page.locator(`tbody tr[data-row-id="${variantId}"]`);
  await expect(dong()).toBeVisible();
  // Bảng sửa hàng loạt nhớ khoá riêng, mặc định vẫn khoá
  const khoa = page.getByRole('button', { name: 'Khoá sửa', exact: true });
  await expect(khoa).toHaveAttribute('aria-pressed', 'true');
  await dong().locator('[data-col-id=weightG]').dblclick();
  await expect(page.locator('[data-grid-editor]')).toHaveCount(0);

  await page.keyboard.press('Control+e');
  await expect(khoa).toHaveAttribute('aria-pressed', 'false');
  await dong().locator('[data-col-id=weightG]').dblclick();
  const o = page.getByRole('textbox', { name: `Khối lượng (g) ${ma}` });
  await o.fill('350');
  const res = page.waitForResponse((r) => r.request().method() === 'PATCH' && new URL(r.url()).pathname.endsWith('/catalog/variants/bulk'));
  await o.press('Enter');
  expect((await res).status()).toBe(200);
  await expect(dong().locator('[data-col-id=weightG]')).toContainText('350');

  await page.reload();
  await expect(dong().locator('[data-col-id=weightG]')).toContainText('350');
  expect((await chiTiet()).variants[0]!.weightG).toBe(350);
  await page.goto(`/c/${cty.companyId}/catalog/products/${productId}`);
});

test('ngưỡng tồn: đặt lần đầu rồi sửa lại ngay, ở trang sản phẩm và Sửa hàng loạt, không báo xung đột giả', async () => {
  test.skip(Boolean(boQua), boQua);
  const { sku: ma } = (await chiTiet()).variants[0]!;
  const moKhoa = async () => {
    const khoa = page.getByRole('button', { name: 'Khoá sửa', exact: true });
    if ((await khoa.getAttribute('aria-pressed')) === 'true') await khoa.click();
    await expect(khoa).toHaveAttribute('aria-pressed', 'false');
  };
  // Mỗi lần: mở ô, gõ số, Enter; PATCH bulk trả 200 và không có dòng lỗi (xung đột nằm trong `failed`)
  const datNguong = async (oNguong: () => ReturnType<Page['locator']>, so: string) => {
    await oNguong().dblclick();
    const o = page.getByRole('textbox', { name: `Ngưỡng tồn ${ma}` });
    await o.fill(so);
    const res = page.waitForResponse((r) => r.request().method() === 'PATCH' && new URL(r.url()).pathname.endsWith('/catalog/variants/bulk'));
    await o.press('Enter');
    const body = (await (await res).json()) as { failed: unknown[] };
    expect(body.failed).toEqual([]);
    await expect(oNguong()).toContainText(so);
    await expect(oNguong().getByTestId('cell-error')).toHaveCount(0);
  };

  // Trang sản phẩm: SKU chưa có dòng tồn (reorderVersion null), BE tạo dòng rồi tăng version, lần hai phải lấy số mới
  await page.goto(`/c/${cty.companyId}/catalog/products/${productId}`);
  await moKhoa();
  const oSanPham = () => sku().getByTestId('variant-min-qty');
  await datNguong(oSanPham, '5');
  await datNguong(oSanPham, '7');

  // Sửa hàng loạt: sửa tiếp hai lần trên cùng SKU
  await page.goto(`/c/${cty.companyId}/catalog?mode=bulk`);
  await moKhoa();
  const oBang = () => page.locator(`tbody tr[data-row-id="${variantId}"] [data-col-id=minQty]`);
  await datNguong(oBang, '9');
  await datNguong(oBang, '11');
  await page.goto(`/c/${cty.companyId}/catalog/products/${productId}`);
});

test('tạm ngừng bán rồi mở bán lại: nhãn chính đổi theo trạng thái kinh doanh', async () => {
  test.skip(Boolean(boQua), boQua);
  const alert = page.getByRole('alertdialog');
  await sku().getByRole('button', { name: /^Đổi trạng thái/ }).click();
  await page.getByRole('menuitem', { name: 'Tạm ngừng bán', exact: true }).click();
  await alert.getByRole('button', { name: 'Tạm ngừng bán', exact: true }).click();
  await expect(sku().locator('[data-testid=variant-status] [data-status=paused]')).toBeVisible();
  expect((await chiTiet()).variants[0]!.businessStatus).toBe('paused');

  await sku().getByRole('button', { name: /^Đổi trạng thái/ }).click();
  await page.getByRole('menuitem', { name: 'Mở bán lại', exact: true }).click();
  await alert.getByRole('button', { name: 'Mở bán lại', exact: true }).click();
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
