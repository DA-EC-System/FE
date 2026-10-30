// P2 · Cách ly dữ liệu: công ty này không thấy dữ liệu công ty khác (docs/21 C4: trả 404 như không có)
// Bản ghi mẫu của Mỹ phẩm XYZ (cmp-002): sản phẩm prd-101 "Gạo ST25", bảng giá pl-std-002, phiếu sd-101
import { dangNhap, dong, duongDan, expect, menu, test, thayChu } from '../../fixtures';

test.describe('P2 · Cách ly dữ liệu giữa các công ty', () => {
  test.beforeEach(({ page }) => dangNhap(page, 'ceo@commerio.vn', 'ceo'));

  test('danh sách sản phẩm, tồn kho không lẫn dữ liệu công ty khác', async ({ page }) => {
    await menu(page, 'Sản phẩm');
    await expect(page.locator('tbody tr[data-row-id]')).not.toHaveCount(0);
    await expect(page.locator('tbody')).not.toContainText('Gạo ST25');
    await page.getByRole('searchbox').fill('Gạo');
    await expect(page.locator('tbody')).toContainText('Không tìm thấy sản phẩm phù hợp');

    await menu(page, 'Kho');
    await expect(dong(page, 'prd-001-v1')).toBeAttached();
    await expect(dong(page, 'prd-101-v1')).toHaveCount(0);
  });

  test('mở thẳng bản ghi của công ty khác thì báo không tìm thấy', async ({ page }) => {
    await page.goto('/c/cmp-001/catalog/products/prd-101');
    await expect(page.getByRole('heading', { level: 1, name: 'Không tìm thấy', exact: true })).toBeAttached();
    await expect(page.locator('main')).not.toContainText('Gạo ST25');

    await page.goto('/c/cmp-001/pricing/pl-std-002');
    await thayChu(page, 'Không tìm thấy');
    await expect(page.locator('[data-price-input]')).toHaveCount(0);

    await page.goto('/c/cmp-001/inventory/documents/sd-101');
    await thayChu(page, 'Không tìm thấy');
    await expect(page.getByTestId('doc-lines')).toHaveCount(0);
  });

  test('mở khu làm việc của công ty mình không thuộc thì không vào được', async ({ page }) => {
    await page.goto('/c/cmp-002/catalog');
    await expect.poll(() => duongDan(page)).not.toMatch(/^\/c\/cmp-002\/catalog/);
    await expect(page.locator('body')).not.toContainText('Gạo ST25');
  });
});
