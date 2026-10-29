// P4 · Tài chính: chứng từ, phiếu chi, thu COD, hoàn tiền, khoản thu chưa khớp, giao dịch cổng (UC-PF-03..07; FE#12)
import { type Page } from '@playwright/test';
import { chon, chu, chua, dangNhap, dong, duongDan, expect, menu, mockApi, test, thayChu, toast } from '../../fixtures';

const CHAN_QUYEN = 'Vai trò của bạn trong công ty này không có quyền mở trang này.';
const KHONG_QUYEN_THAO_TAC = 'Bạn không có quyền thực hiện thao tác này';
const KHOAN_DA_XU_LY = 'Khoản thu vừa được người khác xử lý. Đã tải lại.';

const ketoan = (page: Page) => dangNhap(page, 'ketoan@commerio.vn', 'ketoan');
const kiemsoat = (page: Page) => dangNhap(page, 'kiemsoat@commerio.vn', 'kiemsoat');

const tab = (page: Page, name: string) => page.getByRole('tab', { name: new RegExp(`^${name}`) });
// Ô chọn đơn mở popover cũng có role dialog nên lọc theo tiêu đề
const hopGan = (page: Page) => chua(page, 'Gán vào đơn', '[role=dialog]');
const hopHoanLai = (page: Page) => chua(page, 'Hoàn lại khoản thu', '[role=dialog]');
const timKiem = (page: Page) => new URL(page.url()).search;

