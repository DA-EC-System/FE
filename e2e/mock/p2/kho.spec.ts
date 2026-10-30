// P2 · Kho (sơ đồ Tồn kho B2, Phiếu kho B3; FE#6, FE#56)
import { type Locator, type Page } from '@playwright/test';
import { chua, dangNhap, dong, expect, menu, mockApi, test, thayChu, toast } from '../../fixtures';

const so = (text: string | null) => Number((text ?? '').replace(/[^\d-]/g, '')) || 0;
const o = (page: Page, variantId: string, i: number) => dong(page, variantId).locator('td').nth(i);
/** Thử lại tới khi ô có đúng số (bảng có thể còn số cũ trong lúc nạp lại) */
const coSo = (page: Page, variantId: string, i: number, n: number) =>
  expect.poll(async () => so(await o(page, variantId, i).textContent())).toBe(n);
/** Cột của bảng tồn */
const COT = { tonThuc: 2, dangGiu: 3, tamKhoa: 4, khaDung: 5 };

const moPhieu = async (page: Page, number: string) => {
  await page.getByRole('tab', { name: 'Phiếu kho', exact: true }).click();
  await chua(page, number, 'tbody tr').click();
  await expect(page.getByTestId('doc-lines')).toBeAttached();
};
/** Ô nhập thứ i theo nhãn đầu (vd "Số quét") */
const o2 = (scope: Locator, label: string, i: number) => scope.getByLabel(new RegExp(`^${label} `)).nth(i);
/** Bấm nút thao tác rồi xác nhận trong hộp thoại */
const thaoTac = async (page: Page, label: string) => {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: label, exact: true }).click();
};

