// Bảng sửa từng ô ở Mua hàng trên BE thật (FE#476): dòng đề nghị nhập hàng (Số lượng, Giá nhập) và bảng Biến thể của
// bản soạn hàng mới. Ô ghi vào form trên trang, Lưu nháp / Lưu bản soạn mới gửi; mặc định khoá, nhớ khoá theo từng bảng.
// Một công ty giả riêng (e2e/be/congTyGia.ts); dữ liệu nền dựng qua API công khai.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { type CongTyGia, taoCongTyGia } from '../congTyGia';

test.describe.configure({ mode: 'serial' });

let cty: CongTyGia;
let page: Page;
let requestId: string;
let sku: string;

const TEN_CHA = 'Áo soạn bảng sửa từng ô e2e';

const goi = async <T>(method: 'post' | 'put', path: string, data: object, status = 200): Promise<T> => {
  const res = await cty.api[method](`/api/v1${path}`, { data });
  expect(res.status(), await res.text()).toBe(status);
  return (await res.json()) as T;
};

const doc = async <T>(path: string): Promise<T> => {
  const res = await cty.api.get(`/api/v1${path}`);
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as T;
};

type Req = {
  id: string;
  version: number;
  lines: { sku: string | null; quantity: number; unitCost: number | null }[];
  productDrafts: { id: string }[];
};

test.beforeAll(async ({ browser }) => {
  cty = await taoCongTyGia(browser, { ten: 'bangsua' });
  page = cty.page;
  const group = await goi<{ id: string }>('post', '/catalog/groups', { name: 'Áo bảng sửa giả' }, 201);
  const product = await goi<{ variants: { id: string; sku: string }[] }>(
    'post',
    '/catalog/products',
    { name: 'Áo có sẵn dùng kiểm thử bảng sửa e2e', groupId: group.id, axes: [], variants: [{ options: [] }] },
    201,
  );
  const variantId = product.variants[0]!.id;
  sku = product.variants[0]!.sku;
  const { id: supplierId } = await goi<{ id: string }>('post', '/purchasing/suppliers', { name: 'NCC bảng sửa giả' }, 201);
  const newProduct = (mau: string) => ({ parentId: null, parentName: TEN_CHA, groupId: group.id, optionValues: { Màu: mau } });
  ({ id: requestId } = await goi<Req>(
    'post',
    '/purchasing/requests',
    {
      supplierId,
      note: '',
      lines: [
        { variantId, quantity: 5, unitCost: 50000 },
        { newProduct: newProduct('Đỏ'), quantity: 3, unitCost: 40000 },
        { newProduct: newProduct('Xanh'), quantity: 2, unitCost: 40000 },
      ],
    },
    201,
  ));
});

test.afterAll(async () => {
  await cty?.dispose();
});

const khoa = (bang: Locator) => bang.getByRole('button', { name: 'Khoá sửa' });

/** Bấm đúp vào ô, gõ số mới, Enter */
const suaO = async (o: Locator, so: string) => {
  await o.dblclick();
  const editor = page.locator('[data-grid-editor]');
  await expect(editor).toBeFocused();
  await editor.fill(so);
  await editor.press('Enter');
  await expect(editor).toHaveCount(0);
};

test('đề nghị nhập hàng: mặc định khoá; mở khoá sửa Số lượng, Giá nhập rồi Lưu nháp; nhớ khoá sau tải lại', async () => {
  await page.goto(`/c/${cty.companyId}/purchasing/requests/${requestId}`);
  const bang = page.getByTestId('request-lines');
  await expect(bang.getByRole('grid', { name: 'Dòng đề nghị nhập hàng' })).toBeVisible();
  await expect(khoa(bang)).toHaveAttribute('aria-pressed', 'true');

  const dong = bang.getByRole('row').filter({ hasText: sku });
  const soLuong = dong.locator('[role="gridcell"][data-col-id="quantity"]');
  const giaNhap = dong.locator('[role="gridcell"][data-col-id="unitCost"]');
  // Đang khoá: bấm đúp không mở ô sửa
  await soLuong.dblclick();
  await expect(page.locator('[data-grid-editor]')).toHaveCount(0);

  await khoa(bang).click();
  await expect(khoa(bang)).toHaveAttribute('aria-pressed', 'false');
  await suaO(soLuong, '12');
  await expect(soLuong).toContainText('12');
  await suaO(giaNhap, '65000');
  await expect(giaNhap).toContainText('65.000');

  await page.getByRole('button', { name: 'Lưu nháp' }).click();
  await expect(page.getByText(/^Đã lưu nháp /)).toBeVisible();
  const req = await doc<Req>(`/purchasing/requests/${requestId}`);
  expect(req.lines.find((l) => l.sku === sku)).toMatchObject({ quantity: 12, unitCost: 65000 });

  // Ô còn chữ sai thì Lưu nháp bị chặn dù ô khác đã đổi đúng: không gửi số cũ (review PR #481)
  await suaO(giaNhap, '70000');
  await soLuong.dblclick();
  await page.locator('[data-grid-editor]').fill('abc');
  await page.getByRole('button', { name: 'Lưu nháp' }).click();
  await expect(page.getByText(/^Còn ô chưa đúng/)).toBeVisible();
  await expect(page.locator('[data-grid-editor]')).toHaveValue('abc');
  await expect(page.locator('[data-grid-editor]')).toBeFocused();
  expect((await doc<Req>(`/purchasing/requests/${requestId}`)).lines.find((l) => l.sku === sku)).toMatchObject({ quantity: 12, unitCost: 65000 });
  await page.locator('[data-grid-editor]').fill('13');
  await page.locator('[data-grid-editor]').press('Enter');
  await page.getByRole('button', { name: 'Lưu nháp' }).click();
  await expect(page.getByText(/^Đã lưu nháp /).last()).toBeVisible();
  await expect
    .poll(async () => (await doc<Req>(`/purchasing/requests/${requestId}`)).lines.find((l) => l.sku === sku))
    .toMatchObject({ quantity: 13, unitCost: 70000 });

  await page.reload();
  await expect(khoa(page.getByTestId('request-lines'))).toHaveAttribute('aria-pressed', 'false');
});

