// Trang tồn trên BE thật (FE#285, commerio-backend#206): nhãn "Đang về" lấy từ đề nghị nhập đã đặt NCC mà chưa nhận.
// Thiếu và Lệch tồn BE chưa tính (#206 còn mở) nên chỉ kiểm không hiện nhãn sai; spec mock kiểm phần bấm mở.
// Một công ty giả riêng (e2e/be/congTyGia.ts); dữ liệu nền dựng qua API công khai.
import { type Page, expect, test } from '@playwright/test';
import { type CongTyGia, taoCongTyGia } from '../congTyGia';

test.describe.configure({ mode: 'serial' });

let cty: CongTyGia;
let page: Page;
let sku: string;
let variantId: string;
let supplierId: string;

const goi = async <T>(method: 'post' | 'put', path: string, data: object, status = 200): Promise<T> => {
  const res = await cty.api[method](`/api/v1${path}`, { data });
  expect(res.status(), await res.text()).toBe(status);
  return (await res.json()) as T;
};

test.beforeAll(async ({ browser }) => {
  cty = await taoCongTyGia(browser, { ten: 'tonkho' });
  page = cty.page;
  const group = await goi<{ id: string }>('post', '/catalog/groups', { name: 'Áo tồn giả' }, 201);
  const product = await goi<{ variants: { id: string; sku: string }[] }>(
    'post',
    '/catalog/products',
    { name: 'Áo tồn kho giả', groupId: group.id, axes: [], variants: [{ options: [] }] },
    201,
  );
  ({ id: variantId, sku } = product.variants[0]!);
  ({ id: supplierId } = await goi<{ id: string }>('post', '/purchasing/suppliers', { name: 'NCC tồn kho giả' }, 201));
});

test.afterAll(async () => {
  await cty?.dispose();
});

const dongTon = () => page.getByRole('row').filter({ hasText: sku });

const moTon = async () => {
  await page.goto(`/c/${cty.companyId}/inventory`);
  await page.getByRole('searchbox', { name: 'Tìm theo tên sản phẩm hoặc SKU' }).fill(sku);
  await expect(dongTon()).toHaveCount(1);
};

test('chưa đặt NCC thì không có nhãn Đang về', async () => {
  await moTon();
  await expect(dongTon().getByTestId('chip-incoming')).toHaveCount(0);
});

test('đề nghị đã đặt NCC chưa nhận: hiện Đang về đúng số; không hiện Thiếu, Lệch tồn (US-TK-01…05)', async () => {
  type Req = { id: string; version: number };
  let req = await goi<Req>('post', '/purchasing/requests', { supplierId, note: '', lines: [{ variantId, quantity: 7, unitCost: 50000 }] }, 201);
  req = await goi<Req>('post', `/purchasing/requests/${req.id}/submit`, { version: req.version });
  req = await goi<Req>('post', `/purchasing/requests/${req.id}/approve`, { version: req.version });
  await goi<Req>('post', `/purchasing/requests/${req.id}/order`, { version: req.version, expectedDeliveryDate: '2030-01-15' });

  const res = await cty.api.get(`/api/v1/inventory/stock/${variantId}`);
  expect(res.status()).toBe(200);
  expect(((await res.json()) as { level: { incoming: number } }).level.incoming).toBe(7);

  await moTon();
  await expect(dongTon().getByTestId('chip-incoming')).toHaveText('Đang về 7');
  await expect(dongTon().getByTestId('chip-shortage')).toHaveCount(0);
  await expect(dongTon().getByTestId('chip-drift')).toHaveCount(0);
});
