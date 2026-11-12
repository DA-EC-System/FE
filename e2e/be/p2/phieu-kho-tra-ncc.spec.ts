// B3 phiếu kho có duyệt, B4 phiếu trả NCC trên BE thật (commerio-backend#208, #210). Một công ty giả riêng (một register,
// một login, e2e/be/congTyGia.ts): công ty một người nên CEO tự duyệt được, mỗi lần tự duyệt có nhãn.
// Dữ liệu nền (danh mục, sản phẩm một biến thể, NCC) dựng qua API công khai; tồn chỉ có được bằng phiếu kiểm kê.
import { type Page, expect, test } from '@playwright/test';
import { type CongTyGia, taoCongTyGia } from '../congTyGia';

test.describe.configure({ mode: 'serial' });

let cty: CongTyGia;
let page: Page;
let sku: string;
let variantId: string;
const NCC = 'NCC kiểm thử giả';

const tao = async <T>(path: string, data: object): Promise<T> => {
  const res = await cty.api.post(`/api/v1${path}`, { data });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as T;
};

test.beforeAll(async ({ browser }) => {
  cty = await taoCongTyGia(browser, { ten: 'kho', optionalModules: ['purchasing'] });
  page = cty.page;
  const category = await tao<{ id: string }>('/catalog/categories', { name: 'Áo kiểm thử', skuPattern: 'AOKT-{SEQ:4}' });
  const product = await tao<{ variants: { id: string; sku: string }[] }>('/catalog/products', {
    name: 'Áo kiểm thử giả',
    categoryId: category.id,
    variants: [{ attributeValueIds: [] }],
  });
  ({ id: variantId, sku } = product.variants[0]!);
  await tao('/purchasing/suppliers', { name: NCC });
});

test.afterAll(async () => {
  await cty?.dispose();
});

/** Bấm nút thao tác rồi xác nhận trong hộp thoại */
const thaoTac = async (label: string) => {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: label, exact: true }).click();
};

const chonBienThe = async () => {
  await page.locator('#variant-picker').click();
  await page.locator('#variant-picker').fill(sku);
  await page.locator('[role=option]').filter({ hasText: sku }).first().click();
};

const moLapPhieu = async (loai: 'Kiểm kê' | 'Xuất huỷ' | 'Chuyển chờ xử lý') => {
  await page.goto(`/c/${cty.companyId}/inventory`);
  await page.getByRole('tab', { name: 'Phiếu kho', exact: true }).click();
  await page.getByRole('button', { name: loai, exact: true }).click();
  await chonBienThe();
};

const ton = async () => {
  const res = await cty.api.get(`/api/v1/inventory/stock/${variantId}`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as { level: { onHand: number; quarantine: number; locked: number; available: number } }).level;
};

test('B3a kiểm kê: đếm 10, gửi duyệt, CEO công ty một người tự duyệt có nhãn, tồn thực thành 10', async () => {
  await moLapPhieu('Kiểm kê');
  await page.getByTestId('doc-lines').getByLabel(`Số đếm ${sku}`, { exact: true }).fill('10');
  await thaoTac('Gửi duyệt');
  await expect(page.getByTestId('doc-status')).toContainText('Chờ duyệt');
  await thaoTac('Duyệt và ghi sổ');
  await expect(page.getByTestId('doc-status')).toContainText('Đã ghi sổ');
  await expect(page.getByText('Tự duyệt', { exact: true }).first()).toBeVisible();
  expect(await ton()).toMatchObject({ onHand: 10, quarantine: 0, locked: 0 });
});

test('B3a xuất huỷ: gửi duyệt thì tạm khoá, từ chối bắt buộc lý do và nhả khoá', async () => {
  await moLapPhieu('Xuất huỷ');
  await page.getByTestId('doc-lines').getByLabel(`Số lượng ${sku}`, { exact: true }).fill('2');
  await page.locator('#doc-note').fill('Rách khi dỡ hàng');
  await thaoTac('Gửi duyệt');
  await expect(page.getByTestId('doc-status')).toContainText('Chờ duyệt');
  await expect(page.getByTestId('doc-lines')).toContainText('tạm khoá 2');
  expect(await ton()).toMatchObject({ onHand: 10, locked: 2, available: 8 });

  await page.getByRole('button', { name: 'Từ chối', exact: true }).click();
  const hop = page.getByRole('dialog');
  await hop.getByRole('textbox').fill('Hàng còn bán được');
  await hop.getByRole('button', { name: 'Từ chối', exact: true }).click();
  await expect(page.getByTestId('doc-status')).toContainText('Từ chối');
  expect(await ton()).toMatchObject({ onHand: 10, locked: 0, available: 10 });
});

test('B3a chuyển chờ xử lý 3 cái: duyệt xong tồn thực 7, chờ xử lý 3; phiếu có trong danh sách', async () => {
  await moLapPhieu('Chuyển chờ xử lý');
  await page.getByTestId('doc-lines').getByLabel(`Số lượng ${sku}`, { exact: true }).fill('3');
  await page.locator('#doc-note').fill('Lỗi đường may');
  await thaoTac('Gửi duyệt');
  await expect(page.getByTestId('doc-status')).toContainText('Chờ duyệt');
  await thaoTac('Duyệt và ghi sổ');
  await expect(page.getByTestId('doc-status')).toContainText('Đã ghi sổ');
  expect(await ton()).toMatchObject({ onHand: 7, quarantine: 3 });

  await page.goto(`/c/${cty.companyId}/inventory`);
  await page.getByRole('tab', { name: 'Phiếu kho', exact: true }).click();
  for (const so of ['KK-000001', 'XH-000001', 'CXL-000001']) await expect(page.getByText(so, { exact: true })).toBeVisible();
});

test('B4 phiếu trả NCC: lập tay 2 cái từ chờ xử lý, gửi duyệt, duyệt và gửi, ghi NCC hoàn tiền', async () => {
  await page.goto(`/c/${cty.companyId}/purchasing/returns/new`);
  await page.locator('#ret-supplier').click();
  await page.getByRole('option', { name: NCC, exact: true }).click();
  await page.locator('#ret-note').fill('Trả hàng lỗi đường may');
  await chonBienThe();
  await page.getByTestId('return-lines').getByLabel(`Số trả ${sku}`, { exact: true }).fill('2');
  await thaoTac('Gửi duyệt');
  await expect(page.getByTestId('return-status')).toContainText('Chờ duyệt');
  await thaoTac('Duyệt và gửi');
  await expect(page.getByTestId('return-status')).toContainText('Đã gửi');
  // Gửi đi thì hàng rời chờ xử lý
  expect(await ton()).toMatchObject({ onHand: 7, quarantine: 1 });

  await page.getByRole('button', { name: 'NCC hoàn tiền', exact: true }).click();
  const hop = page.getByRole('dialog');
  await hop.getByLabel(/Số tiền NCC hoàn/).fill('120000');
  await hop.getByRole('button', { name: 'Ghi hoàn tiền', exact: true }).click();
  await expect(page.getByTestId('return-status')).toContainText('NCC hoàn tiền');
  await expect(page.locator('main')).toContainText('120.000');

  await page.reload();
  await expect(page.getByTestId('return-status')).toContainText('NCC hoàn tiền');
});
