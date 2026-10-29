// P4 · Khách hàng, đơn hàng: danh sách, tạo đơn tay, xác nhận đơn (UC-SF-01, UC-SF-02, UC-SF-04; FE#9)
import { type Page } from '@playwright/test';
import { chon, chu, chua, dangNhap, dong, duongDan, expect, menu, mockApi, test, thayChu, toast } from '../../fixtures';

const CHAN_QUYEN_BAN_HANG = 'Vai trò của bạn trong công ty này không có quyền mở trang này.';

const timKhach = async (page: Page, text: string) => {
  await page.getByLabel('Tìm khách', { exact: true }).fill(text);
  await chua(page, text, '[role=option]').click();
};

/** Thêm biến thể đầu tiên có giá trong kết quả tìm */
const themSanPham = async (page: Page, text: string) => {
  await page.getByLabel('Thêm sản phẩm', { exact: true }).fill(text);
  await page.locator('[role=option][aria-disabled=false]').first().click();
};

const dienGiaoHang = (page: Page) => page.getByLabel('Trả trước', { exact: true }).click();

test.describe('P4 · Khách hàng và đơn hàng', () => {
  test.describe('khách hàng (UC-SF-02)', () => {
    test.beforeEach(async ({ page }) => {
      await dangNhap(page, 'ceo@commerio.vn', 'ceo');
      await menu(page, 'Khách hàng');
      await expect(dong(page, 'cus-001')).toBeAttached();
    });

    test('danh sách chỉ có khách của công ty, tìm theo tên và mở hồ sơ', async ({ page }) => {
      await expect(page.locator('tbody')).not.toContainText('Lý Văn Cường');
      await page.getByPlaceholder(/Tìm/).fill('Châu');
      await expect(dong(page, 'cus-001')).toHaveCount(0);
      await expect(dong(page, 'cus-003')).toContainText('0938765432');
      await dong(page, 'cus-003').click();
      await expect.poll(() => duongDan(page)).toBe('/c/cmp-001/sales/customers/cus-003');
      await thayChu(page, 'Trần Minh Châu', 'h1');
      await thayChu(page, 'Lịch sử đơn');
      await thayChu(page, 'DH-1003', 'a');
    });

    test('khách của công ty khác báo không tìm thấy', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/customers/cus-101');
      await thayChu(page, 'Không tìm thấy', 'h1');
    });
  });

  test.describe('danh sách đơn (UC-SF-04)', () => {
    test.beforeEach(async ({ page }) => {
      await dangNhap(page, 'ceo@commerio.vn', 'ceo');
      await menu(page, 'Đơn hàng');
    });

    test('tab theo 4 trạng thái, giai đoạn suy từ kiện, lọc theo giai đoạn', async ({ page }) => {
      await expect(page.getByRole('tab', { name: 'Tất cả', exact: true })).toHaveAttribute('data-state', 'active');
      await expect(dong(page, 'ord-1003')).toContainText('Chờ thanh toán');
      await expect(dong(page, 'ord-1006')).toContainText('Chờ đóng gói');
      await expect(page.locator('tbody')).not.toContainText('DH-2001');
      await page.getByRole('tab', { name: 'Chưa thanh toán', exact: true }).click();
      await expect(dong(page, 'ord-1003')).toBeAttached();
      await expect(dong(page, 'ord-1006')).toHaveCount(0);
      await page.getByRole('tab', { name: 'Tất cả', exact: true }).click();
      await chon(page, 'Giai đoạn', 'Đang giao');
      await expect(dong(page, 'ord-1016')).toBeAttached();
      await expect(dong(page, 'ord-1003')).toHaveCount(0);
    });
  });

  test.describe('tạo đơn tay (UC-SF-01)', () => {
    test.beforeEach(async ({ page }) => {
      await dangNhap(page, 'sale@commerio.vn', 'sale');
      await menu(page, 'Đơn hàng');
      await page.getByRole('button', { name: 'Tạo đơn', exact: true }).click();
      await expect.poll(() => duongDan(page)).toBe('/c/cmp-001/sales/orders/new');
    });

    test('báo lỗi khi gửi form trống', async ({ page }) => {
      await page.getByRole('button', { name: 'Tạo đơn', exact: true }).click();
      await thayChu(page, 'Chọn khách hàng hoặc tạo khách mới');
      await thayChu(page, 'Thêm ít nhất một sản phẩm');
      await thayChu(page, 'Chọn cách thanh toán');
      await expect.poll(() => duongDan(page)).toBe('/c/cmp-001/sales/orders/new');
    });

    test('khách có sẵn: điền người nhận, chọn lại sản phẩm thì tăng số lượng, tạo đơn', async ({ page }) => {
      await timKhach(page, 'Nguyễn Văn An');
      await expect(page.locator('[data-testid=picked-customer]')).toContainText('0901234567');
      await expect(page.getByLabel('Người nhận', { exact: true })).toHaveValue('Nguyễn Văn An');
      await expect(page.getByLabel('Số điện thoại người nhận', { exact: true })).toHaveValue('0901234567');

      await themSanPham(page, 'Áo thun');
      await themSanPham(page, 'Áo thun');
      await expect(page.locator('[data-testid=order-lines] tbody tr[data-row-id]')).toHaveCount(1);
      await expect(page.getByLabel(/^Số lượng /)).toHaveValue('2');
      await page.getByLabel('Phí giao (đ)', { exact: true }).fill('30000');
      await expect(page.locator('[data-testid=total]')).toHaveText(/\d/);
      await dienGiaoHang(page);
      await page.getByRole('button', { name: 'Tạo đơn', exact: true }).click();
      await toast(page, /Đã tạo đơn DH-\d+/);
      await expect.poll(() => duongDan(page)).toMatch(/\/c\/cmp-001\/sales\/orders\/ord-/);
      await thayChu(page, /Đơn DH-/, 'h1');
      await expect(page.locator('[data-testid=order-status]')).toContainText('Chưa thanh toán');
      await expect(page.locator('[data-testid=order-status]')).toContainText('Chờ thanh toán');
    });

    test('sản phẩm chưa có giá không chọn được', async ({ page }) => {
      await page.getByLabel('Thêm sản phẩm', { exact: true }).fill('Quần');
      // Mục aria-disabled: Playwright coi là bị khoá nên bấm bằng force để kiểm bấm vào cũng không thêm được
      await chua(page, 'Chưa có giá', '[role=option][aria-disabled=true]').click({ force: true });
      await expect(page.locator('[data-testid=order-lines]')).toContainText('Tìm và thêm sản phẩm vào đơn.');
    });

    test('khách mới trùng số điện thoại thì gợi ý dùng khách đã có', async ({ page }) => {
      await page.getByLabel('Khách mới', { exact: true }).click();
      await page.getByLabel('Tên khách', { exact: true }).fill('An Nguyễn');
      await page.getByLabel('Số điện thoại', { exact: true }).fill('0901234567');
      await thayChu(page, 'Đã có khách Nguyễn Văn An với số này.');
      await page.getByRole('button', { name: 'Dùng khách này', exact: true }).click();
      await expect(page.locator('[data-testid=picked-customer]')).toContainText('Nguyễn Văn An');
    });

    test('khách mới: tạo đơn kèm khách', async ({ page }) => {
      await page.getByLabel('Khách mới', { exact: true }).click();
      await page.getByLabel('Tên khách', { exact: true }).fill('Võ Thị Em');
      await page.getByLabel('Số điện thoại', { exact: true }).fill('0911222333');
      await expect(page.getByLabel('Người nhận', { exact: true })).toHaveValue('Võ Thị Em');
      await page.getByLabel('Địa chỉ giao', { exact: true }).fill('12 Lê Lợi, Q1, TP.HCM');
      await themSanPham(page, 'Áo thun');
      await page.getByLabel('Thu khi giao (COD)', { exact: true }).click();
      await page.getByRole('button', { name: 'Tạo đơn', exact: true }).click();
      await toast(page, /Đã tạo đơn DH-/);
      await thayChu(page, 'Võ Thị Em', 'a');
    });

    test('vượt tồn khả dụng thì cảnh báo và hỏi lại trước khi tạo', async ({ page }) => {
      await timKhach(page, 'Trần Minh Châu');
      await themSanPham(page, 'Áo thun');
      await page.getByLabel(/^Số lượng /).fill('9999');
      await thayChu(page, /Chỉ còn \d+ khả dụng/);
      await dienGiaoHang(page);
      await page.getByRole('button', { name: 'Tạo đơn', exact: true }).click();
      const alert = page.getByRole('alertdialog');
      await thayChu(alert, 'Đơn có sản phẩm không đủ hàng, vẫn tạo?');
      await alert.getByRole('button', { name: 'Huỷ', exact: true }).click();
      await expect.poll(() => duongDan(page)).toBe('/c/cmp-001/sales/orders/new');
      await page.getByRole('button', { name: 'Tạo đơn', exact: true }).click();
      await page.getByRole('button', { name: 'Vẫn tạo', exact: true }).click();
      await toast(page, /Đã tạo đơn DH-/);
    });

    test('lỗi từ BE gắn vào ô và báo khách không còn', async ({ page }) => {
      await timKhach(page, 'Trần Minh Châu');
      await themSanPham(page, 'Áo thun');
      await dienGiaoHang(page);
      await mockApi(page, 'post', '/sales/orders', 422, {
        status: 422,
        title: 'Dữ liệu không hợp lệ',
        errors: { 'lines.0.variantId': 'Biến thể đã ngừng bán', 'shippingAddress.address': 'Địa chỉ quá ngắn' },
      });
      await page.getByRole('button', { name: 'Tạo đơn', exact: true }).click();
      await thayChu(page, 'Biến thể đã ngừng bán');
      await thayChu(page, 'Địa chỉ quá ngắn');

      await mockApi(page, 'post', '/sales/orders', 404, { status: 404, title: 'Không tìm thấy', code: 'not_found' });
      await page.getByRole('button', { name: 'Tạo đơn', exact: true }).click();
      await thayChu(page, 'Không tìm thấy khách hàng');
      await expect(page.getByLabel('Tìm khách', { exact: true })).toBeAttached();
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
      await thayChu(page, 'Đơn trả trước sang Đang xử lý khi khách thanh toán.');
      await expect(page.getByRole('button', { name: 'Xác nhận đơn', exact: true })).toHaveCount(0);
    });

    test('đơn vừa bị người khác cập nhật thì báo và tải lại', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1004');
      await expect(page.getByRole('button', { name: 'Xác nhận đơn', exact: true })).toBeAttached();
      await mockApi(page, 'post', '/sales/orders/ord-1004/confirm', 409, { status: 409, code: 'version_conflict' });
      await page.getByRole('button', { name: 'Xác nhận đơn', exact: true }).click();
      await thayChu(page, 'Đơn vừa được người khác cập nhật');
    });

    test('đơn sàn không có nút xác nhận và khung thanh toán', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1005');
      await thayChu(page, 'Đơn sàn: trạng thái thanh toán và giao lấy từ sàn; huỷ đơn sẽ gửi lên sàn.');
      await expect(page.getByRole('button', { name: 'Xác nhận đơn', exact: true })).toHaveCount(0);
      await expect(page.locator('[data-testid=payment-panel]')).toHaveCount(0);
    });
  });

  test.describe('phân quyền và cách ly (AC-R)', () => {
    test('cskh chỉ xem đơn: không tạo, không xác nhận, không tạo mã thanh toán', async ({ page }) => {
      await dangNhap(page, 'cskh@commerio.vn', 'cskh');
      await menu(page, 'Đơn hàng');
      await expect(dong(page, 'ord-1003')).toBeAttached();
      await expect(page.getByRole('button', { name: 'Tạo đơn', exact: true })).toHaveCount(0);
      await dong(page, 'ord-1003').click();
      await thayChu(page, 'Đơn DH-1003', 'h1');
      await expect(page.locator('[data-testid=payment-panel]')).toContainText('Chưa thanh toán');
      await expect(page.getByRole('button', { name: 'Xác nhận đơn', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Tạo mã thanh toán', exact: true })).toHaveCount(0);
    });

    test('kho không thấy menu bán hàng, mở thẳng URL thì bị chặn', async ({ page }) => {
      await dangNhap(page, 'kho@commerio.vn', 'kho');
      const muc = (text: string) => page.locator('[data-sidebar="menu-button"]', { hasText: chu(text) });
      await expect(muc('Đơn hàng')).toHaveCount(0);
      await expect(muc('Khách hàng')).toHaveCount(0);
      await page.goto('/c/cmp-001/sales/orders');
      await thayChu(page, CHAN_QUYEN_BAN_HANG);
      await page.goto('/c/cmp-001/sales/customers');
      await thayChu(page, CHAN_QUYEN_BAN_HANG);
    });

    test('đơn của công ty khác báo không tìm thấy', async ({ page }) => {
      await dangNhap(page, 'ceo@commerio.vn', 'ceo');
      await page.goto('/c/cmp-001/sales/orders/ord-2001');
      await thayChu(page, 'Không tìm thấy', 'h1');
    });
  });
});
