// P4 · Thanh toán: mã thanh toán của đơn, cổng thanh toán, trang kết quả (UC-PF-01, UC-PF-11; FE#9)
import { type Page } from '@playwright/test';
import { chu, chua, dangNhap, duongDan, expect, menu, mockApi, test, thayChu, toast } from '../../fixtures';

const CHAN_QUYEN_THANH_TOAN = 'Vai trò của bạn trong công ty này không có quyền mở trang này.';

const khung = (page: Page) => page.locator('[data-testid=payment-panel]');

const moHopThoaiTaoMa = async (page: Page) => {
  await khung(page).getByRole('button', { name: 'Tạo mã thanh toán', exact: true }).click();
  return page.getByRole('dialog');
};

/** Giả lập khách đã trả (Documents/21 mục 12.11) */
const khachTra = (page: Page, paymentCode: string) =>
  page.evaluate((code) => fetch(`/api/v1/payment/dev/simulate/${code}`, { method: 'POST' }).then(() => undefined), paymentCode);

test.describe('P4 · Thanh toán', () => {
  test.describe('mã thanh toán của đơn (UC-PF-11)', () => {
    test.beforeEach(({ page }) => dangNhap(page, 'sale@commerio.vn', 'sale'));

    test('tạo mã VietQR: QR, chuyển khoản, đếm ngược; khách trả thì đổi sang đã thanh toán', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1003');
      await expect(khung(page)).toContainText('Chưa thanh toán');
      const dialog = await moHopThoaiTaoMa(page);
      await expect(dialog.getByLabel('MoMo', { exact: true })).toBeDisabled();
      await expect(dialog.getByLabel('ZaloPay', { exact: true })).toBeDisabled();
      await thayChu(dialog, 'Chưa cấu hình');
      await dialog.getByLabel('VietQR', { exact: true }).click();
      await dialog.getByRole('button', { name: 'Tạo mã', exact: true }).click();
      await toast(page, 'Đã tạo mã thanh toán');
      const link = page.locator('[data-testid=active-link]');
      await expect(link.locator('svg[aria-label^="QR thanh toán"]')).toBeAttached();
      await expect(link.locator('[data-testid=countdown]')).toHaveText(/^\d{2}:\d{2}/);
      await expect(link.locator('[data-testid=bank-transfer]')).toContainText('Vietcombank');
      await expect(link.locator('[data-testid=bank-transfer]')).toContainText('0071000123456');
      await expect(link.getByRole('button', { name: 'Sao chép số tài khoản', exact: true })).toBeAttached();
      await expect(link.getByRole('button', { name: 'Sao chép nội dung chuyển khoản', exact: true })).toBeAttached();
      await expect(khung(page).getByRole('button', { name: 'Tạo mã thanh toán', exact: true })).toHaveCount(0);

      await khachTra(page, (await page.locator('[data-testid=payment-code]').textContent()) ?? '');
      // Chưa có SSE: khung hỏi lại mỗi 5 giây
      await expect(chua(khung(page), 'Đã nhận tiền lúc')).toBeAttached({ timeout: 10000 });
      await expect(khung(page)).toContainText('Đã thanh toán');
      await expect(link).toHaveCount(0);
    });

    test('cổng VNPay có link để sao chép, không có thông tin chuyển khoản', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1003');
      const dialog = await moHopThoaiTaoMa(page);
      await dialog.getByLabel('VNPay', { exact: true }).click();
      await dialog.getByRole('button', { name: 'Tạo mã', exact: true }).click();
      const link = page.locator('[data-testid=active-link]');
      await expect(link.getByRole('button', { name: 'Sao chép link thanh toán', exact: true })).toContainText('Sao chép link');
      await expect(link.locator('[data-testid=bank-transfer]')).toHaveCount(0);
    });

    test('lỗi khi tạo mã giữ hộp thoại mở', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1003');
      const dialog = await moHopThoaiTaoMa(page);
      await dialog.getByRole('button', { name: 'Tạo mã', exact: true }).click();
      await expect(dialog).toContainText('Chọn cổng thanh toán');
      await dialog.getByLabel('VNPay', { exact: true }).click();

      await mockApi(page, 'post', '/payment/orders/ord-1003/links', 502, { status: 502, code: 'gateway_unavailable' });
      await dialog.getByRole('button', { name: 'Tạo mã', exact: true }).click();
      await expect(dialog).toContainText('Cổng thanh toán đang lỗi, thử lại sau hoặc chọn cổng khác');

      await mockApi(page, 'post', '/payment/orders/ord-1003/links', 422, {
        status: 422,
        code: 'gateway_not_configured',
        errors: { gateway: 'Cổng này chưa được cấu hình' },
      });
      await dialog.getByRole('button', { name: 'Tạo mã', exact: true }).click();
      await expect(dialog).toContainText('Cổng này chưa được cấu hình');

      await mockApi(page, 'post', '/payment/orders/ord-1003/links', 409, {
        status: 409,
        code: 'payment_not_allowed',
        detail: 'Đơn đã được thanh toán.',
      });
      await dialog.getByRole('button', { name: 'Tạo mã', exact: true }).click();
      await expect(dialog).toContainText('Đơn đã được thanh toán.');
    });

    test('BE trả mã còn hiệu lực (200) thì báo đơn đã có mã', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1003');
      await (await moHopThoaiTaoMa(page)).getByLabel('VNPay', { exact: true }).click();
      await mockApi(page, 'post', '/payment/orders/ord-1003/links', 200, {
        id: 'pay-x',
        orderId: 'ord-1003',
        gateway: 'vnpay',
        paymentCode: 'CMRXXXXXXXXX',
        amount: 330000,
        payUrl: null,
        qrContent: 'CMRXXXXXXXXX',
        bankTransfer: null,
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        status: 'active',
        createdAt: new Date().toISOString(),
        createdBy: { id: 'acc-x', name: 'Người khác' },
      });
      await page.getByRole('dialog').getByRole('button', { name: 'Tạo mã', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(khung(page)).toContainText('Đơn đã có mã thanh toán còn hiệu lực');
    });

    test('mã cũ hết hạn thì cho tạo lại; lịch sử mã thu gọn mặc định', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1007');
      await expect(khung(page)).toContainText('Mã đã hết hạn');
      const history = page.locator('[data-testid=link-history]');
      await expect(history).toHaveCount(0);
      await khung(page).getByRole('button', { name: /Lịch sử mã/ }).click();
      await expect(history).toContainText('CMR4XN8PAD6E');
      await expect(history).toContainText('Hết hạn');
      await khung(page).getByRole('button', { name: 'Tạo lại', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('VietQR', { exact: true }).click();
      await dialog.getByRole('button', { name: 'Tạo mã', exact: true }).click();
      await expect(page.locator('[data-testid=active-link]')).toBeAttached();
      await expect(khung(page)).not.toContainText('Mã đã hết hạn');
    });

    test('đơn đã trả và đơn COD không có nút tạo mã', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1006');
      await expect(khung(page)).toContainText('Đã thanh toán');
      await expect(khung(page)).toContainText('Đã nhận tiền lúc');
      await expect(khung(page).getByRole('button', { name: 'Tạo mã thanh toán', exact: true })).toHaveCount(0);
      await page.goto('/c/cmp-001/sales/orders/ord-1008');
      await expect(khung(page)).toContainText('Chờ thu COD');
      await expect(khung(page).getByRole('button', { name: 'Tạo mã thanh toán', exact: true })).toHaveCount(0);
    });
  });

  test.describe('cổng thanh toán (UC-PF-01)', () => {
    test.beforeEach(async ({ page }) => {
      await dangNhap(page, 'ceo@commerio.vn', 'ceo');
      await menu(page, 'Cổng thanh toán');
      await expect.poll(() => duongDan(page)).toBe('/c/cmp-001/settings/payment-gateways');
    });

    test('4 cổng với trạng thái, khoá che, webhook VietQR', async ({ page }) => {
      const vnpay = page.locator('[data-testid=gateway-vnpay]');
      await expect(vnpay).toContainText('Đã cấu hình');
      await expect(vnpay).toContainText('••••4821');
      await expect(vnpay).not.toContainText('SANDBOXHASHSECRET4821');
      await expect(page.locator('[data-testid=gateway-momo]')).toContainText('Chưa cấu hình');
      await expect(page.locator('[data-testid=gateway-zalopay]')).toContainText('Chưa cấu hình');
      const vietqr = page.locator('[data-testid=gateway-vietqr]');
      await thayChu(vietqr, 'Vietcombank');
      await expect(vietqr.locator('[data-testid=webhook-url]')).toHaveText(/^https:\/\/.+\/sepay\//);
      await expect(vietqr.getByRole('button', { name: 'Sao chép URL webhook', exact: true })).toBeAttached();
      await thayChu(vietqr, 'Dán URL này vào SePay');
    });

    test('cấu hình cổng mới: form trống, ô ẩn ký tự, bắt buộc đủ ô', async ({ page }) => {
      await page.locator('[data-testid=gateway-momo]').getByRole('button', { name: 'Cấu hình', exact: true }).click();
      const dialog = page.getByRole('dialog');
      const secret = dialog.getByLabel('Secret Key', { exact: true });
      await expect(secret).toHaveValue('');
      await expect(secret).toHaveAttribute('type', 'password');
      await dialog.getByRole('button', { name: 'Lưu khoá', exact: true }).click();
      await thayChu(dialog, 'Bắt buộc nhập');
      await dialog.getByLabel('Partner Code', { exact: true }).fill('MOMOTEST01');
      await dialog.getByLabel('Access Key', { exact: true }).fill('ACCESSKEY9001');
      await secret.fill('SECRETKEY5555');
      await dialog.getByRole('button', { name: 'Hiện mật khẩu', exact: true }).last().click();
      await expect(secret).toHaveAttribute('type', 'text');
      await dialog.getByRole('button', { name: 'Lưu khoá', exact: true }).click();
      await toast(page, 'Đã lưu khoá cổng MoMo');
      const momo = page.locator('[data-testid=gateway-momo]');
      await expect(momo).toContainText('Đã cấu hình');
      await expect(momo).toContainText('••••5555');
      await expect(momo.getByRole('button', { name: 'Thay khoá', exact: true })).toBeAttached();
    });

    test('khoá vừa bị người khác đổi thì báo xung đột', async ({ page }) => {
      await page.locator('[data-testid=gateway-vnpay]').getByRole('button', { name: 'Thay khoá', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByLabel('Mã website (TMN Code)', { exact: true })).toHaveValue('');
      await dialog.getByLabel('Mã website (TMN Code)', { exact: true }).fill('NEWTMN01');
      await dialog.getByLabel('Chuỗi bí mật (Hash Secret)', { exact: true }).fill('NEWHASH0001');
      await mockApi(page, 'put', '/payment/gateways/vnpay', 409, { status: 409, code: 'version_conflict' });
      await dialog.getByRole('button', { name: 'Lưu khoá', exact: true }).click();
      await expect(dialog).toContainText('Khoá vừa được người khác đổi');
    });
  });

  test.describe('phân quyền và trang kết quả', () => {
    test('sale không thấy menu cổng thanh toán, mở URL thì bị chặn', async ({ page }) => {
      await dangNhap(page, 'sale@commerio.vn', 'sale');
      await expect(page.locator('[data-sidebar="menu-button"]', { hasText: chu('Cổng thanh toán') })).toHaveCount(0);
      await page.goto('/c/cmp-001/settings/payment-gateways');
      await thayChu(page, CHAN_QUYEN_THANH_TOAN);
    });

    test('trang kết quả không đọc tham số cổng trả về', async ({ page }) => {
      await page.goto('/thanh-toan/ket-qua?vnp_ResponseCode=24&vnp_TxnRef=CMRABC');
      await thayChu(page, 'Đã nhận yêu cầu thanh toán. Cửa hàng sẽ xác nhận khi nhận được tiền.');
      await expect(page.locator('body')).not.toContainText('CMRABC');
    });
  });
});
