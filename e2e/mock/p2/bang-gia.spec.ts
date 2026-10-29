// P2 · Bảng giá (UC-CP-03; FE#6, commerio-backend#14)
import { type Page } from '@playwright/test';
import { chon, dangNhap, dong, duongDan, expect, menu, mockApi, test, thayChu, toast } from '../../fixtures';

const oGia = (page: Page, variantId: string) => page.locator(`[data-price-input="${variantId}"]`);

test.describe('P2 · Bảng giá', () => {
  test.beforeEach(async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await menu(page, 'Bảng giá');
    await expect(dong(page, 'pl-std-001')).toBeAttached();
  });

  test('bảng chuẩn đứng đầu, đổi tên được nhưng không xoá được', async ({ page }) => {
    await expect(page.locator('tbody tr[data-row-id]').first()).toHaveAttribute('data-row-id', 'pl-std-001');
    const chuan = dong(page, 'pl-std-001');
    await expect(chuan.getByRole('button', { name: 'Đổi tên', exact: true })).toBeAttached();
    await expect(chuan.getByRole('button', { name: 'Xoá', exact: true })).toHaveCount(0);
    await expect(dong(page, 'pl-shp-001').getByRole('button', { name: 'Xoá', exact: true })).toBeAttached();
  });

  test('tạo bảng giá theo gian hàng: chỉ chọn gian hàng còn kết nối, chép giá chuẩn', async ({ page }) => {
    await page.getByRole('button', { name: 'Tạo bảng giá', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Tạo', exact: true }).click();
    await thayChu(dialog, 'Chọn gian hàng');
    await thayChu(dialog, 'Nhập tên bảng giá');
    await dialog.getByRole('combobox', { name: 'Gian hàng', exact: true }).click();
    // Gian hàng đã có bảng giá hoặc đã ngắt thì không chọn được
    await expect(page.getByRole('option')).toHaveCount(2);
    await page.getByRole('option', { name: /LazMall/ }).click();
    // Chọn gian hàng thì điền sẵn tên theo gian hàng
    await expect(dialog.locator('input[name=name]')).toHaveValue('Giá ABC Fashion LazMall');
    await dialog.locator('input[name=name]').fill('giá shopee');
    await dialog.getByRole('button', { name: 'Tạo', exact: true }).click();
    await thayChu(dialog, 'Đã có bảng giá cùng tên');
    await dialog.locator('input[name=name]').fill('Giá LazMall');
    await dialog.getByRole('button', { name: 'Tạo', exact: true }).click();
    await toast(page, 'Đã tạo Giá LazMall');
    await expect.poll(() => duongDan(page)).toMatch(/\/pricing\/pl-/);
    await expect(page.locator('thead')).toContainText('Giá chuẩn');
    await expect(page.locator('thead')).toContainText('Giá gian hàng');
    await expect(oGia(page, 'prd-001-v1')).toHaveValue('150.000');
    await expect(oGia(page, 'prd-003-v1')).toHaveAttribute('placeholder', 'theo giá chuẩn');
  });

  test.describe('lưới giá chuẩn', () => {
    test.beforeEach(async ({ page }) => {
      await dong(page, 'pl-std-001').click();
      await expect.poll(() => duongDan(page)).toMatch(/\/pricing\/pl-std-001$/);
      await expect(oGia(page, 'prd-001-v1')).toBeAttached();
    });

    test('ô giá kiểm ngay khi gõ', async ({ page }) => {
      const cases: [string, string][] = [
        ['-5000', 'Giá không được âm'],
        ['150000.5', 'Giá phải là số nguyên đồng, vd 150000'],
        ['abc', 'Giá phải là số nguyên đồng, vd 150000'],
        ['10000000001', 'Giá tối đa 10 tỷ đồng'],
      ];
      for (const [text, msg] of cases) {
        await oGia(page, 'prd-001-v3').fill(text);
        await expect(dong(page, 'prd-001-v3').getByTestId('price-error')).toHaveText(msg);
      }
      await oGia(page, 'prd-001-v3').fill('150.000');
      await expect(dong(page, 'prd-001-v3').getByTestId('price-error')).toHaveCount(0);
    });

    test('sửa vài ô rồi lưu một lần; sửa hàng loạt theo %', async ({ page }) => {
      await oGia(page, 'prd-001-v1').fill('155000');
      await oGia(page, 'prd-001-v2').fill('160.000');
      await expect(page.locator('[data-dirty]')).toHaveCount(2);
      await page.getByRole('button', { name: /^Lưu 2 thay đổi/ }).click();
      await toast(page, 'Đã lưu 2 giá của Bảng giá chuẩn');
      await expect(page.locator('[data-dirty]')).toHaveCount(0);

      await dong(page, 'prd-002-v1').getByRole('checkbox').click();
      await dong(page, 'prd-002-v2').getByRole('checkbox').click();
      await page.getByRole('button', { name: 'Sửa giá hàng loạt', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('heading', { name: 'Sửa giá 2 biến thể', exact: true })).toBeAttached();
      await chon(dialog, 'Cách sửa', 'Tăng / giảm theo %');
      await dialog.locator('#bulk-value').fill('10');
      await dialog.getByRole('button', { name: 'Áp dụng', exact: true }).click();
      await expect(oGia(page, 'prd-002-v1')).toHaveValue('352.000');
      await expect(page.locator('[data-dirty]')).toHaveCount(2);
      await toast(page, 'Bấm Lưu để ghi lại');
    });

    test('BE báo lỗi theo dòng thì lọc dòng đã sửa và ghi lý do', async ({ page }) => {
      await oGia(page, 'prd-002-v1').fill('300000');
      await mockApi(page, 'put', '/pricing/pricelists/:id/items', 422, {
        status: 422,
        title: 'Dữ liệu chưa hợp lệ',
        code: 'validation_failed',
        errors: { 'items.prd-002-v1': 'Biến thể đã ngừng bán' },
      });
      await page.getByRole('button', { name: /^Lưu 1 thay đổi/ }).click();
      await toast(page, '1 giá chưa hợp lệ, xem cột Ghi chú');
      await expect(page.locator('#only-changed')).toHaveAttribute('aria-checked', 'true');
      await expect(dong(page, 'prd-002-v1').getByTestId('row-error')).toHaveText('Biến thể đã ngừng bán');
    });

    test('xung đột phiên bản khi lưu thì nạp giá mới nhất, giữ ô đang sửa', async ({ page }) => {
      await oGia(page, 'prd-001-v1').fill('155000');
      await mockApi(page, 'put', '/pricing/pricelists/:id/items', 409, {
        status: 409,
        title: 'Dữ liệu đã thay đổi',
        code: 'version_conflict',
      });
      await page.getByRole('button', { name: /^Lưu 1 thay đổi/ }).click();
      await toast(page, 'Đã nạp giá mới nhất');
      await expect(page.locator('[data-dirty]')).toHaveCount(1);
    });

    test('còn thay đổi chưa lưu thì hỏi trước khi rời trang', async ({ page }) => {
      await oGia(page, 'prd-001-v1').fill('199000');
      await menu(page, 'Kho');
      const alert = page.getByRole('alertdialog');
      await expect(alert.getByRole('heading', { name: 'Rời trang khi chưa lưu?', exact: true })).toBeAttached();
      await alert.getByRole('button', { name: 'Ở lại', exact: true }).click();
      await expect.poll(() => duongDan(page)).toMatch(/\/pricing\/pl-std-001$/);
      // Rời ô thì định dạng lại theo hàng nghìn
      await expect(oGia(page, 'prd-001-v1')).toHaveValue('199.000');
    });
  });

  test('xoá: gian hàng còn kết nối thì không xoá được; đã ngắt thì xoá được', async ({ page }) => {
    const alert = page.getByRole('alertdialog');
    await dong(page, 'pl-shp-001').getByRole('button', { name: 'Xoá', exact: true }).click();
    await alert.getByRole('button', { name: 'Xoá', exact: true }).click();
    await toast(page, /đang|kết nối|sử dụng/i);
    await expect(dong(page, 'pl-shp-001')).toBeAttached();

    await dong(page, 'pl-shp-008').getByRole('button', { name: 'Xoá', exact: true }).click();
    await expect(alert).toContainText('Giá Outlet cũ');
    await alert.getByRole('button', { name: 'Xoá', exact: true }).click();
    await toast(page, 'Đã xoá Giá Outlet cũ');
    await expect(dong(page, 'pl-shp-008')).toHaveCount(0);
  });
});

test.describe('P2 · Bảng giá khi chưa bật Kênh bán', () => {
  test('chỉ có bảng giá chuẩn, không tạo được bảng giá gian hàng', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo', 'Minh Phát');
    await menu(page, 'Bảng giá');
    await expect(page.locator('main')).toContainText('Công ty chưa bật phân hệ Kênh bán nên chỉ có bảng giá chuẩn.');
    await expect(page.getByRole('button', { name: 'Tạo bảng giá', exact: true })).toHaveCount(0);
  });
});
