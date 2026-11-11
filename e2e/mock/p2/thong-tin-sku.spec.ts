// P2 · Giá chuẩn, khối lượng, kích thước gói trên SKU (FE#154, Documents/19 D9, 21 §17.1–17.4, 25 §5.2, §5.4)
import { type Page } from '@playwright/test';
import { chua, dangNhap, dong, duongDan, expect, menu, mockApi, test, toast } from '../../fixtures';

const moSuaSku = async (page: Page, variantId: string) => {
  await dong(page, variantId).getByRole('button', { name: /^Sửa thông tin / }).click();
  return page.getByRole('dialog');
};
const o = (page: Page, nhan: string) => page.getByRole('dialog').getByRole('textbox', { name: nhan, exact: true });

test.describe('P2 · Thông tin SKU', () => {
  test.beforeEach(async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await menu(page, 'Sản phẩm');
  });

  test.describe('trên trang sản phẩm', () => {
    test.beforeEach(async ({ page }) => {
      await chua(page, 'Áo thun basic cổ tròn', 'tbody tr').click();
      await expect(dong(page, 'prd-001-v4')).toBeVisible();
    });

    test('hiện giá chuẩn, phần còn thiếu theo §5.2; nhập đủ thì Sẵn sàng', async ({ page }) => {
      await expect(dong(page, 'prd-001-v1').getByTestId('variant-readiness')).toHaveText('Sẵn sàng');
      await expect(dong(page, 'prd-001-v1').getByTestId('variant-spec')).toHaveText('180 g · 300×250×20 mm');
      const v4 = dong(page, 'prd-001-v4');
      await expect(v4.getByTestId('variant-price')).toContainText('150.000');
      await expect(v4.getByTestId('variant-readiness')).toContainText('Chờ hoàn thiện');
      await expect(v4.getByTestId('variant-readiness')).toContainText('Thiếu khối lượng, kích thước gói');

      await moSuaSku(page, 'prd-001-v4');
      await expect(o(page, 'Giá muốn bán (đ)')).toHaveValue('150000');
      await o(page, 'Giá muốn bán (đ)').fill('159.000');
      await o(page, 'Khối lượng (g)').fill('210');
      await o(page, 'Dài').fill('300');
      await o(page, 'Rộng').fill('250');
      await o(page, 'Cao').fill('20');
      await page.getByRole('dialog').getByRole('button', { name: 'Lưu', exact: true }).click();
      await toast(page, /^Đã lưu thông tin /);
      await expect(page.getByRole('dialog')).toHaveCount(0);

      await expect(v4.getByTestId('variant-price')).toContainText('159.000');
      await expect(v4.getByTestId('variant-spec')).toHaveText('210 g · 300×250×20 mm');
      await expect(v4.getByTestId('variant-readiness')).toHaveText('Sẵn sàng');
    });

    test('số sai báo tại ô, kích thước phải đủ ba cạnh', async ({ page }) => {
      const hop = await moSuaSku(page, 'prd-001-v4');
      await o(page, 'Khối lượng (g)').fill('90000');
      await hop.getByRole('button', { name: 'Lưu', exact: true }).click();
      await expect(hop).toContainText('Quá 50 kg');
      await o(page, 'Khối lượng (g)').fill('210');
      await o(page, 'Dài').fill('300');
      await hop.getByRole('button', { name: 'Lưu', exact: true }).click();
      await expect(hop).toContainText('Nhập đủ ba cạnh');
      await o(page, 'Giá muốn bán (đ)').fill('-5');
      await hop.getByRole('button', { name: 'Lưu', exact: true }).click();
      await expect(hop).toContainText('Giá không được âm');
      await expect(hop).toBeVisible();
    });

    test('SKU bị người khác sửa trước thì báo, chưa lưu gì', async ({ page }) => {
      const hop = await moSuaSku(page, 'prd-001-v4');
      await o(page, 'Khối lượng (g)').fill('210');
      await mockApi(page, 'patch', '/catalog/products/:id/variants/:variantId', 409, {
        status: 409,
        title: 'Xung đột phiên bản',
        code: 'version_conflict',
        current: null,
      });
      await hop.getByRole('button', { name: 'Lưu', exact: true }).click();
      await expect(hop.getByRole('status')).toContainText('vừa được người khác sửa');
      await hop.getByRole('button', { name: 'Huỷ', exact: true }).click();
      await expect(dong(page, 'prd-001-v4').getByTestId('variant-spec')).toHaveText('—');
    });
  });

  test('tạo sản phẩm chỉ chọn được tối đa 2 thuộc tính phân loại', async ({ page }) => {
    await page.getByRole('button', { name: 'Thêm sản phẩm', exact: true }).click();
    await expect.poll(() => duongDan(page)).toMatch(/\/catalog\/products\/new$/);
    const thuocTinh = page.getByRole('group', { name: 'Thuộc tính', exact: true });
    await thuocTinh.getByRole('button', { name: 'Màu sắc', exact: true }).click();
    await thuocTinh.getByRole('button', { name: 'Kích cỡ', exact: true }).click();
    await expect(thuocTinh.getByRole('button', { name: 'Chất liệu', exact: true })).toBeDisabled();
    await expect(page.getByTestId('axes-limit')).toContainText('Đã chọn đủ 2 thuộc tính phân loại');

    await thuocTinh.getByRole('button', { name: 'Kích cỡ', exact: true }).click();
    await expect(thuocTinh.getByRole('button', { name: 'Chất liệu', exact: true })).toBeEnabled();
    await expect(page.getByTestId('axes-limit')).toHaveCount(0);
  });

  test('không còn trang Bảng giá; Giá chờ xác nhận nằm dưới Kênh bán', async ({ page }) => {
    await expect(page.locator('[data-sidebar="menu-button"]', { hasText: /^\s*Bảng giá\s*$/ })).toHaveCount(0);
    await menu(page, 'Giá chờ xác nhận');
    await expect.poll(() => duongDan(page)).toMatch(/\/channel\/pending-prices$/);
  });
});