test('bản soạn hàng mới: khoá riêng với bảng đề nghị; sửa ô Mọi biến thể và một biến thể rồi Lưu bản soạn', async () => {
  const req = await doc<Req>(`/purchasing/requests/${requestId}`);
  const draftId = req.productDrafts[0]!.id;
  await page.goto(`/c/${cty.companyId}/purchasing/product-drafts/${draftId}`);
  const bang = page.getByTestId('draft-variants');
  await expect(bang.getByRole('grid', { name: 'Biến thể' })).toBeVisible();
  // gridId riêng: bảng đề nghị đã mở khoá nhưng bảng này vẫn khoá
  await expect(khoa(bang)).toHaveAttribute('aria-pressed', 'true');
  await khoa(bang).click();

  const o = (dong: string, cot: string) =>
    bang.getByRole('row').filter({ hasText: dong }).locator(`[role="gridcell"][data-col-id="${cot}"]`);
  await suaO(o('Mọi biến thể', 'targetNetPrice'), '150000');
  await expect(o('Mọi biến thể', 'targetNetPrice')).toContainText('150.000');
  // Ô trống của biến thể hiện số dòng Mọi biến thể, chữ mờ
  await expect(o('Xanh', 'targetNetPrice')).toContainText('150.000');
  await o('Đỏ', 'weightG').dblclick();
  await page.locator('[data-grid-editor]').fill('0');
  await page.locator('[data-grid-editor]').press('Enter');
  // Cân nặng 0 sai luật: ô sửa giữ lại, báo lỗi; Esc bỏ
  await expect(page.locator('[data-grid-editor]')).toBeVisible();
  await expect(page.getByText('Cân nặng là số nguyên gam > 0')).toBeVisible();
  await page.locator('[data-grid-editor]').press('Escape');
  await suaO(o('Đỏ', 'weightG'), '250');

  // Ô còn chữ sai thì Lưu bản soạn bị chặn dù ô khác đã đổi đúng; ô sai mở lại với chữ đã gõ (review PR #481)
  await o('Xanh', 'weightG').dblclick();
  await page.locator('[data-grid-editor]').fill('0');
  await page.getByRole('button', { name: 'Lưu bản soạn' }).click();
  await expect(page.getByText('Có ô số chưa đúng. Xem các ô báo đỏ.')).toBeVisible();
  await expect(page.locator('[data-grid-editor]')).toHaveValue('0');
  expect((await doc<{ variantDefaults: { targetNetPrice: number | null } }>(`/purchasing/product-drafts/${draftId}`)).variantDefaults.targetNetPrice).toBeNull();
  await page.locator('[data-grid-editor]').fill('');
  await page.locator('[data-grid-editor]').press('Enter');

  await page.getByRole('button', { name: 'Lưu bản soạn' }).click();
  await expect(page.getByText(`Đã lưu bản soạn ${TEN_CHA}`)).toBeVisible();
  const draft = await doc<{
    variantDefaults: { targetNetPrice: number | null };
    variants: { optionValues: Record<string, string>; weightG: number | null }[];
  }>(`/purchasing/product-drafts/${draftId}`);
  expect(draft.variantDefaults.targetNetPrice).toBe(150000);
  expect(draft.variants.find((v) => v.optionValues['Màu'] === 'Đỏ')?.weightG).toBe(250);
  expect(draft.variants.find((v) => v.optionValues['Màu'] === 'Xanh')?.weightG).toBeNull();
});
