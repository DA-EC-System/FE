// P4 · Xử lý đơn theo kiện (sơ đồ D1, D2; FE#59): huỷ đơn, hàng đợi kiện, quét đóng gói, bàn giao, cập nhật giao
import { type Page } from '@playwright/test';
import { chua, dangNhap, dong, expect, menu, mockApi, test, thayChu, toast } from '../../fixtures';

const CHAN_QUYEN = 'Vai trò của bạn trong công ty này không có quyền mở trang này.';

const khung = (page: Page) => page.locator('[data-testid=payment-panel]');
const lichSu = (page: Page) => page.locator('[data-testid=status-history] li').first();
const kienCuaDon = (page: Page) => page.locator('[data-testid=order-packages] tbody tr').first();
const trangThaiKien = (page: Page) => page.locator('[data-testid=package-status]');
const nutKien = (page: Page, name: string) =>
  page.locator('[data-testid=package-actions]').getByRole('button', { name, exact: true });
// Hộp xác nhận (ConfirmDialog) là alertdialog, hộp nhập liệu là dialog
const menuThanhBen = (page: Page, label: string) =>
  page.locator('[data-sidebar="menu-button"]', { hasText: new RegExp(`^\\s*${label}\\s*$`) });
/** Cha, phần tử ngay sau của phần tử chứa chữ (như `cy.contains(text).parent()`, `.next()`) */
const chaCua = (page: Page, text: string) => chua(page, text).locator('..');
const sauCua = (page: Page, text: string) => chua(page, text).locator('xpath=following-sibling::*[1]');

/** Quét đủ mọi dòng của kiện ở màn đóng gói */
const quetDu = async (page: Page) => {
  const rows = page.locator('[data-testid=pack-lines] tbody tr');
  await expect(rows.first()).toBeAttached();
  for (const tr of await rows.all()) {
    const sku = (await tr.getAttribute('data-row-id')) ?? '';
    const qty = Number((await tr.locator('td').last().textContent())?.split('/')[1]);
    for (let i = 0; i < qty; i++) {
      await page.locator('#scan-sku').fill(sku);
      await page.locator('#scan-sku').press('Enter');
    }
  }
};

/** Thay window.open (in vận đơn mở cửa sổ mới), đếm số lần gọi */
const chanCuaSoIn = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __soLanMo: number; open: () => unknown };
    w.__soLanMo = 0;
    w.open = () => {
      w.__soLanMo++;
      return {};
    };
  });
const soLanMo = (page: Page) => page.evaluate(() => (window as unknown as { __soLanMo: number }).__soLanMo);