test.describe('P4 · Tài chính', () => {
  test.describe('chứng từ (AC-D1 đến AC-D4)', () => {
    test.beforeEach(({ page }) => dangNhap(page, 'ceo@commerio.vn', 'ceo'));

    test('tab Hoá đơn mặc định, lọc trạng thái, tìm, không có nút tạo; mở chi tiết và in', async ({ page }) => {
      await menu(page, 'Chứng từ');
      await expect(tab(page, 'Hoá đơn')).toHaveAttribute('aria-selected', 'true');
      await thayChu(page, 'Số', 'th');
      await thayChu(page, 'Tổng tiền', 'th');
      await expect(page.getByRole('button', { name: /Lập phiếu chi|Tạo hoá đơn/ })).toHaveCount(0);
      await expect(page.locator('tbody tr[data-row-id]')).not.toHaveCount(0);

      await page.getByPlaceholder(/Tìm số hoá đơn/).fill('khong-co-hoa-don-nay');
      await thayChu(page, 'Không có hoá đơn phù hợp');
      await expect.poll(() => timKiem(page)).toContain('q=');
      await page.getByPlaceholder(/Tìm số hoá đơn/).fill('');

      await page.locator('tbody tr[data-row-id]').first().click();
      await expect.poll(() => duongDan(page)).toMatch(/\/finance\/invoices\/inv-/);
      await expect(page.locator('[data-testid=invoice-lines]').locator('tbody tr')).not.toHaveCount(0);
      await expect(page.locator('[data-testid=invoice-totals]')).toContainText('Tiền hàng');
      await expect(page.locator('[data-testid=invoice-totals]')).toContainText('Tổng cộng');
      await page.evaluate(() => {
        const w = window as unknown as { __soLanIn: number; print: () => void };
        w.__soLanIn = 0;
        w.print = () => void w.__soLanIn++;
      });
      await page.getByRole('button', { name: 'In hoá đơn', exact: true }).click();
      await expect.poll(() => page.evaluate(() => (window as unknown as { __soLanIn: number }).__soLanIn)).toBe(1);
    });

    test('hoá đơn không có hoặc của công ty khác báo 404', async ({ page }) => {
      await page.goto('/c/cmp-001/finance/invoices/inv-khong-co');
      await thayChu(page, 'Không tìm thấy hoá đơn. Hoá đơn không tồn tại hoặc không thuộc công ty này.');
    });

    test('tab Phiếu thu: lọc nguồn, chi tiết có nguồn gốc giao dịch cổng', async ({ page }) => {
      await page.goto('/c/cmp-001/finance/documents?tab=receipts');
      await expect(dong(page, 'rct-0002')).toContainText('PT-000002');
      await expect(dong(page, 'rct-0002')).toContainText('Thu COD');
      await chon(page, 'Nguồn', 'Đối soát sàn');
      await expect(page.locator('tbody tr[data-row-id]')).toHaveCount(1);
      await expect(page.locator('tbody tr[data-row-id]').first()).toContainText('PT-000005');
      await expect(page.getByRole('button', { name: /Lập phiếu thu/ })).toHaveCount(0);

      await page.goto('/c/cmp-001/finance/receipts/rct-0006');
      await page.locator('[data-testid=receipt-origin]').getByRole('button', { name: 'Xem giao dịch cổng', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.locator('[data-testid=txn-fields]')).toContainText('VNPay');
      await expect(dialog.locator('[data-testid=txn-payload]')).toContainText('"sandbox": true');
      await expect(dialog.getByRole('button', { name: 'Sao chép payload', exact: true })).toBeAttached();
    });

    test('tab Phiếu chi: cột chứng từ gốc, lọc mục đích', async ({ page }) => {
      await page.goto('/c/cmp-001/finance/documents?tab=vouchers');
      await expect(dong(page, 'pv-0002')).toContainText('Hoàn khoản thu chưa khớp');
      await expect(dong(page, 'pv-0002')).toContainText('CK NHAM TAI KHOAN');
      await expect(dong(page, 'pv-0003')).toContainText('Nháp');
      await expect(dong(page, 'pv-0003')).toContainText('DH-1022');
      await chon(page, 'Mục đích', 'Hoàn tiền khách');
      await expect(page.locator('tbody tr[data-row-id]')).toHaveCount(2);
      await expect(dong(page, 'pv-0002')).toHaveCount(0);
    });
  });

  test.describe('phiếu chi (AC-V1 đến AC-V3)', () => {
    test.beforeEach(({ page }) => ketoan(page));

    test('lập phiếu chi nháp: bắt buộc ô, số tiền tự điền và khoá, mở chi tiết', async ({ page }) => {
      await page.goto('/c/cmp-001/finance/documents?tab=vouchers');
      await page.getByRole('button', { name: 'Lập phiếu chi', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('combobox', { name: 'Mục đích', exact: true }).click();
      await expect(page.getByRole('option', { name: 'Hoàn tiền khách', exact: true })).toBeAttached();
      await expect(page.getByRole('option', { name: 'Trả nhà cung cấp', exact: true })).toHaveCount(0);
      await page.keyboard.press('Escape');

      await dialog.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
      await thayChu(dialog, 'Chọn mục đích chi');
      await thayChu(dialog, 'Chọn chứng từ gốc');
      await chon(dialog, 'Mục đích', 'Hoàn khoản thu chưa khớp');
      await dialog.locator('#voucher-source').fill('CHAU');
      await page.getByRole('option', { name: /CHUYEN TIEN MUA AO CHAU/ }).click();
      await expect(dialog.locator('[data-testid=voucher-source]')).toContainText('CHUYEN TIEN MUA AO CHAU');
      await expect(dialog.locator('#voucher-amount')).toBeDisabled();
      await expect(dialog.locator('#voucher-amount')).toHaveValue(/170\.000/);
      await dialog.getByLabel('Ghi chú', { exact: true }).fill('Khách chuyển nhầm');
      await dialog.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
      await toast(page, 'Đã lập phiếu chi nháp PC-000004');
      await expect.poll(() => duongDan(page)).toMatch(/\/finance\/payment-vouchers\/pv-/);
      await expect(page.locator('[data-testid=doc-status]')).toContainText('Nháp');
    });

    test('BE trả 422 thì hiện lỗi dưới đúng ô', async ({ page }) => {
      await page.goto('/c/cmp-001/finance/documents?tab=vouchers');
      await page.getByRole('button', { name: 'Lập phiếu chi', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await chon(dialog, 'Mục đích', 'Hoàn tiền khách');
      await dialog.locator('#voucher-source').fill('DH-1023');
      await page.getByRole('option', { name: /DH-1023/ }).click();
      await mockApi(page, 'post', '/finance/payment-vouchers', 422, {
        status: 422,
        code: 'validation_failed',
        errors: { orderId: 'Đơn không còn chờ hoàn tiền', note: 'Ghi chú quá dài' },
      });
      await dialog.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
      await thayChu(dialog, 'Đơn không còn chờ hoàn tiền');
      await thayChu(dialog, 'Ghi chú quá dài');
    });

    test('sửa, xoá phiếu nháp; 409 thì tải lại', async ({ page }) => {
      await page.goto('/c/cmp-001/finance/payment-vouchers/pv-0003');
      await page.getByRole('button', { name: 'Sửa', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Ghi chú', { exact: true }).fill('Hoàn qua ngân hàng');
      await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
      await toast(page, 'Đã lưu phiếu chi PC-000003');

      await page.getByRole('button', { name: 'Sửa', exact: true }).click();
      await mockApi(page, 'put', '/finance/payment-vouchers/pv-0003', 409, { status: 409, code: 'version_conflict' });
      await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
      await thayChu(page, 'Phiếu chi vừa được người khác cập nhật. Đã tải lại phiếu mới nhất.');
      await expect(dialog).toHaveCount(0);

      await page.getByRole('button', { name: 'Xoá', exact: true }).click();
      const alert = page.getByRole('alertdialog');
      await expect(alert).toContainText('Xoá phiếu chi nháp PC-000003?');
      await alert.getByRole('button', { name: 'Xoá', exact: true }).click();
      await toast(page, 'Đã xoá phiếu chi PC-000003');
      await expect.poll(() => timKiem(page)).toContain('tab=vouchers');
      await expect(dong(page, 'pv-0003')).toHaveCount(0);
    });

    test('ghi sổ phiếu chi: đơn sang Đã hoàn, phiếu posted không còn nút', async ({ page }) => {
      await page.goto('/c/cmp-001/finance/payment-vouchers/pv-0003');
      await page.getByRole('button', { name: 'Ghi sổ', exact: true }).click();
      const alert = page.getByRole('alertdialog');
      await expect(alert).toContainText('Ghi sổ phiếu chi PC-000003 số tiền 350.000');
      await expect(alert).toContainText('Sau khi ghi sổ không sửa, xoá được.');
      await alert.getByRole('button', { name: 'Ghi sổ', exact: true }).click();
      await toast(page, 'Đã ghi sổ phiếu chi PC-000003');
      await expect(page.locator('[data-testid=doc-status]')).toContainText('Đã ghi sổ');
      await expect(page.locator('[data-testid=voucher-posted]')).toContainText('Đặng Thu Ngân');
      await expect(page.getByRole('button', { name: /^(Sửa|Xoá|Ghi sổ)$/ })).toHaveCount(0);

      // page.goto dựng lại dữ liệu mock nên đi bằng menu
      await menu(page, 'Hoàn tiền');
      await tab(page, 'Đã hoàn').click();
      await expect(dong(page, 'ord-1022')).toContainText('PC-000003');
    });

    test('ghi sổ bị 409 already_processed thì hiện detail của BE', async ({ page }) => {
      await page.goto('/c/cmp-001/finance/payment-vouchers/pv-0003');
      await page.getByRole('button', { name: 'Ghi sổ', exact: true }).click();
      await mockApi(page, 'post', '/finance/payment-vouchers/pv-0003/post', 409, {
        status: 409,
        code: 'already_processed',
        detail: 'Chứng từ gốc đã có phiếu chi ghi sổ PC-000009',
      });
      await page.getByRole('alertdialog').getByRole('button', { name: 'Ghi sổ', exact: true }).click();
      await thayChu(page, 'Chứng từ gốc đã có phiếu chi ghi sổ PC-000009');
      await expect(page.locator('[data-sonner-toast]', { hasText: chu('Đã ghi sổ') })).toHaveCount(0);
    });
  });

  test.describe('thu COD (AC-K1 đến AC-K3)', () => {
    test.beforeEach(({ page }) => ketoan(page));

    test('ba tab, tab Chờ thu chỉ có đơn đã giao; tab Không thu có ngày giao trống', async ({ page }) => {
      await menu(page, 'Thu COD');
      const rows = page.locator('tbody tr[data-row-id]');
      await expect(tab(page, 'Chờ thu')).toHaveAttribute('aria-selected', 'true');
      await expect(rows).toHaveCount(3);
      await expect(dong(page, 'ord-1008')).toHaveCount(0);
      await page.getByPlaceholder(/Tìm mã đơn/).fill('DH-1019');
      await expect(rows).toHaveCount(1);
      await page.getByPlaceholder(/Tìm mã đơn/).fill('');
      await expect(rows).toHaveCount(3);

      await tab(page, 'Đã thu').click();
      await expect(dong(page, 'ord-1021').locator('a').filter({ hasText: chu('PT-000002') })).not.toHaveCount(0);
      await expect(page.getByRole('checkbox')).toHaveCount(0);
      await tab(page, 'Không thu').click();
      await expect(dong(page, 'ord-1001')).toContainText('—');
    });

    test('xác nhận theo lô: tổng tiền, hộp xác nhận, phiếu thu, sang tab Đã thu', async ({ page }) => {
      await page.goto('/c/cmp-001/finance/cod');
      await expect(page.getByRole('button', { name: /Xác nhận đã nhận tiền/ })).toBeDisabled();
      await expect(page.locator('tbody tr[data-row-id]')).toHaveCount(3);
      await page.getByRole('checkbox', { name: 'Chọn cả trang', exact: true }).click();
      await expect(page.locator('[data-testid=cod-total]')).toContainText('Tổng');
      await page.getByRole('button', { name: 'Xác nhận đã nhận tiền (3)', exact: true }).click();
      const alert = page.getByRole('alertdialog');
      await expect(alert).toContainText('của 3 đơn COD? Mỗi đơn sinh một phiếu thu.');
      await alert.getByRole('button', { name: 'Xác nhận', exact: true }).click();
      await toast(page, 'Đã xác nhận 3 đơn COD, lập phiếu thu PT-000007 đến PT-000009');
      await thayChu(page, 'Chưa có đơn COD');
      await tab(page, 'Đã thu').click();
      await expect(dong(page, 'ord-1018')).toContainText('PT-0000');
    });

    test('409 payment_state_changed: không xác nhận đơn nào, gắn nhãn, giữ đơn còn lại', async ({ page }) => {
      await page.goto('/c/cmp-001/finance/cod');
      await page.getByRole('checkbox', { name: 'Chọn DH-1018', exact: true }).click();
      await page.getByRole('checkbox', { name: 'Chọn DH-1019', exact: true }).click();
      await page.getByRole('button', { name: 'Xác nhận đã nhận tiền (2)', exact: true }).click();
      await mockApi(page, 'post', '/finance/cod-confirmations', 409, {
        status: 409,
        code: 'payment_state_changed',
        orders: [{ orderId: 'ord-1018', code: 'DH-1018', status: 'cod_collected' }],
      });
      await page.getByRole('alertdialog').getByRole('button', { name: 'Xác nhận', exact: true }).click();
      await thayChu(page, 'Có đơn vừa thay đổi, chưa xác nhận đơn nào');
      await expect(page.locator('[data-testid=cod-changed]')).toContainText('DH-1018: Đã thay đổi');
      await expect(dong(page, 'ord-1018')).toContainText('Đã thay đổi');
      // Checkbox Radix là button nên kiểm aria-checked thay cho :checked
      await expect(page.getByRole('checkbox', { name: 'Chọn DH-1018', exact: true })).toHaveAttribute('aria-checked', 'false');
      await expect(page.getByRole('checkbox', { name: 'Chọn DH-1019', exact: true })).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByRole('button', { name: 'Xác nhận đã nhận tiền (1)', exact: true })).toBeEnabled();
    });
  });

  test.describe('hoàn tiền (AC-R1, AC-R2)', () => {
    test.beforeEach(({ page }) => ketoan(page));

    test('danh sách chờ hoàn và đã hoàn', async ({ page }) => {
      await menu(page, 'Hoàn tiền');
      await expect(tab(page, 'Chờ hoàn tiền')).toHaveAttribute('aria-selected', 'true');
      await expect(dong(page, 'ord-1022')).toContainText('VNPay');
      await expect(dong(page, 'ord-1023')).toContainText('Gán khoản chưa khớp');
      await tab(page, 'Đã hoàn').click();
      await expect(dong(page, 'ord-1024')).toContainText('PC-000001');
    });

    test('hoàn một bước: toast, sang tab Đã hoàn, chi tiết đơn Đã hoàn tiền', async ({ page }) => {
      await page.goto('/c/cmp-001/finance/refunds');
      await dong(page, 'ord-1023').getByRole('button', { name: 'Hoàn tiền', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.locator('[data-testid=refund-summary]')).toContainText('DH-1023');
      await expect(dialog.locator('[data-testid=refund-summary]')).toContainText('180.000');
      await expect(dialog.getByLabel('Ngày chi', { exact: true })).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
      await dialog.getByLabel('Ghi chú', { exact: true }).fill('Chuyển khoản lại cho khách');
      await dialog.getByRole('button', { name: 'Hoàn tiền', exact: true }).click();
      await toast(page, /^Đã hoàn 180\.000\s₫ cho đơn DH-1023, phiếu chi PC-000004$/);
      await expect(dong(page, 'ord-1023')).toHaveCount(0);
      await tab(page, 'Đã hoàn').click();
      await expect(dong(page, 'ord-1023')).toContainText('PC-000004');

      await chua(dong(page, 'ord-1023'), 'DH-1023', 'a').click();
      await expect(page.locator('[data-testid=payment-panel]')).toContainText('Đã hoàn tiền');
    });

    test('409 already_processed và payment_state_changed thì đóng hộp và báo', async ({ page }) => {
      await page.goto('/c/cmp-001/finance/refunds');
      const dialog = page.getByRole('dialog');
      await dong(page, 'ord-1023').getByRole('button', { name: 'Hoàn tiền', exact: true }).click();
      await mockApi(page, 'post', '/finance/refunds', 409, {
        status: 409,
        code: 'already_processed',
        detail: 'Chứng từ gốc đã có phiếu chi ghi sổ PC-000007',
      });
      await dialog.getByRole('button', { name: 'Hoàn tiền', exact: true }).click();
      await thayChu(page, 'Đơn vừa được người khác hoàn tiền (PC-000007).');
      await expect(dialog).toHaveCount(0);

      await dong(page, 'ord-1023').getByRole('button', { name: 'Hoàn tiền', exact: true }).click();
      await mockApi(page, 'post', '/finance/refunds', 409, { status: 409, code: 'payment_state_changed' });
      await dialog.getByRole('button', { name: 'Hoàn tiền', exact: true }).click();
      await thayChu(page, 'Đơn không còn chờ hoàn tiền.');
      await expect(dialog).toHaveCount(0);
    });

    test('BE trả 403 thì báo không có quyền, không toast thành công (AC-P3)', async ({ page }) => {
      await page.goto('/c/cmp-001/finance/refunds');
      await dong(page, 'ord-1023').getByRole('button', { name: 'Hoàn tiền', exact: true }).click();
      await mockApi(page, 'post', '/finance/refunds', 403, { status: 403, code: 'forbidden' });
      await page.getByRole('dialog').getByRole('button', { name: 'Hoàn tiền', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText(KHONG_QUYEN_THAO_TAC);
      await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
    });
  });

  test.describe('khoản thu chưa khớp (AC-U1 đến AC-U3)', () => {
    test.beforeEach(({ page }) => ketoan(page));

    test('ba tab, cột kết quả, lọc lý do', async ({ page }) => {
      await menu(page, 'Khoản thu chưa khớp');
      const rows = page.locator('tbody tr[data-row-id]');
      await expect(tab(page, 'Chưa xử lý')).toHaveAttribute('aria-selected', 'true');
      await expect(rows).toHaveCount(3);
      await expect(dong(page, 'um-0002')).toContainText('Lệch số tiền');
      await expect(dong(page, 'um-0002')).toContainText('DH-1014');
      await chon(page, 'Lý do', 'Đơn đã huỷ');
      await expect(rows).toHaveCount(1);
      await expect(dong(page, 'um-0003')).toBeAttached();

      await page.goto('/c/cmp-001/finance/unmatched');
      await tab(page, 'Đã gán').click();
      await expect(dong(page, 'um-0004')).toContainText('DH-1023');
      await expect(dong(page, 'um-0004')).toContainText('PT-000004');
      await expect(page.getByRole('button', { name: 'Gán vào đơn', exact: true })).toHaveCount(0);
      await tab(page, 'Đã hoàn lại').click();
      await expect(dong(page, 'um-0005')).toContainText('PC-000002');
    });

    test('gán vào đơn khớp tiền: toast, sang tab Đã gán', async ({ page }) => {
      await page.goto('/c/cmp-001/finance/unmatched');
      await dong(page, 'um-0001').getByRole('button', { name: 'Gán vào đơn', exact: true }).click();
      await thayChu(hopGan(page), 'CHUYEN TIEN MUA AO CHAU');
      await hopGan(page).locator('#assign-order').fill('DH-1007');
      await page.getByRole('option', { name: /DH-1007/ }).click();
      await expect(hopGan(page).locator('[data-testid=assign-order]')).toContainText('DH-1007');
      await expect(hopGan(page).locator('[data-testid=assign-order]')).not.toContainText('Lệch');
      await hopGan(page).getByRole('button', { name: 'Gán', exact: true }).click();
      await toast(page, /^Đã gán vào đơn DH-1007, phiếu thu PT-000007$/);
      await expect(dong(page, 'um-0001')).toHaveCount(0);
      await tab(page, 'Đã gán').click();
      await expect(dong(page, 'um-0001')).toContainText('DH-1007');
    });

    test('đơn gợi ý chọn sẵn, lệch tiền thì khoá nút Gán', async ({ page }) => {
      await page.goto('/c/cmp-001/finance/unmatched');
      await dong(page, 'um-0002').getByRole('button', { name: 'Gán vào đơn', exact: true }).click();
      await expect(hopGan(page).locator('[data-testid=assign-order]')).toContainText('DH-1014');
      await expect(hopGan(page).locator('[data-testid=assign-order]')).toContainText('Lệch');
      await expect(hopGan(page).getByRole('button', { name: 'Gán', exact: true })).toBeDisabled();
    });

    test('gán bị 422 và 409: lỗi dưới ô, giữ hoặc đóng hộp', async ({ page }) => {
      await page.goto('/c/cmp-001/finance/unmatched');
      await dong(page, 'um-0001').getByRole('button', { name: 'Gán vào đơn', exact: true }).click();
      await hopGan(page).locator('#assign-order').fill('DH-1007');
      await page.getByRole('option', { name: /DH-1007/ }).click();

      await mockApi(page, 'post', '/finance/unmatched-receipts/um-0001/assign', 422, {
        status: 422,
        code: 'amount_mismatch',
        errors: { orderId: 'Số tiền khoản thu khác tổng đơn' },
      });
      await hopGan(page).getByRole('button', { name: 'Gán', exact: true }).click();
      await expect(hopGan(page)).toContainText('Số tiền khoản thu khác tổng đơn');

      await mockApi(page, 'post', '/finance/unmatched-receipts/um-0001/assign', 409, {
        status: 409,
        code: 'payment_state_changed',
        current: { orderId: 'ord-1007', status: 'paid' },
      });
      await hopGan(page).getByRole('button', { name: 'Gán', exact: true }).click();
      await expect(hopGan(page)).toContainText('Đơn không còn chờ thanh toán (Đã thanh toán).');
      await hopGan(page).locator('#assign-order').fill('DH-1007');
      await page.getByRole('option', { name: /DH-1007/ }).click();

      await mockApi(page, 'post', '/finance/unmatched-receipts/um-0001/assign', 409, { status: 409, code: 'version_conflict' });
      await hopGan(page).getByRole('button', { name: 'Gán', exact: true }).click();
      await expect(page.locator('[role=dialog]', { hasText: chu('Gán vào đơn') })).toHaveCount(0);
      await thayChu(page, KHOAN_DA_XU_LY);
    });

    test('hoàn lại khoản thu; 409 thì đóng và báo', async ({ page }) => {
      await page.goto('/c/cmp-001/finance/unmatched');
      await dong(page, 'um-0003').getByRole('button', { name: 'Hoàn lại', exact: true }).click();
      await mockApi(page, 'post', '/finance/unmatched-receipts/um-0003/refund', 409, { status: 409, code: 'already_processed' });
      await hopHoanLai(page).getByRole('button', { name: 'Hoàn lại', exact: true }).click();
      await thayChu(page, KHOAN_DA_XU_LY);
      await expect(page.locator('[role=dialog]', { hasText: chu('Hoàn lại khoản thu') })).toHaveCount(0);

      await dong(page, 'um-0003').getByRole('button', { name: 'Hoàn lại', exact: true }).click();
      await thayChu(hopHoanLai(page), '115.000');
      await hopHoanLai(page).getByRole('button', { name: 'Hoàn lại', exact: true }).click();
      await toast(page, /^Đã hoàn lại 115\.000\s₫, phiếu chi PC-000004$/);
      await tab(page, 'Đã hoàn lại').click();
      await expect(dong(page, 'um-0003')).toContainText('PC-000004');
    });
  });

  test.describe('giao dịch cổng (AC-G1, AC-G2)', () => {
    test.beforeEach(({ page }) => kiemsoat(page));

    test('danh sách, lọc, link khoản thu chưa khớp; khung chi tiết chỉ xem', async ({ page }) => {
      await menu(page, 'Giao dịch cổng');
      await expect(dong(page, 'txn-0006')).toContainText('Cần xem lại');
      await expect(dong(page, 'txn-0006')).toContainText('SePay');
      await expect(dong(page, 'txn-0006').locator('a')).toContainText('Xem khoản thu chưa khớp');
      await expect(dong(page, 'txn-0001')).toContainText('PT-000006');
      await chon(page, 'Trạng thái', 'Thất bại');
      await expect(page.locator('tbody tr[data-row-id]')).toHaveCount(1);
      await dong(page, 'txn-0004').click();
      await expect.poll(() => timKiem(page)).toContain('txn=txn-0004');
      const dialog = page.getByRole('dialog');
      await expect(dialog.locator('[data-testid=txn-fields]')).toContainText('MoMo');
      await expect(dialog.locator('[data-testid=txn-payload]')).toContainText('"resultCode": 1006');
      await dialog.getByRole('button', { name: /Payload gốc/ }).click();
      await expect(dialog.locator('[data-testid=txn-payload]')).toHaveCount(0);
      await expect(dialog.getByRole('button').first()).toBeAttached();
      for (const t of await dialog.getByRole('button').allTextContents()) expect(t).not.toMatch(/Gán|Hoàn|Xoá|Sửa|Ghi sổ/);
    });
  });

  test.describe('phân quyền (AC-P1)', () => {
    const NHOM = ['Chứng từ', 'Thu COD', 'Hoàn tiền', 'Khoản thu chưa khớp'];
    const coMenu = async (page: Page, labels: string[], co: boolean) => {
      for (const l of labels) {
        const muc = page.locator('[data-sidebar="menu-button"]', { hasText: new RegExp(`^\\s*${l}\\s*$`) });
        if (co) await expect(muc.first()).toBeAttached();
        else await expect(muc).toHaveCount(0);
      }
    };

    test('CEO thấy cả năm mục và có nút ghi tiền', async ({ page }) => {
      await dangNhap(page, 'ceo@commerio.vn', 'ceo');
      await coMenu(page, [...NHOM, 'Giao dịch cổng'], true);
      await menu(page, 'Thu COD');
      await expect(page.getByRole('checkbox', { name: 'Chọn cả trang', exact: true })).toBeAttached();
    });

    test('Kế toán không thấy Giao dịch cổng, gõ đường dẫn bị chặn', async ({ page }) => {
      await ketoan(page);
      await coMenu(page, NHOM, true);
      await coMenu(page, ['Giao dịch cổng'], false);
      await page.goto('/c/cmp-001/payment/transactions');
      await thayChu(page, CHAN_QUYEN);
    });

    test('Kiểm soát thấy cả năm mục nhưng không có nút ghi tiền', async ({ page }) => {
      await kiemsoat(page);
      await coMenu(page, [...NHOM, 'Giao dịch cổng'], true);
      await page.goto('/c/cmp-001/finance/cod');
      await expect(dong(page, 'ord-1018')).toBeAttached();
      await expect(page.getByRole('checkbox')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Xác nhận đã nhận tiền/ })).toHaveCount(0);
      await page.goto('/c/cmp-001/finance/refunds');
      await expect(dong(page, 'ord-1022').getByRole('button', { name: 'Hoàn tiền', exact: true })).toHaveCount(0);
      await page.goto('/c/cmp-001/finance/unmatched');
      await expect(dong(page, 'um-0001').getByRole('button')).toHaveCount(0);
      await page.goto('/c/cmp-001/finance/documents?tab=vouchers');
      await expect(dong(page, 'pv-0003')).toBeAttached();
      await expect(page.getByRole('button', { name: 'Lập phiếu chi', exact: true })).toHaveCount(0);
      await page.goto('/c/cmp-001/finance/payment-vouchers/pv-0003');
      await expect(page.locator('[data-testid=doc-status]')).toContainText('Nháp');
      await expect(page.getByRole('button', { name: /^(Sửa|Xoá|Ghi sổ)$/ })).toHaveCount(0);
    });

    test('Admin không có nhóm Tài chính', async ({ page }) => {
      await dangNhap(page, 'admin@commerio.vn', 'admin');
      await menu(page, 'Tổng quan');
      await coMenu(page, [...NHOM, 'Giao dịch cổng'], false);
    });

    test('Kho không có nhóm Tài chính', async ({ page }) => {
      await dangNhap(page, 'kho@commerio.vn', 'kho');
      await menu(page, 'Tổng quan');
      await coMenu(page, [...NHOM, 'Giao dịch cổng'], false);
    });

    test('Sale không có nhóm Tài chính, gõ đường dẫn bị chặn', async ({ page }) => {
      await dangNhap(page, 'sale@commerio.vn', 'sale');
      await menu(page, 'Tổng quan');
      await coMenu(page, [...NHOM, 'Giao dịch cổng'], false);
      await page.goto('/c/cmp-001/finance/cod');
      await thayChu(page, CHAN_QUYEN);
    });
  });
});
