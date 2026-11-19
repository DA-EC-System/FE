// P2 · Ảnh bảng kích cỡ (FE#261, commerio-backend#347): một ảnh cho cả sản phẩm; sàn bắt buộc thì đẩy báo size_chart_missing
import { type Page } from '@playwright/test';
import { dangNhap, dong, duongDan, expect, mockApi, test, toast } from '../../fixtures';

/** Vẽ ảnh PNG 400×400 trong trình duyệt rồi trả về bytes */
async function taoAnh(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 400;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 400, 400);
    ctx.strokeRect(20, 20, 360, 360);
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return btoa(String.fromCharCode(...bytes));
  });
  return Buffer.from(b64, 'base64');
}

/** Chuyển trang trong app, giữ dữ liệu giả trong bộ nhớ */
const diToi = (page: Page, path: string) =>
  page.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);

/** Thân các lần lưu sản phẩm */
function luuSanPham(page: Page) {
  const bodies: Record<string, unknown>[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PUT' && /\/catalog\/products\/[^/]+$/.test(r.url())) bodies.push(r.postDataJSON());
  });
  return bodies;
}

const bangKichCo = (page: Page) => page.getByTestId('size-chart').locator('[data-image-id]');
const SAN_PHAM = '/c/cmp-001/catalog/products/prd-002';

test.describe('P2 · Ảnh bảng kích cỡ', () => {
  test.beforeEach(async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
  });

  test('thêm, giữ nguyên khi sửa chỗ khác, gỡ ảnh: PUT gửi id, bỏ trống, rồi null', async ({ page }) => {
    const bodies = luuSanPham(page);
    await diToi(page, SAN_PHAM);
    await expect(page.getByTestId('size-chart-input')).toBeAttached();
    await expect(bangKichCo(page)).toHaveCount(0);

    await page.getByTestId('size-chart-input').setInputFiles({ name: 'bang-size.png', mimeType: 'image/png', buffer: await taoAnh(page) });
    await expect(bangKichCo(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await toast(page, 'Đã lưu Quần kaki ống suông');
    expect(typeof bodies[0]?.sizeChartFileId).toBe('string');

    await page.getByLabel('Mô tả').fill('Kaki co giãn');
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await toast(page, 'Đã lưu Quần kaki ống suông');
    expect(bodies[1]).not.toHaveProperty('sizeChartFileId');
    await expect(bangKichCo(page)).toHaveCount(1);

    await page.getByRole('button', { name: 'Bỏ ảnh bảng size', exact: true }).click();
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await toast(page, 'Đã lưu Quần kaki ống suông');
    expect(bodies[2]?.sizeChartFileId).toBeNull();
    await expect(bangKichCo(page)).toHaveCount(0);
  });

  test('BE báo errors.sizeChart thì hiện dưới ô ảnh bảng kích cỡ', async ({ page }) => {
    await diToi(page, SAN_PHAM);
    await expect(page.getByTestId('size-chart-input')).toBeAttached();
    await mockApi(page, 'put', '/catalog/products/:id', 422, {
      title: 'Dữ liệu chưa hợp lệ',
      errors: { sizeChart: 'Ảnh bảng kích cỡ lớn hơn 1 MB' },
    });
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(page.getByTestId('size-chart').locator('..')).toContainText('Ảnh bảng kích cỡ lớn hơn 1 MB');
  });

  test('đẩy bị size_chart_missing: hiện lý do và nút sang trang sửa sản phẩm', async ({ page }) => {
    await diToi(page, '/c/cmp-001/channel/shops/shp-001');
    await expect(dong(page, 'prd-002-v2')).toBeAttached();
    await mockApi(page, 'post', '/channel/shops/:id/listings/push', 200, {
      results: [{ variantId: 'prd-002-v2', listingId: null, status: null, code: 'size_chart_missing', message: null }],
    });
    await dong(page, 'prd-002-v2').getByRole('button', { name: 'Đẩy sản phẩm mới', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Đẩy lên sàn', exact: true }).click();
    await expect(dong(page, 'prd-002-v2').locator('[data-testid=push-error]')).toContainText(
      'Danh mục sàn bắt buộc ảnh bảng kích cỡ',
    );
    await dong(page, 'prd-002-v2').getByTestId('edit-product').click();
    await expect.poll(() => duongDan(page)).toBe(SAN_PHAM);
    await expect(page.getByTestId('size-chart-input')).toBeAttached();
  });
});
