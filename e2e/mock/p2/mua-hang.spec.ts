// P2 · Mua hàng (sơ đồ A1 đề nghị nhập, A2 phiếu nhận, B4 trả NCC; FE#17)
import { type Page } from '@playwright/test';
import { chua, dangNhap, expect, menu, test, thayChu, toast } from '../../fixtures';

const moTab = async (page: Page, tab: string, number: string) => {
  await menu(page, 'Mua hàng');
  await page.getByRole('tab', { name: tab, exact: true }).click();
  await chua(page, number, 'tbody tr').click();
};
/** Bấm nút thao tác rồi xác nhận trong hộp thoại */
const thaoTac = async (page: Page, label: string) => {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: label, exact: true }).click();
};

test.describe('P2 · Mua hàng', () => {
  test.describe('CEO', () => {
    test.beforeEach(({ page }) => dangNhap(page, 'ceo@commerio.vn', 'ceo'));

    test('tự duyệt đề nghị mình lập rồi tự ghi sổ phiếu nhận (A1, A2; FE#93)', async ({ page }) => {
      await moTab(page, 'Đề nghị nhập', 'DN-000003');
      await expect(page.getByTestId('request-status')).toContainText('Chờ duyệt');
      for (const label of ['Duyệt', 'Trả về', 'Từ chối']) {
        const nut = page.getByRole('button', { name: label, exact: true });
        await expect(nut).toBeVisible();
        await expect(nut).not.toHaveAttribute('aria-disabled', 'true');
      }
      await thaoTac(page, 'Duyệt');
      await toast(page, 'DN-000003');
      await expect(page.getByTestId('request-status')).toContainText('Đã duyệt');
      await expect(page.getByRole('button', { name: 'Duyệt', exact: true })).toHaveCount(0);

      await thaoTac(page, 'Đã đặt NCC');
      await page.getByRole('button', { name: 'Lập phiếu nhận', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Lập phiếu', exact: true }).click();
      await toast(page, 'Đã lập phiếu nhận');
      await expect(page.getByTestId('receipt-status')).toContainText('Đang kiểm');
      await page.getByLabel(/^Báo giao /).first().fill('1');
      await page.getByLabel(/^Đạt /).first().fill('1');
      await expect(page.getByRole('button', { name: 'Ghi sổ', exact: true })).not.toHaveAttribute('aria-disabled', 'true');
      await thaoTac(page, 'Ghi sổ');
      await expect(page.getByTestId('receipt-status')).toContainText('Khớp');
    });

    test('người gửi phiếu trả không tự ghi kết quả từ NCC (B4)', async ({ page }) => {
      await moTab(page, 'Trả NCC', 'TN-000001');
      await expect(page.getByTestId('return-status')).toContainText('Đã gửi');
      await expect(page.getByTestId('lifecycle-blocked')).toContainText('Cần người thứ hai');
      for (const label of ['NCC hoàn tiền', 'NCC bù hàng', 'NCC không nhận']) {
        await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-disabled', 'true');
      }
    });

    test('tồn dưới ngưỡng: thêm vào đề nghị nhập nháp (B2 → A1)', async ({ page }) => {
      await menu(page, 'Kho');
      await page.getByRole('button', { name: /Nên nhập lại/ }).click();
      await page
        .locator('tbody tr[data-row-id]')
        .first()
        .getByRole('button', { name: 'Thêm vào đề nghị nhập', exact: true })
        .click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Số lượng', { exact: true }).fill('0');
      await dialog.getByRole('button', { name: 'Thêm vào đề nghị', exact: true }).click();
      await thayChu(dialog, 'Số lượng là số nguyên từ 1');
      await dialog.getByLabel('Số lượng', { exact: true }).fill('5');
      await dialog.getByRole('button', { name: 'Thêm vào đề nghị', exact: true }).click();
      await toast(page, 'Đã thêm vào DN-000004');
    });

    test('báo cáo NCC lọc theo kỳ ghi sổ (A2)', async ({ page }) => {
      await menu(page, 'Mua hàng');
      await page.getByRole('tab', { name: 'Nhà cung cấp', exact: true }).click();
      const phieuNhan = () => chua(page, 'Xưởng may Thành Công', 'tbody tr').locator('td').nth(1);
      // NH-000001 ghi sổ ngày 08/10/2026
      await page.getByLabel('Ghi sổ từ ngày', { exact: true }).fill('2026-10-08');
      await page.getByLabel('Đến ngày', { exact: true }).fill('2026-10-08');
      await expect(phieuNhan()).toHaveText('1');
      await page.getByLabel('Ghi sổ từ ngày', { exact: true }).fill('2026-10-09');
      await page.getByLabel('Đến ngày', { exact: true }).fill('2026-10-09');
      await expect(phieuNhan()).toHaveText('0');
    });
  });

  test.describe('Kho', () => {
    test.beforeEach(({ page }) => dangNhap(page, 'kho@commerio.vn', 'kho'));

    test('kiểm đếm báo lỗi tiếng Việt, rồi ghi sổ phiếu đủ hàng (A2)', async ({ page }) => {
      await moTab(page, 'Phiếu nhận', 'NH-000002');
      await expect(page.getByTestId('receipt-status')).toContainText('Đang kiểm');
      await thayChu(page, 'Người giao đã đi');
      await page.getByLabel(/^Đạt /).first().fill('12');
      await page.getByRole('button', { name: 'Lưu', exact: true }).click();
      await thayChu(page, 'Đạt, lỗi giữ, trả tại chỗ cộng lại vượt số báo giao');

      await page.getByLabel(/^Đạt /).first().fill('10');
      await thaoTac(page, 'Ghi sổ');
      await toast(page, 'NH-000002');
      await expect(page.getByTestId('receipt-status')).toContainText('Khớp');
      await expect(page.getByRole('button', { name: 'Ghi sổ', exact: true })).toHaveCount(0);
    });
  });

  test.describe('Mua hàng ↔ CEO', () => {
    test('Mua hàng ghi NCC hoàn tiền cho phiếu CEO đã gửi (B4)', async ({ page }) => {
      await dangNhap(page, 'muahang@commerio.vn', 'muahang');
      await moTab(page, 'Trả NCC', 'TN-000001');
      await page.getByRole('button', { name: 'NCC hoàn tiền', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Ghi hoàn tiền', exact: true }).click();
      await thayChu(dialog, 'Nhập số tiền hoàn');
      await dialog.getByLabel(/Số tiền NCC hoàn/).fill('240000');
      await dialog.getByRole('button', { name: 'Ghi hoàn tiền', exact: true }).click();
      await expect(page.getByTestId('return-status')).toContainText('NCC hoàn tiền');
      await thayChu(page, '240.000');
    });

    test('Mua hàng gửi duyệt phiếu trả nháp, không tự duyệt (B4)', async ({ page }) => {
      await dangNhap(page, 'muahang@commerio.vn', 'muahang');
      await moTab(page, 'Trả NCC', 'TN-000002');
      await thaoTac(page, 'Gửi duyệt');
      await expect(page.getByTestId('return-status')).toContainText('Chờ duyệt');
      await expect(page.getByRole('button', { name: 'Duyệt và gửi', exact: true })).toHaveCount(0);
    });

    // Đăng nhập lại tải trang làm mock về dữ liệu đầu, nên phần CEO duyệt chạy trong một phiên
    test('CEO duyệt và gửi phiếu trả chờ duyệt (B4)', async ({ page }) => {
      await dangNhap(page, 'ceo@commerio.vn', 'ceo');
      await moTab(page, 'Trả NCC', 'TN-000002');
      await thaoTac(page, 'Gửi duyệt');
      await expect(page.getByTestId('return-status')).toContainText('Chờ duyệt');
      await thaoTac(page, 'Duyệt và gửi');
      await expect(page.getByTestId('return-status')).toContainText('Đã gửi');
    });
  });
});
