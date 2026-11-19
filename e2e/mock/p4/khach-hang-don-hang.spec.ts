// P4 · Đơn hàng: danh sách, xác nhận đơn (UC-SF-04; FE#9). Khách hàng, tạo đơn tay ngoài MVP, gỡ ở FE#249
import { type Page } from '@playwright/test';
import { chon, chu, dangNhap, dong, expect, menu, mockApi, test, thayChu, toast } from '../../fixtures';

const CHAN_QUYEN_BAN_HANG = 'Vai trò của bạn trong công ty này không có quyền mở trang này.';

/** Câu giải thích trạng thái đơn nằm trong nút "?" cạnh nhãn (FE#138) */
const giaiThichDon = async (page: Page, text: string) => {
  await page.getByRole('button', { name: 'Giải thích: Trạng thái đơn', exact: true }).hover();
  await expect(page.getByRole('tooltip')).toContainText(text);
};

test.describe('P4 · Đơn hàng', () => {
  test.describe('danh sách đơn (UC-SF-04)', () => {
    test.beforeEach(async ({ page }) => {
      await dangNhap(page, 'ceo@commerio.vn', 'ceo');
      await menu(page, 'Đơn hàng');
    });

    test('tab theo 4 trạng thái, giai đoạn suy từ kiện, lọc theo giai đoạn', async ({ page }) => {
      const tatCa = page.getByRole('tab', { name: /^Tất cả/ });
      await expect(tatCa).toHaveAttribute('data-state', 'active');
      // Tab có số đơn theo bộ lọc (FE#138)
      await expect(tatCa).toHaveText(/^Tất cả\s*\d+$/);
      await expect(page.getByRole('tab', { name: /^Chưa thanh toán/ })).toHaveText(/^Chưa thanh toán\s*\d+$/);
      await expect(dong(page, 'ord-1003')).toContainText('Chưa thanh toán');
      await dong(page, 'ord-1003').getByText('Chưa thanh toán', { exact: true }).hover();
      await expect(page.getByRole('tooltip')).toContainText('Đơn trả trước, người mua chưa thanh toán.');
      await expect(dong(page, 'ord-1006')).toContainText('Chờ đóng gói');
      await expect(page.locator('tbody')).not.toContainText('DH-2001');
      await page.getByRole('tab', { name: /^Chưa thanh toán/ }).click();
      await expect(dong(page, 'ord-1003')).toBeAttached();
      await expect(dong(page, 'ord-1006')).toHaveCount(0);
      await tatCa.click();
      await chon(page, 'Giai đoạn', 'Đang vận chuyển');
      await expect(dong(page, 'ord-1016')).toBeAttached();
      await expect(dong(page, 'ord-1003')).toHaveCount(0);
    });

    test('đơn sàn: người nhận khi chưa gắn khách, mã đơn sàn, cột sản phẩm, hạn gửi; tìm theo mã đơn sàn (FE#176)', async ({ page }) => {
      // DH-1005 chưa gắn khách: hiện tên người nhận sàn đã che
      await expect(dong(page, 'ord-1005')).toContainText('Lê T*** H***');
      await expect(dong(page, 'ord-1005')).toContainText('người nhận');
      await expect(dong(page, 'ord-1005')).toContainText('533851500001005');
      // DH-1012 hai món: món đầu kèm "và 1 món khác"
      await expect(dong(page, 'ord-1012')).toContainText('× 1 · và 1 món khác');
      await expect(dong(page, 'ord-1012').getByRole('button', { name: 'Sao chép mã đơn sàn 533851500001012' })).toBeVisible();
      // Thanh toán theo phương thức gốc của sàn
      await expect(dong(page, 'ord-1012').getByRole('cell', { name: 'COD', exact: true })).toBeVisible();
      // Đơn tạo tay không có mã đơn sàn, không có hạn gửi
      await expect(dong(page, 'ord-1003')).not.toContainText('5338515');
      await page.getByPlaceholder(/Tìm/).fill('533851500001012');
      await expect(dong(page, 'ord-1012')).toBeAttached();
      await expect(dong(page, 'ord-1005')).toHaveCount(0);
    });

    test('chi tiết đơn sàn: mã đơn sàn, trạng thái gốc, ghi chú khách, ảnh và thuộc tính từng dòng (FE#176)', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1012');
      await expect(page.locator('[data-testid=order-head] [data-testid=external-order-id]')).toContainText('533851500001012');
      await expect(page.locator('[data-testid=order-head] [data-testid=payment-method]')).toHaveText(/^Thanh toán\s+COD$/);
      await expect(page.locator('[data-testid=order-status]')).toContainText('Sàn: READY_TO_SHIP');
      await expect(page.locator('[data-testid=buyer-note]')).toContainText('Giao giờ hành chính giúp em');
      const dongHang = page.locator('[data-testid=order-lines] tbody tr');
      await expect(dongHang).toHaveCount(2);
      // Ảnh thật đã tải (AvatarImage chỉ hiện khi ảnh tải xong, không tính fallback)
      await expect(dongHang.first().locator('[data-slot=avatar-image]')).toBeVisible();
      await expect(dongHang.first()).toContainText('SKU sàn 4020152004_VNAMZ-1520943');
      await expect(page.locator('[data-testid=order-lines]')).toContainText('Khách trả');
      await expect(dongHang.first()).toContainText('135.000');
      await expect(page.locator('[data-testid=line-issue]')).toHaveCount(0);
      // DH-1002 giao thất bại: trạng thái hoàn, không ai huỷ, lý do kèm chi tiết, mã đơn ngược; tiền khách trả gạch đi
      await page.goto('/c/cmp-001/sales/orders/ord-1002');
      const loi = page.locator('[data-testid=line-issue]');
      await expect(loi).toContainText('Giao thất bại: Đang hoàn về');
      await expect(loi).not.toContainText(/do (khách|shop|sàn)/);
      await expect(loi).toContainText('Lý do: Khách không nhận hàng (Gọi 3 lần không nghe máy)');
      await expect(loi).toContainText('Mã đơn ngược 7712045893');
      await expect(page.locator('[data-testid=order-lines] tbody tr').first().locator('.line-through')).toContainText('180.000');
    });

    test('chi tiết đơn sàn: địa chỉ sàn che một phần, thanh toán, phí ship và vận chuyển của kiện (FE#176)', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1012');
      // Lazada che số nhà, tỉnh: hiện nguyên chuỗi sàn trả; phường đã có trong chuỗi thì không lặp
      await expect(page.locator('[data-testid=shipping-address]')).toHaveText('1***0 L** L**, Phường Bến Nghé, T*********h');
      await expect(page.locator('[data-testid=shipping-ward]')).toHaveCount(0);
      await thayChu(page, 'Mã bưu chính 700000');
      await thayChu(page, 'Phí ship gốc');
      await thayChu(page, 'Sàn giảm phí ship');
      await thayChu(page, 'Phí ship khách trả');
      await expect(page.locator('[data-testid=package-shipping]').first()).toContainText(' · Tiêu chuẩn · sàn hứa gửi trước ');
      // Đơn tạo tay: không có các trường sàn
      await page.goto('/c/cmp-001/sales/orders/ord-1003');
      await expect(page.locator('[data-testid=order-lines]')).not.toContainText('Khách trả');
      await expect(page.locator('[data-testid=buyer-note]')).toHaveCount(0);
      await expect(page.getByText('Phí ship gốc')).toHaveCount(0);
    });
  });

  test.describe('xác nhận đơn (UC-SF-04)', () => {
    test.beforeEach(({ page }) => dangNhap(page, 'sale@commerio.vn', 'sale'));

    test('xác nhận đơn COD thiếu hàng: đơn Đang xử lý, kiện chờ hàng', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1004');
      const status = page.locator('[data-testid=order-status]');
      await expect(status).toContainText('Chưa thanh toán');
      await page.getByRole('button', { name: 'Xác nhận đơn', exact: true }).click();
      await toast(page, 'Đã xác nhận đơn');
      await expect(status).toContainText('Đang xử lý');
      await expect(status).toContainText('Thiếu hàng');
      await expect(page.getByRole('button', { name: 'Xác nhận đơn', exact: true })).toHaveCount(0);
      await expect(page.locator('[data-testid=status-history] li').first()).toContainText('Đang xử lý');
    });

    test('đơn trả trước không có nút xác nhận, chờ khách trả', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1003');
      await giaiThichDon(page, 'Đơn trả trước sang Đang xử lý khi khách thanh toán.');
      // Thanh bước trên cùng, cột phải có lịch sử (FE#138)
      await expect(page.locator('[data-testid=lifecycle] li').first()).toContainText('Chưa thanh toán');
      await expect(page.locator('[data-guide=detail-history] [data-testid=status-history]')).toBeAttached();
      await expect(page.getByRole('button', { name: 'Xác nhận đơn', exact: true })).toHaveCount(0);
    });

    test('đơn vừa bị người khác cập nhật thì báo và tải lại', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1004');
      await expect(page.getByRole('button', { name: 'Xác nhận đơn', exact: true })).toBeAttached();
      await mockApi(page, 'post', '/sales/orders/ord-1004/confirm', 409, { status: 409, code: 'version_conflict' });
      await page.getByRole('button', { name: 'Xác nhận đơn', exact: true }).click();
      await thayChu(page, 'Đơn vừa được người khác cập nhật');
    });

    test('đơn sàn không có nút xác nhận', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1005');
      await giaiThichDon(page, 'Đơn sàn: trạng thái thanh toán và giao lấy từ sàn; huỷ đơn sẽ gửi lên sàn.');
      await expect(page.getByRole('button', { name: 'Xác nhận đơn', exact: true })).toHaveCount(0);
    });
  });

  test.describe('phân quyền và cách ly (AC-R)', () => {
    test('cskh chỉ xem đơn: không xác nhận', async ({ page }) => {
      await dangNhap(page, 'cskh@commerio.vn', 'cskh');
      await menu(page, 'Đơn hàng');
      await expect(dong(page, 'ord-1003')).toBeAttached();
      await expect(page.getByRole('button', { name: 'Tạo đơn', exact: true })).toHaveCount(0);
      await dong(page, 'ord-1003').click();
      await thayChu(page, 'Đơn DH-1003', 'h1');
      await expect(page.getByRole('button', { name: 'Xác nhận đơn', exact: true })).toHaveCount(0);
    });

    test('kho không thấy menu bán hàng, mở thẳng URL thì bị chặn', async ({ page }) => {
      await dangNhap(page, 'kho@commerio.vn', 'kho');
      const muc = (text: string) => page.locator('[data-sidebar="menu-button"]', { hasText: chu(text) });
      await expect(muc('Đơn hàng')).toHaveCount(0);
      await page.goto('/c/cmp-001/sales/orders');
      await thayChu(page, CHAN_QUYEN_BAN_HANG);
    });

    test('đơn của công ty khác báo không tìm thấy', async ({ page }) => {
      await dangNhap(page, 'ceo@commerio.vn', 'ceo');
      await page.goto('/c/cmp-001/sales/orders/ord-2001');
      await thayChu(page, 'Không tìm thấy', 'h1');
    });
  });
});