test.describe('P4 · Xử lý đơn', () => {
  test.describe('huỷ đơn (sơ đồ D1)', () => {
    test.beforeEach(({ page }) => dangNhap(page, 'sale@commerio.vn', 'sale'));

    test('huỷ đơn có mã thanh toán đang hiệu lực', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1003');
      await khung(page).getByRole('button', { name: 'Tạo mã thanh toán', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('VietQR', { exact: true }).click();
      await dialog.getByRole('button', { name: 'Tạo mã', exact: true }).click();
      await expect(page.locator('[data-testid=active-link]')).toBeAttached();

      await page.getByRole('button', { name: 'Huỷ đơn', exact: true }).click();
      await thayChu(dialog, 'Mã thanh toán còn hiệu lực (nếu có) bị huỷ.');
      await dialog.getByLabel('Lý do huỷ', { exact: true }).fill('Khách đổi ý');
      await dialog.getByRole('button', { name: 'Huỷ đơn', exact: true }).click();
      await toast(page, 'Đã huỷ đơn DH-1003');
      await expect(dialog).toHaveCount(0);
      await expect(chaCua(page, 'Lý do huỷ')).toContainText('Khách đổi ý');
      await expect(lichSu(page)).toContainText('Đã huỷ');
      await expect(lichSu(page)).toContainText('Lý do: Khách đổi ý');
      await expect(kienCuaDon(page)).toContainText('Đã huỷ');
      await expect(page.locator('[data-testid=active-link]')).toHaveCount(0);
      await chua(khung(page), 'Lịch sử mã').click();
      await expect(page.locator('[data-testid=link-history]')).toContainText('Đã huỷ');
      await expect(page.getByRole('button', { name: 'Huỷ đơn', exact: true })).toHaveCount(0);
    });

    test('đơn đã thanh toán sau khi huỷ thì chờ hoàn tiền', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1006');
      await page.getByRole('button', { name: 'Huỷ đơn', exact: true }).click();
      await page.getByLabel('Lý do huỷ', { exact: true }).fill('Hết hàng');
      await page.getByRole('dialog').getByRole('button', { name: 'Huỷ đơn', exact: true }).click();
      await toast(page, 'Đã huỷ đơn DH-1006');
      await expect(khung(page)).toContainText('Chờ hoàn tiền');
    });

    test('bỏ trống lý do thì báo lỗi, không gọi API', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1003');
      await page.getByRole('button', { name: 'Huỷ đơn', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Huỷ đơn', exact: true }).click();
      await thayChu(dialog, 'Nhập lý do huỷ');
      await expect(dialog).toBeAttached();
      await expect(page.locator('[data-testid=order-status]')).toContainText('Chưa thanh toán');
    });

    test('BE báo đơn đã đổi trạng thái thì đóng hộp thoại và tải lại', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1013');
      await expect(page.getByRole('button', { name: 'Huỷ đơn', exact: true })).toBeAttached();
      await mockApi(page, 'post', '/sales/orders/ord-1013/cancel', 409, { status: 409, code: 'already_handed_over' });
      await page.getByRole('button', { name: 'Huỷ đơn', exact: true }).click();
      await page.getByLabel('Lý do huỷ', { exact: true }).fill('Khách đổi ý');
      await page.getByRole('dialog').getByRole('button', { name: 'Huỷ đơn', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await thayChu(page, 'Đơn vừa được người khác cập nhật');
    });

    test('đơn đã có kiện bàn giao thì không huỷ được', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1016');
      await expect(kienCuaDon(page)).toContainText('Đang giao');
      await expect(page.getByRole('button', { name: 'Huỷ đơn', exact: true })).toHaveCount(0);
    });

    test('đơn sàn khách đang xin huỷ: có ghi chú, chỉ trả lời yêu cầu, không tự huỷ', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1015');
      await thayChu(page, 'Đơn sàn: trạng thái thanh toán và giao lấy từ sàn; huỷ đơn sẽ gửi lên sàn.');
      await expect(page.locator('[data-testid=order-status]')).toContainText('Đang xử lý');
      await expect(page.locator('[data-testid=order-status]')).toContainText('Sàn: AWAITING_COLLECTION');
      await expect(page.locator('[data-testid=cancel-request]')).toContainText('Khách xin huỷ đơn trên sàn');
      await expect(page.getByRole('button', { name: 'Huỷ đơn', exact: true })).toHaveCount(0);
    });
  });

  test.describe('thao tác đơn sàn (§19.3)', () => {
    test.beforeEach(({ page }) => dangNhap(page, 'ceo@commerio.vn', 'ceo'));

    test('huỷ đơn sàn theo lý do của sàn, kiện đã đóng gói chờ mở', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1012');
      await page.getByRole('button', { name: 'Huỷ đơn', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await thayChu(dialog, 'Huỷ đơn sàn DH-1012');
      await dialog.getByRole('button', { name: 'Huỷ đơn', exact: true }).click();
      await thayChu(dialog, 'Chọn lý do huỷ');
      await dialog.getByLabel('Hết hàng', { exact: true }).click();
      await dialog.getByRole('button', { name: 'Huỷ đơn', exact: true }).click();
      await toast(page, 'Đã huỷ đơn DH-1012 trên sàn, còn 1 kiện chờ mở');
      await expect(page.locator('[data-testid=order-status]')).toContainText('Đang huỷ');
      await expect(page.getByRole('button', { name: 'Huỷ đơn', exact: true })).toHaveCount(0);
    });

    test('sàn từ chối huỷ thì báo lý do của sàn, không cho chọn', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1012');
      await expect(page.getByRole('button', { name: 'Huỷ đơn', exact: true })).toBeAttached();
      await mockApi(page, 'get', '/sales/orders/ord-1012/cancel-reasons', 409, {
        status: 409,
        code: 'marketplace_rejected',
        platformMessage: 'Order is already packed',
      });
      await page.getByRole('button', { name: 'Huỷ đơn', exact: true }).click();
      await expect(page.locator('[data-testid=cancel-rejected]')).toContainText('Sàn báo: Order is already packed');
      await expect(page.getByRole('dialog').getByLabel('Hết hàng', { exact: true })).toHaveCount(0);
    });

    test('đồng ý yêu cầu huỷ của khách', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1015');
      await page.locator('[data-testid=cancel-request]').getByRole('button', { name: 'Đồng ý huỷ', exact: true }).click();
      const alert = page.getByRole('alertdialog');
      await thayChu(alert, 'Đồng ý huỷ đơn DH-1015?');
      await alert.getByRole('button', { name: 'Đồng ý huỷ', exact: true }).click();
      await toast(page, 'Đã đồng ý huỷ đơn DH-1015');
      await expect(page.locator('[data-testid=cancel-request]')).toHaveCount(0);
      await expect(page.locator('[data-testid=order-status]')).toContainText('huỷ');
    });

    test('từ chối yêu cầu huỷ thì đơn tiếp tục xử lý', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1015');
      await page.locator('[data-testid=cancel-request]').getByRole('button', { name: 'Từ chối', exact: true }).click();
      await toast(page, 'Đã từ chối yêu cầu huỷ');
      await expect(page.locator('[data-testid=cancel-request]')).toHaveCount(0);
      await expect(page.locator('[data-testid=order-status]')).toContainText('Đang xử lý');
      await expect(page.getByRole('button', { name: 'Huỷ đơn', exact: true })).toBeAttached();
    });

    test('nhập số hoá đơn', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1015');
      await expect(page.locator('[data-testid=invoice-number]')).toContainText('HD-2026-0015');
      await page.getByRole('button', { name: 'Sửa số hoá đơn', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Số hoá đơn', { exact: true }).fill('');
      await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
      await thayChu(dialog, 'Nhập số hoá đơn');
      await dialog.getByLabel('Số hoá đơn', { exact: true }).fill('HD-2026-0099');
      await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
      await toast(page, 'Đã lưu số hoá đơn HD-2026-0099');
      await expect(page.locator('[data-testid=invoice-number]')).toContainText('HD-2026-0099');
    });

    test('đóng gói kiện sàn chọn đơn vị vận chuyển rồi in vận đơn', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1012');
      await chua(page, 'Đã giữ hàng', '[data-testid=order-packages] tbody tr').locator('a').click();
      await nutKien(page, 'Đóng gói').click();
      const carrier = page.locator('[data-testid=pack-carrier]');
      await thayChu(carrier, '(mặc định)');
      await expect(carrier.locator('[role=radio][data-state=checked]')).toHaveCount(1);
      await carrier.locator('[role=radio][data-state=unchecked]').first().click();
      const id = await carrier.locator('[role=radio][data-state=checked]').getAttribute('id');
      const ten = (await page.locator(`label[for="${id}"]`).textContent()) ?? '';
      await quetDu(page);
      await page.getByRole('button', { name: 'Đóng gói', exact: true }).click();
      await toast(page, /Đã đóng gói kiện/);
      await expect(trangThaiKien(page)).toContainText('Đã đóng gói');
      await expect(page.locator('[data-testid=package-carrier]')).toContainText(ten.trim());
      await expect(sauCua(page, 'Mã kiện sàn')).not.toContainText('—');

      await chanCuaSoIn(page);
      await nutKien(page, 'In vận đơn').click();
      await expect.poll(() => soLanMo(page)).toBe(1);
    });
  });

  test.describe('huỷ đơn có kiện đã đóng gói (sơ đồ D1, D2)', () => {
    test('đơn Đang huỷ tới khi mở kiện', async ({ page }) => {
      await dangNhap(page, 'ceo@commerio.vn', 'ceo');
      await page.goto('/c/cmp-001/fulfillment/packages/pkg-1010/pack');
      await quetDu(page);
      await page.getByRole('button', { name: 'Đóng gói', exact: true }).click();
      await toast(page, 'Đã đóng gói kiện');
      await chua(page, 'DH-1010', 'a').click();
      await page.getByRole('button', { name: 'Huỷ đơn', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await thayChu(dialog, '1 kiện đã đóng gói phải mở');
      await dialog.getByLabel('Lý do huỷ', { exact: true }).fill('Khách đổi ý');
      await dialog.getByRole('button', { name: 'Huỷ đơn', exact: true }).click();
      await toast(page, 'Đã huỷ đơn DH-1010, còn 1 kiện chờ mở');
      await expect(page.locator('[data-testid=order-status]')).toContainText('Đang huỷ');
      await expect(kienCuaDon(page)).toContainText('Chờ mở kiện');
      await kienCuaDon(page).locator('a').click();
      await nutKien(page, 'Mở kiện, huỷ').click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Mở kiện, huỷ', exact: true }).click();
      await expect(trangThaiKien(page)).toContainText('Đã huỷ');
      await chua(page, 'DH-1010', 'a').click();
      await expect(page.locator('[data-testid=order-status]')).toContainText('Đã huỷ');
      await expect(page.locator('[data-testid=order-status]')).not.toContainText('Đang huỷ');
    });
  });

  test.describe('hàng đợi kiện (sơ đồ D2)', () => {
    test.beforeEach(async ({ page }) => {
      await dangNhap(page, 'kho@commerio.vn', 'kho');
      await menu(page, 'Kiện hàng');
      await expect(dong(page, 'pkg-1006')).toBeAttached();
    });

    test('Cần đóng gói chỉ có kiện của đơn đang xử lý; danh sách nhặt gộp kiện chọn', async ({ page }) => {
      await expect(page.getByRole('tab', { name: /Cần đóng gói/ })).toHaveAttribute('data-state', 'active');
      await expect(dong(page, 'pkg-1003')).toHaveCount(0);
      await expect(dong(page, 'pkg-1004')).toHaveCount(0);
      await page.getByRole('checkbox', { name: 'Chọn KH-000010', exact: true }).click();
      await page.getByRole('checkbox', { name: 'Chọn KH-000011', exact: true }).click();
      await page.getByRole('button', { name: 'Danh sách nhặt (2 kiện)', exact: true }).click();
      await thayChu(page, 'Danh sách nhặt · 2 kiện đã chọn');
      const rows = page.locator('[data-testid=pick-list] tbody tr');
      await expect(rows).toHaveCount(2);
      await expect(rows.first()).toContainText('3');
      await expect(rows.first()).toContainText('2');
      await expect(page.getByRole('button', { name: 'In', exact: true })).toBeAttached();
    });

    test('quét đóng gói đủ món, báo sàn sẵn sàng rồi bàn giao', async ({ page }) => {
      await dong(page, 'pkg-1010').click();
      await thayChu(page, 'Kiện KH-000010', 'h1');
      await expect(trangThaiKien(page)).toContainText('Đã giữ hàng');
      await nutKien(page, 'Đóng gói').click();
      await thayChu(page, 'Đóng gói kiện KH-000010', 'h1');
      await expect(page.getByRole('button', { name: 'Đóng gói', exact: true })).toBeDisabled();
      await page.locator('#scan-sku').fill('KHONG-CO');
      await page.locator('#scan-sku').press('Enter');
      await thayChu(page, 'KHONG-CO không có trong kiện');
      await quetDu(page);
      await page.getByRole('button', { name: 'Đóng gói', exact: true }).click();
      await toast(page, 'Đã đóng gói kiện KH-000010');
      await expect(trangThaiKien(page)).toContainText('Đã đóng gói');

      await nutKien(page, 'Báo sàn sẵn sàng').click();
      await expect(trangThaiKien(page)).toContainText('Chờ lấy hàng');
      await expect(sauCua(page, 'Mã vận đơn')).not.toContainText('—');
      await nutKien(page, 'Bàn giao').click();
      await toast(page, 'Đã bàn giao kiện KH-000010');
      await expect(trangThaiKien(page)).toContainText('Đang giao');
      await expect(page.locator('[data-testid=status-history]')).toContainText('Chờ lấy hàng');
    });

    test('kiện chưa thanh toán không vào được màn đóng gói', async ({ page }) => {
      await page.goto('/c/cmp-001/fulfillment/packages/pkg-1003/pack');
      await thayChu(page, 'Kiện KH-000003 không ở bước đóng gói');
    });

    test('bàn giao hàng loạt ở Chờ lấy hàng', async ({ page }) => {
      await page.getByRole('tab', { name: /Chờ lấy hàng/ }).click();
      await expect.poll(() => new URL(page.url()).search).toContain('tab=awaiting_pickup');
      await expect(page.getByRole('button', { name: /Bàn giao/ })).toBeDisabled();
      await dong(page, 'pkg-1015').locator('[role=checkbox]').click();
      await page.getByRole('button', { name: 'Bàn giao (1)', exact: true }).click();
      const alert = page.getByRole('alertdialog');
      await thayChu(alert, 'Bàn giao 1 kiện');
      await alert.getByRole('button', { name: 'Bàn giao', exact: true }).click();
      await toast(page, 'Đã bàn giao 1 kiện');
      await expect(dong(page, 'pkg-1015')).toHaveCount(0);
      await page.getByRole('tab', { name: /Đang giao/ }).click();
      await expect(dong(page, 'pkg-1015')).toBeAttached();
    });

    test('kiện bàn giao lỗi giữ lại, có lý do ở từng kiện', async ({ page }) => {
      await page.getByRole('tab', { name: /Chờ lấy hàng/ }).click();
      await dong(page, 'pkg-1015').locator('[role=checkbox]').click();
      await mockApi(page, 'post', '/fulfillment/packages/hand-over', 200, {
        handedOver: [],
        failed: [{ packageId: 'pkg-1015', code: 'version_conflict', detail: 'vừa được cập nhật' }],
      });
      await page.getByRole('button', { name: 'Bàn giao (1)', exact: true }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Bàn giao', exact: true }).click();
      await thayChu(page, '1 kiện chưa bàn giao được');
      await expect(dong(page, 'pkg-1015')).toContainText('Kiện vừa được cập nhật');
      await expect(page.getByRole('button', { name: 'Bàn giao (1)', exact: true })).toBeAttached();
    });

    test('in vận đơn hàng loạt ở Đã đóng gói', async ({ page }) => {
      await page.getByRole('tab', { name: /Đã đóng gói/ }).click();
      await expect(page.getByRole('button', { name: /In vận đơn/ })).toBeDisabled();
      await chua(page, 'DH-1012', 'tbody tr').locator('[role=checkbox]').click();
      await chanCuaSoIn(page);
      await page.getByRole('button', { name: 'In vận đơn (1)', exact: true }).click();
      await expect.poll(() => soLanMo(page)).toBe(1);
    });

    test('kiện chưa có mã kiện sàn thì báo chưa in được', async ({ page }) => {
      await page.getByRole('tab', { name: /Chờ lấy hàng/ }).click();
      await dong(page, 'pkg-1015').locator('[role=checkbox]').click();
      await mockApi(page, 'get', '/fulfillment/packages/documents', 409, {
        status: 409,
        code: 'document_not_ready',
        detail: 'Kiện KH-000015 chưa có mã kiện sàn.',
      });
      await page.getByRole('button', { name: 'In vận đơn (1)', exact: true }).click();
      await toast(page, /vận đơn/i);
    });

    test('kiện đơn sàn đã đóng gói mở lại về Đã giữ hàng', async ({ page }) => {
      await page.getByRole('tab', { name: /Đã đóng gói/ }).click();
      await page.locator('tbody tr[data-row-id]').first().click();
      await expect(trangThaiKien(page)).toContainText('Đã đóng gói');
      await nutKien(page, 'Mở kiện').click();
      const alert = page.getByRole('alertdialog');
      await thayChu(alert, 'Kiện về Đã giữ hàng');
      await alert.getByRole('button', { name: 'Mở kiện', exact: true }).click();
      await expect(trangThaiKien(page)).toContainText('Đã giữ hàng');
    });

    test('báo thất lạc chờ người thứ hai xác nhận', async ({ page }) => {
      await page.getByRole('tab', { name: /Đang giao/ }).click();
      await dong(page, 'pkg-1016').click();
      await nutKien(page, 'Báo thất lạc').click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
      await thayChu(dialog, 'Nhập mã khiếu nại');
      await dialog.getByLabel('Mã khiếu nại với đơn vị vận chuyển', { exact: true }).fill('KN-001');
      await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
      await toast(page, /Đã báo thất lạc KH-\d+, chờ người khác xác nhận/);
      await thayChu(page, 'mã khiếu nại KN-001. Cần người khác xác nhận.');
      await expect(trangThaiKien(page)).toContainText('Báo thất lạc');
      // Người báo không tự xác nhận được: không còn nút nào
      await expect(page.getByRole('button', { name: 'Báo thất lạc', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Xác nhận thất lạc', exact: true })).toHaveCount(0);
    });

    test('kiện không có thì báo không tìm thấy', async ({ page }) => {
      await page.goto('/c/cmp-001/fulfillment/packages/pkg-999');
      await thayChu(page, 'Không tìm thấy kiện');
    });
  });

  test.describe('chia kiện (sơ đồ D2)', () => {
    test('chia kiện hai món thành hai kiện', async ({ page }) => {
      await dangNhap(page, 'ceo@commerio.vn', 'ceo');
      await page.goto('/c/cmp-001/sales/orders/ord-1010');
      await expect(page.locator('[data-testid=order-packages] tbody tr')).toHaveCount(1);
      await kienCuaDon(page).getByRole('button', { name: 'Chia kiện', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('button', { name: 'Chia kiện', exact: true })).toBeDisabled();
      await dialog.locator('[data-testid=split-lines] tbody tr').first().locator('input').fill('1');
      await dialog.getByRole('button', { name: 'Chia kiện', exact: true }).click();
      await toast(page, /Đã chia kiện KH-/);
      await expect(page.locator('[data-testid=order-packages] tbody tr')).toHaveCount(2);
      await expect(page.locator('[data-testid=order-packages]').getByRole('button', { name: 'Chia kiện', exact: true })).toHaveCount(0);
    });

    test('sale không có quyền kho thì không thấy nút chia kiện', async ({ page }) => {
      await dangNhap(page, 'sale@commerio.vn', 'sale');
      await page.goto('/c/cmp-001/sales/orders/ord-1010');
      await expect(kienCuaDon(page)).toContainText('KH-000010');
      await expect(kienCuaDon(page).locator('a')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Chia kiện', exact: true })).toHaveCount(0);
    });
  });

  test.describe('cập nhật giao theo kiện (sơ đồ D2)', () => {
    test.beforeEach(({ page }) => dangNhap(page, 'sale@commerio.vn', 'sale'));

    test('kiện đang giao sang đã giao, đơn chờ hết hạn trả hàng', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1016');
      await kienCuaDon(page).getByRole('button', { name: 'Cập nhật giao', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByLabel('Giao lại', { exact: true })).toHaveCount(0);
      await expect(dialog.getByLabel('Hoàn về', { exact: true })).toBeAttached();
      await dialog.getByLabel('Đã giao', { exact: true }).click();
      await expect(dialog.getByLabel('Lý do', { exact: true })).toHaveCount(0);
      await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
      await toast(page, 'Đã cập nhật kiện KH-000017: Đã giao');
      await expect(kienCuaDon(page)).toContainText('Đã giao');
      await expect(kienCuaDon(page).getByRole('button', { name: 'Cập nhật giao', exact: true })).toHaveCount(0);
      await expect(page.locator('[data-testid=order-status]')).toContainText('Chờ hoàn tất');
      await thayChu(page, 'Chưa hoàn tất:');
    });

    test('tự giao thất bại: bắt lý do, sau đó giao lại', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1017');
      await expect(kienCuaDon(page)).toContainText('Đang tự giao');
      await kienCuaDon(page).getByRole('button', { name: 'Cập nhật giao', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Giao thất bại', { exact: true }).click();
      await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
      await thayChu(dialog, 'Nhập lý do giao không thành công');
      await dialog.getByLabel('Lý do', { exact: true }).fill('Khách không nghe máy');
      await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
      await toast(page, 'Đã cập nhật kiện KH-000018: Giao thất bại');
      await expect(kienCuaDon(page)).toContainText('Giao thất bại');
      await expect(page.locator('[data-testid=order-status]')).toContainText('Giao thất bại');

      await kienCuaDon(page).getByRole('button', { name: 'Cập nhật giao', exact: true }).click();
      await dialog.getByLabel('Giao lại', { exact: true }).click();
      await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
      await toast(page, 'Đã cập nhật kiện KH-000018: Giao lại');
      await expect(kienCuaDon(page)).toContainText('Đang tự giao');
    });

    test('kiện đơn sàn không có nút cập nhật', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1002');
      await expect(page.locator('[data-testid=order-packages]')).toBeAttached();
      await expect(page.getByRole('button', { name: 'Cập nhật giao', exact: true })).toHaveCount(0);
    });
  });

  test.describe('phân quyền (AC-R1)', () => {
    test('kho thấy Kiện hàng, không thấy Đơn hàng', async ({ page }) => {
      await dangNhap(page, 'kho@commerio.vn', 'kho');
      await expect(menuThanhBen(page, 'Kiện hàng').first()).toBeAttached();
      await expect(menuThanhBen(page, 'Đơn hàng')).toHaveCount(0);
    });

    for (const [email, password] of [
      ['sale@commerio.vn', 'sale'],
      ['admin@commerio.vn', 'admin'],
    ]) {
      test(`${password} không thấy Kiện hàng, mở URL thì bị chặn`, async ({ page }) => {
        await dangNhap(page, email, password);
        await expect(menuThanhBen(page, 'Kiện hàng')).toHaveCount(0);
        await page.goto('/c/cmp-001/fulfillment/packages');
        await thayChu(page, CHAN_QUYEN);
        await page.goto('/c/cmp-001/fulfillment/packages/pkg-1006');
        await thayChu(page, CHAN_QUYEN);
      });
    }

    test('ceo thấy cả Đơn hàng và Kiện hàng', async ({ page }) => {
      await dangNhap(page, 'ceo@commerio.vn', 'ceo');
      await expect(menuThanhBen(page, 'Đơn hàng').first()).toBeAttached();
      await expect(menuThanhBen(page, 'Kiện hàng').first()).toBeAttached();
    });
  });
});
