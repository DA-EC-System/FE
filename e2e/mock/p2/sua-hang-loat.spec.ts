// P2 · Sửa hàng loạt SKU ở /catalog (FE#155, US-SP-04; hợp đồng đề xuất cho commerio-backend#242)
import { type Page } from '@playwright/test';
import { dangNhap, dong, duongDan, expect, menu, test, toast } from '../../fixtures';

const o = (page: Page, variantId: string, cot: RegExp) => dong(page, variantId).getByRole('textbox', { name: cot });
const goiY = (page: Page, variantId: string, cot: string) =>
  dong(page, variantId).getByRole('button', { name: new RegExp(`^Nhận gợi ý ${cot}`) });
const luu = (page: Page) => page.getByRole('button', { name: /^Lưu \d+ SKU$/ });

test.describe('P2 · Sửa hàng loạt SKU', () => {
  test.beforeEach(async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await menu(page, 'Sản phẩm');
    await page.getByRole('button', { name: 'Sửa hàng loạt', exact: true }).click();
    await expect.poll(() => new URL(page.url()).search).toBe('?mode=bulk');
    await expect(dong(page, 'prd-003-v1')).toBeVisible();
  });

  test('hiện nguồn từ đề nghị nhập và gợi ý giá, khối lượng kèm cách tính', async ({ page }) => {
    // AC1: SKU có trong đề nghị nhập hiện NCC và giá nhập
    await expect(dong(page, 'prd-003-v1').getByTestId('bulk-source')).toContainText('giá nhập 205.000');
    // AC2: giá nhập 205.000 × 1,6 (Phụ kiện) làm tròn nghìn = 328.000, nhãn "gợi ý"
    const gia = goiY(page, 'prd-003-v1', 'Giá chuẩn');
    await expect(gia).toContainText('gợi ý');
    await expect(gia).toContainText('328.000');
    await expect(gia).toHaveAttribute('title', /205\.000 × 1,6/);
    // AC4: SKU mới lấy khối lượng, kích thước theo SKU cùng sản phẩm gần nhất
    await expect(goiY(page, 'prd-001-v4', 'Khối lượng')).toContainText('200');
    await expect(goiY(page, 'prd-001-v4', 'Dài')).toContainText('300');
    // AC3: SKU đã có bán, chưa đặt ngưỡng: tốc độ bán × ngày NCC giao + dự phòng
    await expect(page.getByRole('button', { name: /^Nhận gợi ý Ngưỡng tồn/ }).first()).toHaveAttribute(
      'title',
      /\/ngày × \d+ ngày NCC giao \+ \d+ dự phòng/,
    );
    // Ô chưa nhận gợi ý vẫn trống
    await expect(o(page, 'prd-001-v4', /^Khối lượng/)).toHaveValue('');
  });

  test('chỉ lưu gợi ý đã nhận, gợi ý chưa nhận giữ nguyên', async ({ page }) => {
    await goiY(page, 'prd-003-v1', 'Giá chuẩn').click();
    await expect(o(page, 'prd-003-v1', /^Giá chuẩn/)).toHaveValue('328000');
    await o(page, 'prd-001-v4', /^Dài/).fill('320');
    await expect(page.getByTestId('bulk-dirty')).toContainText('2 SKU có thay đổi chưa lưu');
    await luu(page).click();
    await toast(page, 'Đã lưu 2 SKU');
    await expect(page.getByTestId('bulk-dirty')).toContainText('Chưa có thay đổi');

    // SKU đủ thông tin rời khỏi bộ lọc "còn trống ô"
    await expect(dong(page, 'prd-003-v1')).toHaveCount(0);
    // AC5: khối lượng gợi ý chưa nhận nên chưa lưu
    await expect(o(page, 'prd-001-v4', /^Dài/)).toHaveValue('320');
    await expect(o(page, 'prd-001-v4', /^Khối lượng/)).toHaveValue('');
    await expect(goiY(page, 'prd-001-v4', 'Khối lượng')).toBeVisible();

    await page.getByLabel('Chỉ SKU còn trống ô').click();
    await expect(o(page, 'prd-003-v1', /^Giá chuẩn/)).toHaveValue('328000');
  });

  test('dòng lỗi báo trên dòng, dòng khác vẫn lưu', async ({ page }) => {
    await goiY(page, 'prd-003-v1', 'Giá chuẩn').click();
    await o(page, 'prd-001-v4', /^Khối lượng/).fill('90000');
    await luu(page).click();
    await toast(page, 'Đã lưu 1 SKU, 1 SKU lỗi');
    await expect(dong(page, 'prd-001-v4').getByTestId('bulk-row-error')).toContainText('Có ô chưa hợp lệ');
    await expect(dong(page, 'prd-001-v4')).toContainText('Quá 50 kg');
    await expect(o(page, 'prd-001-v4', /^Khối lượng/)).toHaveValue('90000');
    await expect(page.getByTestId('bulk-dirty')).toContainText('1 SKU có thay đổi chưa lưu');
    await expect(dong(page, 'prd-003-v1')).toHaveCount(0);

    // Sửa lại rồi lưu được
    await o(page, 'prd-001-v4', /^Khối lượng/).fill('210');
    await luu(page).click();
    await toast(page, 'Đã lưu 1 SKU');
    await expect(dong(page, 'prd-001-v4').getByTestId('bulk-row-error')).toHaveCount(0);
  });

  test('ô sai định dạng chặn lưu', async ({ page }) => {
    await o(page, 'prd-001-v4', /^Khối lượng/).fill('abc');
    await expect(dong(page, 'prd-001-v4')).toContainText('Số nguyên dương');
    await expect(luu(page)).toBeDisabled();
  });

  test('nhận mọi gợi ý của SKU đã chọn, rời trang khi chưa lưu thì hỏi lại', async ({ page }) => {
    await dong(page, 'prd-001-v4').getByRole('checkbox').click();
    await page.getByRole('button', { name: /^Nhận gợi ý cho SKU đã chọn \(4\)$/ }).click();
    await toast(page, 'Đã nhận 4 gợi ý');
    await expect(o(page, 'prd-001-v4', /^Khối lượng/)).toHaveValue('200');
    await expect(o(page, 'prd-001-v4', /^Cao/)).toHaveValue('20');

    await page.getByRole('button', { name: 'Về danh sách', exact: true }).click();
    const hoi = page.getByRole('alertdialog');
    await expect(hoi).toContainText('Rời trang khi chưa lưu?');
    await hoi.getByRole('button', { name: 'Ở lại', exact: true }).click();
    await expect(o(page, 'prd-001-v4', /^Khối lượng/)).toHaveValue('200');

    await page.getByRole('button', { name: 'Về danh sách', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Rời trang', exact: true }).click();
    await expect.poll(() => duongDan(page)).toMatch(/\/catalog$/);
    await expect(page.getByRole('button', { name: 'Sửa hàng loạt', exact: true })).toBeVisible();
  });
});
