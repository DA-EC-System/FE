// P2 · Mã sản phẩm, nhãn SKU từ BE, xoá hẳn, chặn xoá trường khi SKU đang trên sàn
// (FE#260; Documents/21 §17.1–17.4, commerio-backend#344, #345)
import { type Page } from '@playwright/test';
import { chon, chu, chua, dangNhap, dong, duongDan, expect, menu, test, toast } from '../../fixtures';

const dongSanPham = (page: Page, ten: string) => page.locator('tbody tr[data-row-id]').filter({ hasText: chu(ten) });
const o = (page: Page, nhan: string) => page.getByRole('dialog').getByRole('textbox', { name: nhan, exact: true });

test.describe('P2 · Nhãn sản phẩm (FE#260)', () => {
  test.beforeEach(async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await menu(page, 'Sản phẩm');
    await expect(page.locator('tbody tr[data-row-id]')).not.toHaveCount(0);
  });

  test('danh sách hiện mã sản phẩm và nhãn phụ Có lỗi', async ({ page }) => {
    const aoThun = dongSanPham(page, 'Áo thun basic cổ tròn');
    await expect(aoThun.getByTestId('product-code')).toHaveText(/^AO-\d{4}$/);
    // prd-001-v3 bị Lazada từ chối: SKU có lỗi, cha vẫn Đang bán
    await expect(aoThun.locator('[data-testid=product-status] [data-status=live]')).toHaveText(/^Đang bán \d+\/\d+$/);
    await expect(aoThun.locator('[data-flag=error]')).toHaveText('Có lỗi');
  });

  test('trang sản phẩm: mã ở đầu trang, SKU chỉ có listing lỗi mang nhãn Có lỗi, có cột Giá muốn bán', async ({ page }) => {
    await chua(page, 'Áo thun basic cổ tròn', 'tbody tr').click();
    await expect(page.getByTestId('product-code')).toHaveText(/^AO-\d{4}$/);
    await expect(dong(page, 'prd-001-v3').locator('[data-status=error]')).toHaveText('Có lỗi');
    await expect(dong(page, 'prd-001-v1').locator('[data-status=live]')).toBeVisible();
    await expect(dong(page, 'prd-001-v4').getByTestId('variant-target-price')).toContainText('150.000');
    // Có SKU Sẵn sàng thì không xoá hẳn được, chỉ lưu trữ
    await expect(page.getByRole('button', { name: 'Xoá hẳn', exact: true })).toHaveCount(0);
  });

  test('SKU đang trên sàn không để trống cân nặng được', async ({ page }) => {
    await chua(page, 'Áo thun basic cổ tròn', 'tbody tr').click();
    await dong(page, 'prd-001-v1').getByRole('button', { name: /^Sửa thông tin / }).click();
    const hop = page.getByRole('dialog');
    await expect(o(page, 'Cân nặng (g)')).toHaveValue('180');
    await o(page, 'Cân nặng (g)').fill('');
    await hop.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(hop.getByRole('status')).toContainText('SKU đang có trên sàn');
    await expect(hop).toBeVisible();
    await hop.getByRole('button', { name: 'Huỷ', exact: true }).click();
    await expect(dong(page, 'prd-001-v1').getByTestId('variant-spec')).toHaveText('180 g · 300×250×20 mm');
  });

  test('sản phẩm mới tạo, mọi SKU Chờ hoàn thiện thì xoá hẳn được', async ({ page }) => {
    await page.getByRole('button', { name: 'Thêm sản phẩm', exact: true }).click();
    await expect.poll(() => duongDan(page)).toMatch(/\/catalog\/products\/new$/);
    await chon(page, 'Nhóm hàng', 'Áo');
    const thuocTinh = page.getByRole('group', { name: 'Thuộc tính', exact: true });
    await thuocTinh.getByRole('button', { name: 'Màu sắc', exact: true }).click();
    await page.getByRole('group', { name: 'Màu sắc', exact: true }).getByRole('button', { name: 'Đen', exact: true }).click();
    await page.locator('input[name=name]').fill('Áo thử xoá hẳn');
    await page.getByRole('button', { name: 'Tạo sản phẩm', exact: true }).click();
    await toast(page, /^Đã tạo Áo thử xoá hẳn/);
    await expect.poll(() => duongDan(page)).toMatch(/\/catalog\/products\/prd-/);

    await page.getByRole('button', { name: 'Xoá hẳn', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Xoá hẳn', exact: true }).click();
    await toast(page, 'Đã xoá Áo thử xoá hẳn');
    await expect.poll(() => duongDan(page)).toMatch(/\/catalog$/);
    await expect(dongSanPham(page, 'Áo thử xoá hẳn')).toHaveCount(0);
  });
});
