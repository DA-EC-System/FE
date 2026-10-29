// P2 · Sản phẩm, danh mục, thuộc tính (UC-CP-01, 02; FE#5, commerio-backend#12, #14)
import { type Locator, type Page } from '@playwright/test';
import { chon, chu, chua, dangNhap, duongDan, expect, menu, mockApi, test, thayChu, toast } from '../../fixtures';

const tenCot = (page: Page) => page.locator('tbody tr[data-row-id]');
const coDong = (page: Page, text: string) => expect(tenCot(page).filter({ hasText: chu(text) })).not.toHaveCount(0);
const khongCoDong = (page: Page, text: string) => expect(tenCot(page).filter({ hasText: chu(text) })).toHaveCount(0);
const loiTen = (scope: Page | Locator) => scope.locator('[data-slot="form-item"]:has([name=name]) [data-slot="form-message"]');
/** Mở menu trạng thái của sản phẩm trên danh sách rồi xác nhận */
const doiTrangThai = async (page: Page, ten: string, thaoTac: string) => {
  await page.getByRole('button', { name: `Đổi trạng thái ${ten}`, exact: true }).click();
  await page.getByRole('menuitem', { name: thaoTac, exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: thaoTac, exact: true }).click();
};

test.describe('P2 · Sản phẩm', () => {
  test.beforeEach(async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await menu(page, 'Sản phẩm');
    await expect(page.locator('tbody tr[data-row-id]')).not.toHaveCount(0);
  });

  test('danh sách chỉ có sản phẩm đang bán, tìm được theo tên và SKU', async ({ page }) => {
    await coDong(page, 'Áo polo nam');
    await khongCoDong(page, 'Áo sơ mi caro');
    await page.getByRole('searchbox').fill('polo');
    await expect(tenCot(page)).toHaveCount(1);
    await expect(tenCot(page).first()).toContainText('Áo polo nam');
    await page.getByRole('searchbox').fill('0012');
    await expect(tenCot(page)).toHaveCount(1);
    await expect(tenCot(page).first()).toContainText('Áo khoác gió');
    await page.getByRole('searchbox').fill('không có sản phẩm này');
    await expect(page.locator('tbody')).toContainText('Không tìm thấy sản phẩm phù hợp');
  });

  test('tạo sản phẩm có biến thể, SKU cấp theo quy tắc danh mục', async ({ page }) => {
    await page.getByRole('button', { name: 'Thêm sản phẩm', exact: true }).click();
    await expect.poll(() => duongDan(page)).toMatch(/\/catalog\/products\/new$/);

    // Bỏ trống thì báo tại ô
    await page.getByRole('button', { name: 'Tạo sản phẩm', exact: true }).click();
    await expect(loiTen(page)).not.toBeEmpty();

    await chon(page, 'Danh mục', 'Áo');
    const thuocTinh = page.getByRole('group', { name: 'Thuộc tính', exact: true });
    await thuocTinh.getByRole('button', { name: 'Màu sắc', exact: true }).click();
    await thuocTinh.getByRole('button', { name: 'Kích cỡ', exact: true }).click();
    const mau = page.getByRole('group', { name: 'Màu sắc', exact: true });
    await mau.getByRole('button', { name: 'Đen', exact: true }).click();
    await mau.getByRole('button', { name: 'Trắng', exact: true }).click();
    const co = page.getByRole('group', { name: 'Kích cỡ', exact: true });
    await co.getByRole('button', { name: 'S', exact: true }).click();
    await co.getByRole('button', { name: 'M', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Tạo biến thể Đen / M', exact: true }).click();
    await expect(page.locator('[data-testid=variant-plan] tbody tr')).toHaveCount(4);

    // Tên trùng (409 name_taken) báo dưới ô Tên
    await page.locator('input[name=name]').fill('áo polo nam');
    await page.getByRole('button', { name: 'Tạo sản phẩm', exact: true }).click();
    await expect(loiTen(page)).toHaveText('Đã có sản phẩm cùng tên');

    await page.locator('input[name=name]').fill('Áo sơ mi Oxford');
    await page.getByRole('button', { name: 'Tạo sản phẩm', exact: true }).click();
    await toast(page, 'Đã tạo Áo sơ mi Oxford với 3 biến thể');
    await expect.poll(() => duongDan(page)).toMatch(/\/catalog\/products\/prd-/);
    await expect(page.locator('[data-testid=variants] tbody tr td:first-child')).toHaveText(
      ['AO-0013-DEN-S', 'AO-0014-TRANG-S', 'AO-0015-TRANG-M'],
      { useInnerText: true },
    );
    // Đã tạo thì không đổi được danh mục (SKU đã cấp theo danh mục)
    await expect(page.getByRole('combobox', { name: 'Danh mục', exact: true })).toBeDisabled();
  });

  test('sửa sản phẩm bị người khác sửa trước thì nạp bản mới nhất', async ({ page }) => {
    await chua(page, 'Áo polo nam', 'tbody tr').click();
    await expect(page.locator('[data-testid=variants] tbody tr')).not.toHaveCount(0);
    await page.locator('input[name=name]').fill('Áo polo nam – sửa dở');
    await mockApi(page, 'put', '/catalog/products/:id', 409, {
      status: 409,
      title: 'Xung đột phiên bản',
      code: 'version_conflict',
      current: null,
    });
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await thayChu(page, 'vừa được người khác sửa', '[role=status]');
  });

  test('ngừng nhập rồi lưu trữ cả sản phẩm, lưu trữ thì chỉ còn xem (B1)', async ({ page }) => {
    await doiTrangThai(page, 'Áo khoác gió', 'Ngừng nhập');
    await toast(page, 'Ngừng nhập: 4 SKU của Áo khoác gió');
    await expect(chua(page, 'Áo khoác gió', 'tbody tr').getByTestId('product-status')).toContainText('Ngừng nhập');

    await doiTrangThai(page, 'Áo khoác gió', 'Lưu trữ');
    await toast(page, 'Lưu trữ: 4 SKU của Áo khoác gió');
    await khongCoDong(page, 'Áo khoác gió');
    await chon(page, 'Trạng thái', 'Đã lưu trữ');
    await chua(page, 'Áo khoác gió', 'tbody tr').click();
    await thayChu(page, 'chỉ xem được', '[role=status]');
    await expect(page.getByRole('button', { name: 'Lưu', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Thêm biến thể', exact: true })).toHaveCount(0);
  });

  test('SKU còn tồn và chứng từ mở thì Lưu trữ bị khoá, báo lý do (B1)', async ({ page }) => {
    await chua(page, 'Quần kaki ống suông', 'tbody tr').click();
    const dong = page.locator('[data-testid=variants] tr[data-row-id=prd-002-v1]');
    await dong.getByRole('button', { name: /^Đổi trạng thái/ }).click();
    await page.getByRole('menuitem', { name: 'Ngừng nhập', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Ngừng nhập', exact: true }).click();
    await expect(dong.getByTestId('variant-status')).toContainText('Ngừng nhập');

    await dong.getByRole('button', { name: /^Đổi trạng thái/ }).click();
    const luuTru = page.getByRole('menuitem', { name: /^Lưu trữ/ });
    await expect(luuTru).toHaveAttribute('aria-disabled', 'true');
    await expect(luuTru.getByTestId('archive-blockers')).toContainText('tồn thực');
    await expect(luuTru.getByTestId('archive-blockers')).toContainText('Còn chứng từ mở');
  });

  test('tạm ngừng một SKU rồi bỏ tạm ngừng (B1)', async ({ page }) => {
    await chua(page, 'Áo thun basic cổ tròn', 'tbody tr').click();
    const dong = page.locator('[data-testid=variants] tr[data-row-id=prd-001-v1]');
    const alert = page.getByRole('alertdialog');
    await expect(dong.getByTestId('variant-status')).toContainText('Đang bán');
    await dong.getByRole('button', { name: /^Đổi trạng thái/ }).click();
    await page.getByRole('menuitem', { name: 'Tạm ngừng', exact: true }).click();
    await expect(alert).toContainText('Listing trên các sàn bị ẩn');
    await alert.getByRole('button', { name: 'Tạm ngừng', exact: true }).click();
    await expect(dong.getByTestId('variant-status')).toContainText('Tạm ngừng');
    await dong.getByRole('button', { name: /^Đổi trạng thái/ }).click();
    await expect(page.getByRole('menuitem', { name: 'Lưu trữ', exact: true })).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'Bỏ tạm ngừng', exact: true }).click();
    await alert.getByRole('button', { name: 'Bỏ tạm ngừng', exact: true }).click();
    await expect(dong.getByTestId('variant-status')).toContainText('Đang bán');
  });

  test('danh mục: quy tắc SKU sai báo ngay, tên trùng báo tại ô', async ({ page }) => {
    await page.getByRole('button', { name: 'Danh mục & thuộc tính', exact: true }).click();
    await page.getByRole('button', { name: 'Thêm danh mục', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[name=skuPattern]').fill('AO-{VAL}');
    await expect(dialog.getByTestId('sku-preview')).toContainText('Quy tắc phải có đúng một {SEQ} để SKU không trùng');
    await dialog.locator('input[name=skuPattern]').fill('TX-{SEQ:4}-{VAL}');
    await expect(dialog.getByTestId('sku-preview')).toContainText('TX-0001-DEN-XL');
    await dialog.locator('input[name=name]').fill('áo');
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(loiTen(dialog)).toHaveText('Đã có danh mục cùng tên');
    await dialog.locator('input[name=name]').fill('Túi xách');
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
    await toast(page, 'Đã tạo danh mục Túi xách');
    await expect(chua(page, 'Túi xách', 'tbody tr')).toContainText('TX-{SEQ:4}-{VAL}');
  });
});
