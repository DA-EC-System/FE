// P2 · Category và attribute của sàn trên trang Danh mục & thuộc tính (commerio-backend#400, Documents/21 §18.5)
import { chua, dangNhap, expect, menu, test, toast } from '../../fixtures';

test.describe('P2 · Tab Lazada, TikTok của Danh mục & thuộc tính', () => {
  test.beforeEach(async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await menu(page, 'Category & thuộc tính');
  });

  test('Lazada: tìm không dấu, xem attribute và sản phẩm đang dùng, đồng bộ ngay hai lần', async ({ page }) => {
    await page.getByRole('tab', { name: 'Lazada', exact: true }).click();
    await expect(page).toHaveURL(/tab=lazada/);
    const tree = page.getByRole('tree', { name: 'Cây category Lazada' });
    await expect(chua(tree, 'Thiết bị thể thao & hoạt động ngoài trời')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Thêm danh mục', exact: true })).toHaveCount(0);

    await page.getByRole('searchbox', { name: 'Tìm category Lazada' }).fill('ao phong');
    await chua(tree, 'Áo phông & Áo ba lỗ', 'button').click();
    await expect(page.getByRole('heading', { name: 'Áo phông & Áo ba lỗ', exact: true })).toBeVisible();
    await expect(chua(page, 'Sales attribute (trục phân loại)')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Áo thun basic cổ tròn', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Đồng bộ ngay', exact: true }).click();
    await toast(page, 'Đã xếp lượt đồng bộ cây category Lazada');
    await page.getByRole('button', { name: 'Đồng bộ ngay', exact: true }).click();
    await toast(page, 'Đã có lượt đồng bộ Lazada đang chờ chạy');
  });

  test('duyệt cây theo cấp; bản cũ có nhãn; TikTok chưa có gian hàng active thì báo lỗi kết nối', async ({ page }) => {
    await page.goto('/c/cmp-001/catalog/setup?tab=lazada');
    await page.getByRole('searchbox', { name: 'Tìm category Lazada' }).fill('son thoi');
    await chua(page.getByRole('tree'), 'Son thỏi', 'button').click();
    await expect(page.getByText('Bản cũ', { exact: true })).toBeVisible();

    await page.getByRole('searchbox', { name: 'Tìm category Lazada' }).fill('');
    const root = chua(page.getByRole('tree'), 'Thiết bị thể thao & hoạt động ngoài trời', 'button');
    await root.click();
    await expect(chua(page.getByRole('tree'), 'Thiết bị thể thao & thể hình', 'button')).toBeVisible();

    await page.getByRole('tab', { name: 'TikTok', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Tìm category TikTok' }).fill('may khoan');
    await chua(page.getByRole('tree'), 'Máy khoan điện', 'button').click();
    await expect(chua(page, 'công ty chưa có gian hàng TikTok đang kết nối')).toBeVisible();
  });
});
