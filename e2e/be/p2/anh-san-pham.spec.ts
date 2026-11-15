// P2 · Ảnh sản phẩm trên BE thật (FE#205, commerio-backend#303): nén ở FE, xin vé, PUT lên kho, lưu imageFileIds,
// ảnh đầu là ảnh đại diện. Một công ty giả riêng (e2e/be/congTyGia.ts), sản phẩm nền dựng qua API công khai.
// BE chưa nhận ảnh (422 errors.images "Chưa hỗ trợ ảnh sản phẩm") hoặc kho tệp chưa bật (503 storage_unavailable)
// thì bỏ qua, không đỏ: spec chạy được ngay khi BE#303 lên staging.
import { type Page, type Response, expect, test } from '@playwright/test';
import { type CongTyGia, taoCongTyGia } from '../congTyGia';

test.describe.configure({ mode: 'serial' });

let cty: CongTyGia;
let page: Page;
let productId: string;
/** Lý do bỏ qua các test sau khi test đầu thấy BE chưa sẵn sàng */
let boQua: string | undefined;

interface ProductImage {
  fileId: string;
  url: string;
  position: number;
}
interface ProductDetail {
  thumbnailUrl: string | null;
  images: ProductImage[];
}

const tao = async <T>(path: string, data: object): Promise<T> => {
  const res = await cty.api.post(`/api/v1${path}`, { data });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as T;
};

const chiTiet = async (): Promise<ProductDetail> => {
  const res = await cty.api.get(`/api/v1/catalog/products/${productId}`);
  expect(res.status()).toBe(200);
  return (await res.json()) as ProductDetail;
};

/** Vẽ ảnh nhiễu trong trình duyệt (nén kém, ra tệp lớn) rồi trả về bytes */
async function taoAnh(width: number, height: number, type: string): Promise<Buffer> {
  const b64 = await page.evaluate(
    async ({ width, height, type }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      const img = ctx.createImageData(width, height);
      for (let i = 0; i < img.data.length; i += 4) {
        img.data[i] = (i * 7919) % 251;
        img.data[i + 1] = (i * 104729) % 241;
        img.data[i + 2] = (i * 1299709) % 239;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), type, 0.95));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    },
    { width, height, type },
  );
  return Buffer.from(b64, 'base64');
}

const anh = () => page.getByTestId('product-images').locator('[data-image-id]');
const isPath = (r: Response, path: string) => new URL(r.url()).pathname === `/api/v1${path}`;

/** Bấm Lưu, trả phản hồi PUT sản phẩm; BE chưa nhận ảnh thì đánh dấu bỏ qua */
async function luu(): Promise<Response> {
  const res = page.waitForResponse((r) => r.request().method() === 'PUT' && isPath(r, `/catalog/products/${productId}`));
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  const put = await res;
  if (put.status() === 422) {
    const body = (await put.json()) as { errors?: { images?: string | string[] } };
    const msg = [body.errors?.images ?? []].flat().join(' ');
    if (msg.includes('Chưa hỗ trợ ảnh')) boQua = `BE chưa nhận ảnh sản phẩm (commerio-backend#303): ${msg}`;
  }
  return put;
}

test.beforeAll(async ({ browser }) => {
  cty = await taoCongTyGia(browser, { ten: 'anh' });
  page = cty.page;
  const category = await tao<{ id: string }>('/catalog/categories', { name: 'Áo kiểm thử', skuPattern: 'AOANH-{SEQ:4}' });
  ({ id: productId } = await tao<{ id: string }>('/catalog/products', {
    name: 'Áo kiểm thử có ảnh',
    categoryId: category.id,
    variants: [{ attributeValueIds: [] }],
  }));
});

test.afterAll(async () => {
  await cty?.dispose();
});

test('thêm ảnh PNG lớn và ảnh JPG: nén ≤ 1 MB, tải lên kho, lưu xong có ảnh đại diện', async () => {
  await page.goto(`/c/${cty.companyId}/catalog/products/${productId}`);
  await expect(page.getByTestId('image-input')).toBeAttached();
  const lon = await taoAnh(2600, 2000, 'image/png');
  const vua = await taoAnh(400, 400, 'image/jpeg');
  expect(lon.length).toBeGreaterThan(1024 * 1024);

  const ve: Response[] = [];
  const onRes = (r: Response) => {
    if (r.request().method() === 'POST' && isPath(r, '/files/uploads')) ve.push(r);
  };
  page.on('response', onRes);
  await page.getByTestId('image-input').setInputFiles([
    { name: 'lon.png', mimeType: 'image/png', buffer: lon },
    { name: 'vua.jpg', mimeType: 'image/jpeg', buffer: vua },
  ]);
  await expect(page.getByText(/Đang tải \d ảnh/)).toHaveCount(0, { timeout: 30_000 });
  page.off('response', onRes);

  const ko = ve.find((r) => r.status() === 503);
  if (ko) {
    boQua = `kho tệp chưa bật trên môi trường này: ${await ko.text()}`;
    test.skip(true, boQua);
  }
  // Vé nào hỏng thì in thân lỗi cho dễ đọc
  for (const r of ve) expect(r.status(), await r.text()).toBe(201);
  for (const r of ve) {
    const body = r.request().postDataJSON() as { contentType: string; sizeBytes: number };
    expect(['image/jpeg', 'image/png']).toContain(body.contentType);
    expect(body.sizeBytes).toBeLessThanOrEqual(1024 * 1024);
  }
  await expect(anh()).toHaveCount(2);
  const thuTu = await anh().evaluateAll((els) => els.map((e) => e.getAttribute('data-image-id')!));

  const put = await luu();
  test.skip(Boolean(boQua), boQua);
  expect(put.status(), await put.text()).toBe(200);

  const p = await chiTiet();
  expect([...p.images].sort((a, b) => a.position - b.position).map((i) => i.fileId)).toEqual(thuTu);
  expect(p.thumbnailUrl).toBeTruthy();
  // Ảnh tải về được từ kho thật
  const img = await cty.api.get(p.images[0]!.url);
  expect(img.status()).toBe(200);
  expect(img.headers()['content-type']).toMatch(/^image\/(jpeg|png)/);
});

test('đổi thứ tự: đưa ảnh 2 lên trước thì ảnh đó thành ảnh đại diện, tải lại trang vẫn giữ', async () => {
  test.skip(Boolean(boQua), boQua);
  const truoc = await chiTiet();
  const [dau, hai] = [...truoc.images].sort((a, b) => a.position - b.position);

  await page.getByRole('button', { name: 'Đưa ảnh 2 lên trước', exact: true }).click();
  await expect(anh().first()).toHaveAttribute('data-image-id', hai!.fileId);
  const put = await luu();
  expect(put.status(), await put.text()).toBe(200);

  const sau = await chiTiet();
  expect([...sau.images].sort((a, b) => a.position - b.position).map((i) => i.fileId)).toEqual([
    hai!.fileId,
    dau!.fileId,
  ]);

  await page.reload();
  await expect(anh().first()).toHaveAttribute('data-image-id', hai!.fileId);
  await expect(anh().first().getByText('Đại diện', { exact: true })).toBeVisible();
});

test('danh sách sản phẩm hiện ảnh đại diện', async () => {
  test.skip(Boolean(boQua), boQua);
  await page.goto(`/c/${cty.companyId}/catalog`);
  const dong = page.locator('tbody tr').filter({ hasText: 'Áo kiểm thử có ảnh' });
  const img = dong.locator('img').first();
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0)).toBe(true);
});