test.describe('P2 · Kho', () => {
  test.describe('CEO: tồn kho, ngưỡng, duyệt phiếu', () => {
    test.beforeEach(async ({ page }) => {
      await dangNhap(page, 'ceo@commerio.vn', 'ceo');
      await menu(page, 'Kho');
      await expect(dong(page, 'prd-001-v1')).toBeAttached();
    });

    test('bảy con số: tồn thực, đang giữ, tạm khoá, khả dụng; giá vốn', async ({ page }) => {
      const thead = page.locator('thead');
      for (const h of ['Tồn thực', 'Đang giữ', 'Tạm khoá', 'Khả dụng', 'Giá vốn BQ', 'Giá trị tồn']) await thayChu(thead, h, 'th');
      // Khả dụng = tồn thực − đang giữ − tạm khoá
      for (const id of ['prd-001-v1', 'prd-001-v3']) {
        await expect(dong(page, id)).toBeAttached();
        const td = await dong(page, id).locator('td').allTextContents();
        const n = (i: number) => so(td[i] ?? '');
        expect(n(COT.khaDung)).toBe(Math.max(0, n(COT.tonThuc) - n(COT.dangGiu) - n(COT.tamKhoa)));
      }
      await coSo(page, 'prd-001-v3', COT.tamKhoa, 2);
    });

    test('lọc nên nhập lại, chờ xử lý; thẻ kho theo khu vực', async ({ page }) => {
      const nenNhap = page.getByRole('button', { name: /Nên nhập lại/ });
      await nenNhap.click();
      await expect(nenNhap).toHaveAttribute('aria-pressed', 'true');
      const rows = page.locator('tbody tr[data-row-id]');
      await expect(rows).toHaveCount(1);
      for (const tr of await rows.all()) await expect(tr.getByTestId('below-min')).toHaveCount(1);
      await nenNhap.click();

      await page.getByRole('button', { name: /Có hàng chờ xử lý/ }).click();
      await expect(dong(page, 'prd-002-v1').getByTestId('stock-chips')).toContainText('Chờ xử lý 2');
      await dong(page, 'prd-002-v1').getByRole('button', { name: 'Lịch sử biến động', exact: true }).click();
      const dialog = page.getByRole('dialog');
      for (const t of ['Chờ xử lý', 'Tạm khoá']) await expect(dialog.getByTestId('stock-figures')).toContainText(t);
      for (const t of ['CXL-000001', 'Chờ xử lý', 'Tồn thực']) await expect(dialog.getByTestId('stock-moves')).toContainText(t);
    });

    test('đặt ngưỡng: kiểm số, lưu, bỏ ngưỡng', async ({ page }) => {
      const dialog = page.getByRole('dialog');
      await dong(page, 'prd-003-v1').getByRole('button', { name: 'Đặt ngưỡng', exact: true }).click();
      for (const t of ['-1', '1.5', 'abc']) {
        await dialog.locator('#min-qty').fill(t);
        await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
        await expect(dialog.locator('.text-destructive').first()).not.toBeEmpty();
      }
      await dialog.locator('#min-qty').fill('60');
      await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
      await toast(page, 'Đã đặt ngưỡng 60');
      await expect(dong(page, 'prd-003-v1').getByTestId('min-qty')).toHaveText('60');
      await expect(dong(page, 'prd-003-v1').getByTestId('below-min')).toBeAttached();

      await dong(page, 'prd-003-v1').getByRole('button', { name: 'Đặt ngưỡng', exact: true }).click();
      await dialog.locator('#min-qty').fill('');
      await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
      await toast(page, 'Đã bỏ ngưỡng tồn');
      await expect(dong(page, 'prd-003-v1').getByTestId('below-min')).toHaveCount(0);
    });

    test('ngưỡng bị người khác sửa trước thì hiện ngưỡng mới nhất', async ({ page }) => {
      await dong(page, 'prd-003-v1').getByRole('button', { name: 'Đặt ngưỡng', exact: true }).click();
      await page.locator('#min-qty').fill('8');
      await mockApi(page, 'put', '/inventory/stock/:variantId/reorder-rule', 409, {
        status: 409,
        title: 'Dữ liệu đã thay đổi',
        code: 'version_conflict',
        current: { variantId: 'prd-003-v1', minQty: 25, reorderVersion: 9, belowMin: true },
      });
      await page.getByRole('dialog').getByRole('button', { name: 'Lưu', exact: true }).click();
      await expect(page.locator('#min-qty')).toHaveValue('25');
      await expect(page.getByRole('dialog')).toContainText('Ngưỡng vừa được người khác sửa');
    });

    test('duyệt xuất huỷ: tạm khoá thành trừ tồn', async ({ page }) => {
      const tonTruoc = so(await o(page, 'prd-001-v3', COT.tonThuc).textContent());
      await moPhieu(page, 'XH-000001');
      await expect(page.getByTestId('doc-status')).toContainText('Chờ duyệt');
      await expect(page.getByTestId('doc-lines')).toContainText('tạm khoá 2');
      await thaoTac(page, 'Duyệt và ghi sổ');
      await expect(page.getByTestId('doc-status')).toContainText('Đã ghi sổ');
      await expect(page.getByRole('button', { name: /Duyệt và ghi sổ|Từ chối/ })).toHaveCount(0);
      await thayChu(page, 'Lịch sử');

      await page.getByRole('button', { name: 'Danh sách', exact: true }).click();
      await page.getByRole('tab', { name: 'Tồn kho', exact: true }).click();
      await coSo(page, 'prd-001-v3', COT.tamKhoa, 0);
      await coSo(page, 'prd-001-v3', COT.tonThuc, tonTruoc - 2);
    });
  });

  test.describe('Nhân viên kho: lập phiếu, kiểm hàng về', () => {
    test.beforeEach(async ({ page }) => {
      await dangNhap(page, 'kho@commerio.vn', 'kho');
      await menu(page, 'Kho');
      await expect(dong(page, 'prd-002-v1')).toBeAttached();
    });

    const chonBienThe = async (page: Page, sku: string) => {
      await page.locator('#variant-picker').click();
      await page.locator('#variant-picker').fill(sku);
      await chua(page, sku, '[role=option]').click();
    };

    test('kiểm kê: Δ theo số đếm, gửi duyệt thì kho không tự duyệt được', async ({ page }) => {
      await page.getByRole('tab', { name: 'Phiếu kho', exact: true }).click();
      await page.getByRole('button', { name: 'Kiểm kê', exact: true }).click();
      await chonBienThe(page, 'QU-0001-M');
      const lines = page.getByTestId('doc-lines');
      const book = so(await lines.locator('tbody tr td').nth(1).textContent());
      await lines.getByLabel('Số đếm QU-0001-M', { exact: true }).fill(String(book - 1));
      await expect(lines.locator('tbody tr td').nth(3)).toHaveText('−1');
      await thaoTac(page, 'Gửi duyệt');
      await toast(page, /KK-\d+: chờ duyệt/);
      await expect(page.getByTestId('doc-status')).toContainText('Chờ duyệt');
      await expect(page.getByRole('button', { name: /Duyệt và ghi sổ|Từ chối|Lưu nháp/ })).toHaveCount(0);
    });

    test('xuất huỷ: bắt buộc lý do, vượt khả dụng thì giữ nháp và báo tại ô', async ({ page }) => {
      const n = so(await o(page, 'prd-002-v3', COT.khaDung).textContent());
      await page.getByRole('tab', { name: 'Phiếu kho', exact: true }).click();
      await page.getByRole('button', { name: 'Xuất huỷ', exact: true }).click();
      await chonBienThe(page, 'QU-0003-XL');
      await page.getByTestId('doc-lines').getByLabel('Số lượng QU-0003-XL', { exact: true }).fill(String(n + 1));
      await page.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
      await expect(page.locator('main')).toContainText('Nhập lý do');
      await page.locator('#doc-note').fill('Hàng lỗi đường may');
      await thaoTac(page, 'Gửi duyệt');
      await toast(page, 'vượt số hàng hiện có');
      await expect(page.getByTestId('doc-lines')).toContainText(`Chỉ còn ${n} khả dụng`);
      await expect(page.getByTestId('doc-status')).toContainText('Nháp');
    });

    test('kiểm hàng về đủ: chia phải bằng số quét, ghi sổ thẳng', async ({ page }) => {
      await moPhieu(page, 'KHV-000001');
      await expect(page.locator('main')).toContainText('DH-1001');
      const lines = page.getByTestId('doc-lines');
      await o2(lines, 'Số quét', 1).fill('3');
      await o2(lines, 'Trả NCC', 1).fill('3');
      await o2(lines, 'Số quét', 0).fill('2');
      await o2(lines, 'Bán lại', 0).fill('1');
      await page.getByRole('button', { name: 'Ghi sổ', exact: true }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Ghi sổ', exact: true }).click();
      await expect(lines).toContainText('phải bằng số quét');
      await o2(lines, 'Hỏng', 0).fill('1');
      await thaoTac(page, 'Ghi sổ');
      await expect(page.getByTestId('doc-status')).toContainText('Đã ghi sổ');
    });

    // Ca cuối sai từ FE#72: nút bị luật chặn vẫn hiện, mờ kèm lý do (ActionButton, aria-disabled), nên không thể
    // "không tồn tại". Bộ E2E cũ chỉ qua nhờ kiểm đúng lúc hộp xác nhận đang đóng (trang còn aria-hidden).
    // Không sửa nội dung kiểm khi chuyển (FE#69); sửa ở PR riêng.
    test.fixme('kiểm hàng về thiếu: cờ khiếu nại, người quét không tự duyệt', async ({ page }) => {
      await moPhieu(page, 'KHV-000002');
      await expect(page.getByRole('button', { name: 'Ghi sổ', exact: true })).toHaveAttribute('aria-disabled', 'true');
      await expect(page.getByTestId('lifecycle-blocked')).toContainText('cần người thứ hai duyệt');
      await expect(page.locator('main')).toContainText('Thiếu 1 so với dự kiến');
      await page.getByRole('button', { name: 'Gửi duyệt phần thiếu', exact: true }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Gửi duyệt', exact: true }).click();
      await expect(page.getByTestId('doc-status')).toContainText('Chờ duyệt');
      await expect(page.getByTestId('doc-status')).toContainText('Khiếu nại');
      await expect(page.getByRole('button', { name: /Duyệt và ghi sổ|Yêu cầu kiểm lại/ })).toHaveCount(0);
    });

    test('huỷ phiếu nháp; phiếu theo đơn chỉ xem', async ({ page }) => {
      await moPhieu(page, 'PX-000001');
      await expect(page.getByRole('button', { name: /Ghi sổ|Lưu nháp|Huỷ phiếu|Gửi duyệt/ })).toHaveCount(0);
      await page.getByRole('button', { name: 'Danh sách', exact: true }).click();

      await chua(page, 'KK-000001', 'tbody tr').click();
      await page.getByRole('button', { name: 'Huỷ phiếu', exact: true }).click();
      const alert = page.getByRole('alertdialog');
      await expect(alert.getByRole('heading', { name: 'Huỷ phiếu KK-000001?', exact: true })).toBeAttached();
      await alert.getByRole('button', { name: 'Huỷ phiếu', exact: true }).click();
      await toast(page, 'KK-000001: đã huỷ');
      await expect(page.getByTestId('doc-status')).toContainText('Đã huỷ');
    });
  });
});
