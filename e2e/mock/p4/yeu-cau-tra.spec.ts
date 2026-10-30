// P4 · Yêu cầu trả (sơ đồ D3; FE#60): xử lý yêu cầu, quét nhận hàng trả, kiểm hàng về đóng yêu cầu, sàn đẩy về
import { type Page } from '@playwright/test';
import { chon, chua, dangNhap, dong, expect, menu, test, thayChu, toast } from '../../fixtures';

const CHAN_QUYEN = 'Vai trò của bạn trong công ty này không có quyền mở trang này.';

const trangThai = (page: Page) => page.locator('[data-testid=return-status]');
const nut = (page: Page, name: string) => page.locator('[data-testid=return-actions]').getByRole('button', { name, exact: true });
const tien = (page: Page) => page.locator('[data-testid=return-money]');
/** Cha của phần tử chứa chữ (khối nhãn và giá trị) */
const chaCua = (page: Page, text: string) => chua(page, text).locator('..');

const diToi = (page: Page, path: string) =>
  page.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);

/** Sàn giả lập: điền tham số rồi phát sự kiện */
const phat = async (page: Page, type: string, value: string) => {
  const khoi = page.locator(`[data-event="${type}"]`);
  await khoi.getByRole('textbox').fill(value);
  await khoi.getByRole('button', { name: 'Phát', exact: true }).click();
};

/** Sàn đẩy yêu cầu trả cho DH-1015 rồi mở chi tiết YCT-000003 */
const yeuCauSan = async (page: Page) => {
  await page.goto('/c/cmp-001/dev/marketplace');
  await phat(page, 'return.requested', 'DH-1015');
  await toast(page, /YCT-000003 cho DH-1015/);
  await diToi(page, '/c/cmp-001/sales/returns');
  await chua(page, 'YCT-000003', 'tr').click();
  await expect(trangThai(page)).toContainText('Chờ xử lý');
};

