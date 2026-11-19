// P3 · Trang 4 bước đẩy sản phẩm lên sàn, thông tin sàn của sản phẩm (commerio-backend#400, Documents/21 §18.5)
import { chon, chua, dangNhap, dong, expect, test, toast } from '../../fixtures';

test.describe('P3 · Đẩy lên sàn theo thông tin sàn của sản phẩm', () => {
  test.beforeEach(async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
  });

  test('Đẩy sản phẩm mới thiếu thông tin sàn: mở trang 4 bước, category khoá, điền attribute rồi đẩy', async ({ page }) => {
    await page.goto('/c/cmp-001/channel/shops/shp-003');
    await dong(page, 'prd-001-v1').getByRole('button', { name: 'Đẩy sản phẩm mới' }).click();
    await expect(page).toHaveURL(/\/channel\/products\/prd-001\/push\/lazada\?shop=shp-003$/);

    // Spec ghép SKU đã có category: mở thẳng bước Attributes, chỉ thiếu Chất liệu
    await expect(page.getByRole('button', { name: '2. Attributes' })).toHaveAttribute('aria-current', 'step');
    await expect(chua(page, 'Còn thiếu 1 attribute bắt buộc')).toBeVisible();
    await page.getByRole('button', { name: '1. Category' }).click();
    await expect(chua(page, 'không đổi ở đây')).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Tìm category Lazada' })).toHaveCount(0);

    // Bấm dòng thiếu để tới ô, chọn giá trị trong danh sách của sàn
    await page.getByRole('button', { name: '2. Attributes' }).click();
    await page.getByRole('button', { name: 'Chất liệu trang phục', exact: true }).click();
    await expect(page.getByRole('combobox', { name: /Chất liệu trang phục/ })).toBeFocused();
    await page.getByRole('combobox', { name: /Chất liệu trang phục/ }).click();
    await page.getByRole('option', { name: 'Nhung', exact: true }).click();
    await expect(chua(page, 'Đủ attribute bắt buộc')).toBeVisible();

    // Variants đã gợi ý sẵn theo tên trục
    await page.getByRole('button', { name: '3. Variants' }).click();
    await expect(chua(page, 'Thuộc tính phân loại “Màu sắc”')).toBeVisible();

    await page.getByRole('button', { name: '4. Xem lại & đẩy' }).click();
    await expect(chua(page, 'Sẵn sàng.')).toBeVisible();
    await page.getByRole('button', { name: 'Lưu và đẩy lên Lazada' }).click();
    await toast(page, /Đã xếp \d+ SKU chờ đẩy lên Lazada/);
    const ketQua = page.getByRole('region', { name: 'Kết quả đẩy' });
    await expect(chua(ketQua, 'ABC Fashion LazMall')).toBeVisible();
    await expect(chua(ketQua, /Đã xếp \d+ SKU chờ đẩy/)).toBeVisible();
  });

  test('chọn gợi ý, tìm leaf; 422 của BE đưa về đúng bước, đúng ô', async ({ page }) => {
    // Thắt lưng chưa có thông tin Lazada: mở ở bước Category
    await page.goto('/c/cmp-001/channel/products/prd-003/push/lazada?shop=shp-003');
    // Lazada gợi ý tối đa 5, dòng đầu chọn sẵn
    const goiY = page.getByRole('radiogroup', { name: 'Gợi ý của Lazada' });
    await expect(goiY.getByRole('radio').first()).toHaveAttribute('aria-checked', 'true');
    expect(await goiY.getByRole('radio').count()).toBeLessThanOrEqual(5);

    await page.getByRole('searchbox', { name: 'Tìm category Lazada' }).fill('ao phong nam');
    await chua(page.getByRole('tree'), 'Áo phông & Áo ba lỗ', 'button').click();
    await expect(chua(page, 'Đang chọn')).toContainText('Quần áo nam > Áo');
    await page.getByRole('button', { name: 'Tiếp', exact: true }).click();
    await expect(chua(page, 'Còn thiếu 3 attribute bắt buộc')).toBeVisible();

    await page.getByRole('button', { name: '4. Xem lại & đẩy' }).click();
    await page.getByRole('button', { name: 'Lưu và đẩy lên Lazada' }).click();
    await toast(page, 'Còn ô chưa hợp lệ');
    await expect(page.getByRole('button', { name: '2. Attributes' })).toHaveAttribute('aria-current', 'step');
    await expect(page.getByRole('combobox', { name: /Chất liệu trang phục/ })).toBeFocused();
    await expect(page.getByText('Sàn bắt buộc attribute này')).toHaveCount(3);

    await chon(page, 'Loại dáng ôm Bắt buộc', 'Thường xuyên');
    await expect(page.getByText('Sàn bắt buộc attribute này')).toHaveCount(2);
  });

  test('dòng đã ghép SKU thiếu thông tin sàn: Bổ sung thông tin sàn mở trang chỉ Lưu', async ({ page }) => {
    await page.goto('/c/cmp-001/channel/shops/shp-003');
    await dong(page, 'prd-001-v3').getByTestId('fill-spec').click();
    await expect(page).toHaveURL(/push\/lazada\?shop=shp-003&mode=fill$/);
    await expect(page.getByRole('heading', { name: /^Thông tin sàn: / })).toBeVisible();
    await page.getByRole('button', { name: '4. Xem lại & lưu' }).click();
    await expect(page.getByRole('button', { name: 'Lưu', exact: true })).toBeVisible();
    await expect(chua(page, 'Đẩy lên gian hàng')).toHaveCount(0);
  });
});
