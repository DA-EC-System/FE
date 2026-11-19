// P3 · Nhãn listing: ẩn vì SKU tạm ngừng, sàn tắt ngoài app, giá trên sàn bị sửa (FE#264, commerio-backend#224, #360)
import { type Page } from '@playwright/test';
import { dangNhap, dong, expect, phatSuKienSan, test, toast } from '../../fixtures';

/** Chuyển trang trong app, giữ dữ liệu giả trong bộ nhớ */
const diToi = (page: Page, path: string) =>
  page.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);

const moGianHang = async (page: Page, shopId: string) => {
  await diToi(page, `/c/cmp-001/channel/shops/${shopId}`);
  await expect(page.locator('[data-testid=match-summary]')).toBeAttached();
};

const trangThai = (page: Page, variantId: string) => dong(page, variantId).getByTestId('listing-status');
const nut = (page: Page, variantId: string, name: string) => dong(page, variantId).getByRole('button', { name, exact: true });

test.describe('P3 · Nhãn listing khi sàn đổi ngoài app', () => {
  test('Lazada: sàn tắt SKU ngoài app, CEO bật lại', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await phatSuKienSan(page, 'listing.outside_disabled', 'shp-003');
    await moGianHang(page, 'shp-003');

    await expect(trangThai(page, 'prd-002-v1')).toHaveText('Tạm ẩn');
    const nhan = dong(page, 'prd-002-v1').getByTestId('outside-change');
    await expect(nhan).toHaveText('Sàn tắt ngoài app (chờ CEO quyết)');
    await nhan.hover();
    await expect(page.getByTestId('outside-change-hint')).toContainText('Seller Center');
    // Sàn tắt thì không có giá để nhận
    await expect(nut(page, 'prd-002-v1', 'Nhận giá trên sàn')).toHaveCount(0);

    await nut(page, 'prd-002-v1', 'Bật lại, đẩy giá Commerio').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Bật lại', exact: true }).click();
    await toast(page, 'Đã đẩy lại giá Commerio');
    await expect(trangThai(page, 'prd-002-v1')).toHaveText('Đang hoạt động');
    await expect(nhan).toHaveCount(0);
  });

  test('Shopee: giá trên sàn bị sửa, ẩn bằng tồn 0; CEO nhận giá sàn', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await phatSuKienSan(page, 'listing.outside_price', 'shp-001');
    await moGianHang(page, 'shp-001');

    const nhan = dong(page, 'prd-001-v1').getByTestId('outside-change');
    await expect(nhan).toContainText('Giá trên sàn bị sửa: 149');
    await expect(nhan).toContainText('(chờ CEO quyết)');
    await expect(dong(page, 'prd-001-v1').getByTestId('hidden-zero')).toHaveText('Đang ẩn bằng tồn 0');
    await expect(dong(page, 'prd-001-v1').getByTestId('hidden-paused')).toHaveCount(0);

    await nut(page, 'prd-001-v1', 'Nhận giá trên sàn').click();
    const hop = page.getByRole('alertdialog');
    await expect(hop).toContainText('149');
    await hop.getByRole('button', { name: 'Nhận giá trên sàn', exact: true }).click();
    await toast(page, 'Đã nhận giá trên sàn');
    await expect(trangThai(page, 'prd-001-v1')).toHaveText('Đang hoạt động');
    await expect(nhan).toHaveCount(0);
  });

  test('Admin thấy nhãn nhưng không có nút quyết (chỉ CEO)', async ({ page }) => {
    await dangNhap(page, 'admin@commerio.vn', 'admin');
    await phatSuKienSan(page, 'listing.outside_price', 'shp-001');
    await moGianHang(page, 'shp-001');
    await expect(dong(page, 'prd-001-v1').getByTestId('outside-change')).toContainText('Giá trên sàn bị sửa');
    await expect(nut(page, 'prd-001-v1', 'Gỡ khỏi sàn')).toBeAttached();
    await expect(nut(page, 'prd-001-v1', 'Bật lại, đẩy giá Commerio')).toHaveCount(0);
    await expect(nut(page, 'prd-001-v1', 'Nhận giá trên sàn')).toHaveCount(0);
  });

  test('tạm ngừng SKU trên Lazada: "Đang ẩn" kèm "Vì SKU tạm ngừng", không có nút ẩn hoặc hiện tay', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await diToi(page, '/c/cmp-001/catalog/products/prd-002');
    const bienThe = page.locator('[data-testid=variants] tr[data-row-id=prd-002-v1]');
    await bienThe.getByRole('button', { name: /^Đổi trạng thái/ }).click();
    await page.getByRole('menuitem', { name: 'Tạm ngừng', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Tạm ngừng', exact: true }).click();
    await expect(bienThe.getByTestId('variant-status')).toContainText('Tạm ngừng');

    await moGianHang(page, 'shp-003');
    await expect(trangThai(page, 'prd-002-v1')).toHaveText('Tạm ẩn');
    const nhan = dong(page, 'prd-002-v1').getByTestId('hidden-paused');
    await expect(nhan).toHaveText('Vì SKU tạm ngừng');
    await nhan.hover();
    await expect(page.getByTestId('hidden-paused-hint')).toContainText('Bỏ tạm ngừng ở trang sản phẩm');
    await expect(dong(page, 'prd-002-v1').getByTestId('outside-change')).toHaveCount(0);
    await expect(nut(page, 'prd-002-v1', 'Bật lại, đẩy giá Commerio')).toHaveCount(0);
  });
});
