// P2 · Ảnh sản phẩm (FE#205): JPG/PNG ≤ 1 MB, nén trước khi xin vé, chặn ảnh nhỏ hơn 330×330
import { type Page } from '@playwright/test';
import { dangNhap, expect, menu, test } from '../../fixtures';

/** Vẽ ảnh nhiễu trong trình duyệt (nén kém, ra tệp lớn) rồi trả về bytes */
async function taoAnh(page: Page, width: number, height: number, type: string): Promise<Buffer> {
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

interface VeAnh {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  purpose: string;
}

/** Ghi lại thân các lần xin vé ảnh */
function veAnh(page: Page) {
  const bodies: VeAnh[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/files/uploads')) bodies.push(r.postDataJSON() as VeAnh);
  });
  return bodies;
}

const anh = (page: Page) => page.getByTestId('product-images').locator('[data-image-id]');

test.describe('P2 · Ảnh sản phẩm', () => {
  test.beforeEach(async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await menu(page, 'Sản phẩm');
    await page.getByRole('button', { name: 'Thêm sản phẩm', exact: true }).click();
    await expect(page.getByTestId('image-input')).toBeAttached();
  });

  test('ảnh PNG lớn và ảnh WebP được nén thành JPEG ≤ 1 MB rồi mới xin vé', async ({ page }) => {
    const bodies = veAnh(page);
    const lon = await taoAnh(page, 2600, 2000, 'image/png');
    const webp = await taoAnh(page, 800, 800, 'image/webp');
    expect(lon.length).toBeGreaterThan(1024 * 1024);
    await page.getByTestId('image-input').setInputFiles([
      { name: 'lon.png', mimeType: 'image/png', buffer: lon },
      { name: 'anh.webp', mimeType: 'image/webp', buffer: webp },
    ]);
    await expect(anh(page)).toHaveCount(2);
    expect(bodies.map((b) => [b.fileName, b.contentType]).sort()).toEqual([
      ['anh.jpg', 'image/jpeg'],
      ['lon.jpg', 'image/jpeg'],
    ]);
    for (const b of bodies) expect(b.sizeBytes).toBeLessThanOrEqual(1024 * 1024);
  });

  test('ảnh JPG đã đạt thì gửi nguyên; ảnh nhỏ hơn 330×330 và tệp GIF bị chặn, báo theo từng tệp', async ({ page }) => {
    const bodies = veAnh(page);
    const vua = await taoAnh(page, 400, 400, 'image/jpeg');
    const nho = await taoAnh(page, 200, 300, 'image/png');
    await page.getByTestId('image-input').setInputFiles([
      { name: 'vua.jpg', mimeType: 'image/jpeg', buffer: vua },
      { name: 'nho.png', mimeType: 'image/png', buffer: nho },
      { name: 'dong.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') },
    ]);
    await expect(anh(page)).toHaveCount(1);
    expect(bodies).toEqual([
      { fileName: 'vua.jpg', contentType: 'image/jpeg', sizeBytes: vua.length, purpose: 'product_image' },
    ]);
    const canhBao = page.getByRole('status').filter({ hasText: 'nho.png' });
    await expect(canhBao).toContainText('nho.png: ảnh 200×300 nhỏ hơn 330×330, sàn không nhận');
    await expect(canhBao).toContainText('dong.gif: chỉ nhận ảnh JPG hoặc PNG');
  });
});
