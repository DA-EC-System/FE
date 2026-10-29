// P2 · Phân quyền theo vai trò (docs/21 mục 8): mỗi vai trò chỉ thấy, chỉ làm được phần của mình
import { type Page } from '@playwright/test';
import { chua, dangNhap, dong, expect, menu, test, thayChu } from '../../fixtures';

const KHONG_CO_QUYEN = 'Vai trò của bạn trong công ty này không có quyền mở trang này.';
const coMenu = (page: Page, label: string) =>
  expect(page.locator('[data-sidebar="menu-button"]', { hasText: new RegExp(`^\\s*${label}\\s*$`) }).first()).toBeAttached();
const khongCoMenu = async (page: Page, label: string) => {
  const items = page.locator('[data-sidebar="menu-button"]');
  await expect(items.first()).toBeAttached();
  for (const t of await items.allTextContents()) expect(t.trim()).not.toBe(label);
};

test.describe('P2 · Phân quyền', () => {
  test('Sale: xem sản phẩm và bảng giá, không sửa; không vào Kho', async ({ page }) => {
    await dangNhap(page, 'sale@commerio.vn', 'sale');
    await coMenu(page, 'Sản phẩm');
    await coMenu(page, 'Bảng giá');
    await khongCoMenu(page, 'Danh mục & thuộc tính');
    await khongCoMenu(page, 'Kho');

    await menu(page, 'Sản phẩm');
    await expect(chua(page, 'Áo polo nam', 'tbody tr')).toBeAttached();
    await expect(page.getByRole('button', { name: 'Thêm sản phẩm', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Xoá', exact: true })).toHaveCount(0);
    await chua(page, 'Áo polo nam', 'tbody tr').click();
    await expect(page.locator('input[name=name]')).toHaveAttribute('readonly');
    await expect(page.getByRole('button', { name: 'Lưu', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Thêm biến thể', exact: true })).toHaveCount(0);

    await menu(page, 'Bảng giá');
    await expect(page.getByRole('button', { name: 'Tạo bảng giá', exact: true })).toHaveCount(0);
    await dong(page, 'pl-std-001').click();
    await expect(page.locator('main')).toContainText('Bạn chỉ có quyền xem bảng giá.');
    await expect(page.locator('[data-price-input]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Lưu/ })).toHaveCount(0);

    await page.goto('/c/cmp-001/inventory');
    await thayChu(page, KHONG_CO_QUYEN);
    await page.goto('/c/cmp-001/catalog/setup');
    await expect(page.getByRole('button', { name: 'Thêm danh mục', exact: true })).toHaveCount(0);
  });

  test('Nhân viên kho: lập phiếu, không thấy giá vốn, không đặt ngưỡng, không xem bảng giá', async ({ page }) => {
    await dangNhap(page, 'kho@commerio.vn', 'kho');
    await khongCoMenu(page, 'Bảng giá');
    await menu(page, 'Kho');
    await expect(dong(page, 'prd-001-v1')).toBeAttached();
    await expect(page.locator('thead')).not.toContainText('Giá vốn BQ');
    await expect(page.locator('thead')).not.toContainText('Giá trị tồn');
    await expect(page.getByRole('button', { name: 'Đặt ngưỡng', exact: true })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Phiếu kho', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Kiểm kê', exact: true })).toBeAttached();
    await page.goto('/c/cmp-001/pricing');
    await thayChu(page, KHONG_CO_QUYEN);
  });

  test('Admin: đặt ngưỡng được, không thấy giá vốn, không lập phiếu', async ({ page }) => {
    await dangNhap(page, 'admin@commerio.vn', 'admin');
    await menu(page, 'Kho');
    await expect(dong(page, 'prd-001-v1')).toBeAttached();
    await expect(page.locator('thead')).not.toContainText('Giá vốn BQ');
    await expect(page.locator('main')).not.toContainText('Giá trị tồn');
    await expect(dong(page, 'prd-001-v1').getByRole('button', { name: 'Đặt ngưỡng', exact: true })).toBeAttached();
    await expect(page.getByRole('tab', { name: 'Nhập hoàn', exact: true })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Phiếu kho', exact: true }).click();
    await expect(page.getByRole('button', { name: /Kiểm kê|Xuất huỷ|Chuyển chờ xử lý/ })).toHaveCount(0);
    await chua(page, 'PN-000001', 'tbody tr').click();
    await expect(page.getByTestId('doc-lines')).toBeAttached();
    await expect(page.getByRole('button', { name: /Ghi sổ|Lưu nháp|Huỷ phiếu|Gửi duyệt/ })).toHaveCount(0);
    await page.goto('/c/cmp-001/inventory/documents/new?type=stocktake');
    await expect(page.locator('main')).toContainText('Bạn không có quyền lập phiếu kho.');
  });

  test('CEO: thấy giá vốn và đủ thao tác', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await coMenu(page, 'Danh mục & thuộc tính');
    await menu(page, 'Kho');
    await expect(page.locator('thead')).toContainText('Giá vốn BQ');
    await expect(page.locator('thead')).toContainText('Giá trị tồn');
    await page.getByRole('tab', { name: 'Phiếu kho', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Kiểm kê', exact: true })).toBeAttached();
    await expect(page.getByRole('button', { name: 'Xuất huỷ', exact: true })).toBeAttached();
  });
});