const quetNhan = async (page: Page, code: string) => {
  await page.getByRole('button', { name: 'Quét nhận hàng trả', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByTestId('receive-code').fill(code);
  await dialog.getByRole('button', { name: 'Nhận hàng', exact: true }).click();
};

test.describe('P4 · Yêu cầu trả', () => {
  test.describe('Sale xử lý yêu cầu', () => {
    test.beforeEach(({ page }) => dangNhap(page, 'sale@commerio.vn', 'sale'));

    test('danh sách mở tab Chờ xử lý, đơn mang cờ Có yêu cầu trả', async ({ page }) => {
      await menu(page, 'Yêu cầu trả');
      await expect(page.getByRole('tab', { name: /Chờ xử lý/ })).toHaveAttribute('aria-selected', 'true');
      await expect(dong(page, 'rr-001')).toContainText('YCT-000001');
      await expect(dong(page, 'rr-001')).toContainText('DH-1020');
      await expect(dong(page, 'rr-002')).toHaveCount(0);
      await page.getByRole('tab', { name: /Chờ hàng về/ }).click();
      await expect(dong(page, 'rr-002')).toContainText('DH-1019');
      // Sale không có quyền kho nên không thấy nút quét
      await expect(page.getByRole('button', { name: 'Quét nhận hàng trả', exact: true })).toHaveCount(0);
      await page.goto('/c/cmp-001/sales/orders/ord-1020');
      await expect(page.locator('[data-testid=order-returns]')).toContainText('YCT-000001');
      await expect(page.locator('main')).toContainText('Có yêu cầu trả');
    });

    test('chấp nhận trả hàng: chờ hàng về, không có nút nhận hàng khi thiếu quyền kho', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/returns/rr-001');
      await expect(trangThai(page)).toContainText('Chờ xử lý');
      await nut(page, 'Chấp nhận trả hàng').click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Chấp nhận trả hàng', exact: true }).click();
      await toast(page, 'YCT-000001: Chấp nhận trả hàng');
      await expect(trangThai(page)).toContainText('Chờ hàng về');
      await expect(page.locator('[data-testid=return-actions]')).toContainText('Khách không gửi hàng');
      await expect(page.locator('[data-testid=return-actions]')).not.toContainText('Nhận hàng trả');
      // Yêu cầu lập tay không có lịch sử phía sàn
      await expect(page.getByRole('tab', { name: 'Lịch sử phía sàn', exact: true })).toHaveCount(0);
    });

    test('từ chối bắt buộc lý do; yêu cầu lập tay không có sàn xử cho khách', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/returns/rr-001');
      await nut(page, 'Từ chối').click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
      await thayChu(dialog, 'Nhập lý do');
      await dialog.getByLabel('Lý do', { exact: true }).fill('Quá hạn đổi trả');
      await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
      await expect(trangThai(page)).toContainText('Đã từ chối');
      await expect(page.locator('[data-testid=return-actions]')).toHaveCount(0);
      await expect(page.locator('[data-testid=status-history]')).toContainText('Quá hạn đổi trả');
    });

    test('hoàn tiền, khách giữ hàng: đóng luồng, ghi tiền hoàn', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/returns/rr-001');
      await nut(page, 'Hoàn tiền, khách giữ hàng').click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Hoàn tiền, khách giữ hàng', exact: true }).click();
      await expect(trangThai(page)).toContainText('Chỉ hoàn tiền');
      await expect(tien(page)).toContainText('180.000');
      await expect(tien(page)).toContainText('Đã hoàn');
    });

    test('khách không gửi hàng: đóng, không hoàn tiền', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/returns/rr-002');
      await nut(page, 'Khách không gửi hàng').click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Lý do', { exact: true }).fill('Quá 14 ngày không gửi');
      await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
      await expect(trangThai(page)).toContainText('Đã đóng');
      await expect(trangThai(page)).toContainText('Khách không gửi');
      await expect(tien(page)).toContainText('Chưa hoàn');
    });

    test('lập yêu cầu trả một phần cho đơn tạo tay, vượt số thì báo tại ô', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1021');
      await page.locator('[data-testid=order-returns]').getByRole('button', { name: 'Tạo yêu cầu trả', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Lập yêu cầu', exact: true }).click();
      await thayChu(dialog, 'Chọn ít nhất một dòng trả');
      const dongTra = dialog.locator('[data-testid=create-return-lines] tbody tr').first();
      const n = Number(await dongTra.locator('td').nth(2).textContent());
      await page.locator('[data-testid=create-return-lines] tbody tr').first().locator('input').fill(String(n + 1));
      await page.getByRole('button', { name: 'Lập yêu cầu', exact: true }).click();
      await expect(dialog).toContainText(`Còn trả được ${n}`);
      await page.locator('[data-testid=create-return-lines] tbody tr').first().locator('input').fill('1');
      await dialog.getByRole('button', { name: 'Lập yêu cầu', exact: true }).click();
      await thayChu(dialog, 'Nhập lý do');
      await dialog.getByTestId('return-reason').fill('Khách đổi size');
      await dialog.getByRole('button', { name: 'Lập yêu cầu', exact: true }).click();
      await toast(page, 'Đã lập yêu cầu trả YCT-000003');
      await expect(page.locator('[data-testid=order-returns]')).toContainText('YCT-000003');
      await expect(page.locator('[data-testid=order-returns]')).toContainText('Chờ xử lý');
      await expect(page.locator('main')).toContainText('Có yêu cầu trả');
    });

    test('đơn sàn không lập tay được yêu cầu trả', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1015');
      await expect(page.getByRole('button', { name: 'Tạo yêu cầu trả', exact: true })).toHaveCount(0);
    });
  });

  test.describe('kho quét nhận hàng trả', () => {
    test.beforeEach(({ page }) => dangNhap(page, 'ceo@commerio.vn', 'ceo'));

    test('quét khớp: nhận hàng, ghi sổ kiểm hàng về thì yêu cầu đóng', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/returns');
      await quetNhan(page, 'YCT-000002');
      await toast(page, 'Đã nhận hàng trả YCT-000002');
      await expect(trangThai(page)).toContainText('Đã nhận hàng');
      await expect(tien(page)).toContainText('Chờ kiểm hàng về');
      await chaCua(page, 'Phiếu kiểm hàng về').locator('a').click();
      const lines = page.getByTestId('doc-lines');
      await lines.getByLabel(/^Số quét /).first().fill('1');
      await lines.getByLabel(/^Bán lại /).first().fill('1');
      await page.getByRole('button', { name: 'Ghi sổ', exact: true }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Ghi sổ', exact: true }).click();
      await expect(page.getByTestId('doc-status')).toContainText('Đã ghi sổ');
      await diToi(page, '/c/cmp-001/sales/returns/rr-002');
      await expect(trangThai(page)).toContainText('Đã đóng');
      await expect(trangThai(page)).toContainText('Đã kiểm hàng về');
      for (const t of ['Số bán lại được', '1', 'Giảm giá vốn']) await expect(tien(page)).toContainText(t);
    });

    test('quét yêu cầu chưa chấp nhận thì báo lỗi', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/returns');
      await quetNhan(page, 'YCT-000001');
      await expect(page.getByRole('dialog')).toContainText('không ở trạng thái Chờ hàng về');
    });

    test('quét không khớp: kiện vào tab Không khớp, gắn vào yêu cầu chờ hàng về', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/returns');
      await quetNhan(page, 'VD-LA-999');
      await toast(page, 'Mã VD-LA-999 không khớp yêu cầu nào');
      await expect(page.getByRole('tab', { name: /Không khớp/ })).toHaveAttribute('aria-selected', 'true');
      const kien = page.locator('[data-testid=unmatched-parcels] tr[data-row-id="VD-LA-999"]');
      await thayChu(kien, 'Chờ xử lý');
      await kien.getByRole('button', { name: 'Gắn yêu cầu', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Gắn và nhận hàng', exact: true }).click();
      await thayChu(dialog, 'Chọn yêu cầu trả');
      await chon(page, 'Yêu cầu đang chờ hàng về', /YCT-000002/);
      await dialog.getByRole('button', { name: 'Gắn và nhận hàng', exact: true }).click();
      await toast(page, 'Đã gắn kiện VD-LA-999 vào yêu cầu');
      await expect(kien.locator('a')).toHaveText('YCT-000002');
      await kien.locator('a').click();
      await expect(trangThai(page)).toContainText('Đã nhận hàng');
    });

    test('kiện không khớp xử lý khác thì bắt buộc ghi cách xử lý', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/returns');
      await quetNhan(page, 'KHONG-RO');
      const kien = page.locator('[data-testid=unmatched-parcels] tr[data-row-id="KHONG-RO"]');
      await kien.getByRole('button', { name: 'Xử lý khác', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Cách xử lý', { exact: true }).fill('Trả lại đơn vị vận chuyển');
      await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
      await expect(kien).toContainText('Trả lại đơn vị vận chuyển');
      await expect(kien.getByRole('button')).toHaveCount(0);
    });
  });

  test.describe('sàn đẩy yêu cầu trả', () => {
    test.beforeEach(({ page }) => dangNhap(page, 'ceo@commerio.vn', 'ceo'));

    test('sàn đẩy yêu cầu, người bán từ chối, sàn xử cho khách thì mở lại', async ({ page }) => {
      await page.goto('/c/cmp-001/dev/marketplace');
      await phat(page, 'return.requested', 'DH-1015');
      await toast(page, /YCT-000003 cho DH-1015; .* nhảy sang Đã giao/);
      await diToi(page, '/c/cmp-001/sales/returns');
      await expect(page.getByRole('tab', { name: /Chờ xử lý/ })).toContainText('2');
      await expect(chua(page, 'YCT-000003', 'tr')).toContainText('DH-1015');
      await chua(page, 'YCT-000003', 'tr').click();
      await expect(page.locator('main')).toContainText('Sàn ·');
      await expect(page.locator('[data-testid=platform-status]')).toContainText('REQUEST_INITIATE');
      await nut(page, 'Từ chối').click();
      const dialog = page.getByRole('dialog');
      await thayChu(dialog, 'Từ chối yêu cầu YCT-000003');
      await dialog.getByLabel('Quá hạn trả hàng', { exact: true }).click();
      await dialog.getByRole('button', { name: 'Từ chối', exact: true }).click();
      await toast(page, 'YCT-000003: Từ chối');
      await expect(trangThai(page)).toContainText('Đã từ chối');
      await expect(trangThai(page)).toContainText('Khách đang khiếu nại trên sàn');
      await expect(chaCua(page, 'Lý do từ chối (theo sàn)')).toContainText('Quá hạn trả hàng');
      await thayChu(page, 'Sàn xử cho khách thì yêu cầu mở lại');
      await expect(nut(page, 'Sàn xử cho khách: trả hàng')).toBeAttached();

      await diToi(page, '/c/cmp-001/dev/marketplace');
      await phat(page, 'return.judged', 'YCT-000003 return');
      await toast(page, 'YCT-000003 → awaiting_return');
      await diToi(page, '/c/cmp-001/sales/orders/ord-1015');
      await expect(page.locator('[data-testid=order-returns]')).toContainText('YCT-000003');
      await expect(page.locator('[data-testid=order-returns]')).toContainText('Chờ hàng về');
    });

    test('lý do sàn đòi bằng chứng thì bắt buộc ảnh', async ({ page }) => {
      await yeuCauSan(page);
      await nut(page, 'Từ chối').click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Từ chối', exact: true }).click();
      await thayChu(dialog, 'Chọn lý do từ chối');
      await dialog.getByLabel(/Hàng bị khách làm hỏng/).click();
      await thayChu(dialog, 'Ảnh bằng chứng (bắt buộc)');
      await dialog.getByRole('button', { name: 'Từ chối', exact: true }).click();
      await thayChu(dialog, 'Lý do này cần ảnh làm bằng chứng');
      await dialog.getByLabel('Ghi chú gửi sàn', { exact: true }).fill('Vỏ hộp móp, có vết bẩn');
      await dialog
        .locator('[data-testid=attachment-input]')
        .setInputFiles({ name: 'hong.png', mimeType: 'image/png', buffer: Buffer.from('anh-bang-chung') });
      await expect(dialog.locator('[data-testid=attachments] li[data-file-id]')).toHaveCount(1);
      await dialog.getByRole('button', { name: 'Từ chối', exact: true }).click();
      await toast(page, 'YCT-000003: Từ chối');
      await expect(chaCua(page, 'Lý do từ chối (theo sàn)')).toContainText('Hàng bị khách làm hỏng');
      await thayChu(page, 'Hàng bị khách làm hỏng: Vỏ hộp móp, có vết bẩn');
      await expect(chaCua(page, 'Ảnh bằng chứng gửi sàn').locator('li[data-file-id]')).toHaveCount(1);
    });

    test('lịch sử phía sàn hiện trạng thái gốc, mới nhất trước', async ({ page }) => {
      await yeuCauSan(page);
      await nut(page, 'Chấp nhận trả hàng').click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Chấp nhận trả hàng', exact: true }).click();
      await expect(trangThai(page)).toContainText('Chờ hàng về');
      await page.getByRole('tab', { name: 'Lịch sử phía sàn', exact: true }).click();
      const rows = page.locator('[data-testid=platform-history] tbody tr');
      await expect(rows).toHaveCount(2);
      for (const t of ['RETURN_PENDING', 'SELLER_AGREE_RETURN', 'agreeReturn']) await expect(rows.first()).toContainText(t);
      await expect(rows.last()).toContainText('REQUEST_INITIATE');
    });

    test('đơn tạo tay không nhận yêu cầu từ sàn', async ({ page }) => {
      await page.goto('/c/cmp-001/dev/marketplace');
      await phat(page, 'return.requested', 'DH-1021');
      await toast(page, 'Chỉ đơn sàn');
    });
  });

  test.describe('phân quyền', () => {
    test('kho xem được, quét được, không có nút xử lý yêu cầu', async ({ page }) => {
      await dangNhap(page, 'kho@commerio.vn', 'kho');
      await menu(page, 'Yêu cầu trả');
      await expect(page.getByRole('button', { name: 'Quét nhận hàng trả', exact: true })).toBeAttached();
      await dong(page, 'rr-001').click();
      await expect(trangThai(page)).toContainText('Chờ xử lý');
      await expect(page.locator('[data-testid=return-actions]')).toHaveCount(0);
      await expect(tien(page)).not.toContainText('Giảm giá vốn');
    });

    test('kế toán không mở được trang yêu cầu trả', async ({ page }) => {
      await dangNhap(page, 'ketoan@commerio.vn', 'ketoan');
      await page.goto('/c/cmp-001/sales/returns');
      await thayChu(page, CHAN_QUYEN);
    });
  });
});
