// P5 · Sổ tiền (sơ đồ D4.1; FE#76): dòng sổ ước tính/thực tế, sàn quyết toán thay dòng, lãi theo đơn, cảnh báo mốc
import { type Page } from '@playwright/test';
import { chu, chua, dangNhap, expect, test, thayChu, toast } from '../../fixtures';

const CHAN_QUYEN = 'Vai trò của bạn trong công ty này không có quyền mở trang này.';

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

const tienDon = (page: Page) => page.locator('[data-testid=order-profit]');
const coChu = async (el: ReturnType<Page['locator']>, ...texts: string[]) => {
  for (const t of texts) await expect(el).toContainText(t);
};

/** Sàn báo giao kiện của DH-1015 rồi quay lại trang sàn giả lập */
const giaoDH1015 = async (page: Page) => {
  await page.goto('/c/cmp-001/sales/orders/ord-1015');
  const text = (await chua(page, /KH-\d{6}/).textContent()) ?? '';
  const code = text.match(/KH-\d{6}/)![0];
  await diToi(page, '/c/cmp-001/dev/marketplace');
  await phat(page, 'package.shipping_update', `${code} delivered`);
  await toast(page, new RegExp(`${code}: .* → delivered`));
};

test.describe('P5 · Sổ tiền', () => {
  test.describe('CEO', () => {
    test.beforeEach(({ page }) => dangNhap(page, 'ceo@commerio.vn', 'ceo'));

    test('trang sổ tiền: chỉ số, cảnh báo mốc doanh thu, dòng sổ có sẵn', async ({ page }) => {
      await page.goto('/c/cmp-001/finance/ledger');
      await thayChu(page, 'Sổ tiền', 'h1');
      await coChu(page.locator('[data-testid=tax-warnings]'), 'sắp vượt mốc 500 triệu', 'App không khai thuế');
      await expect(page.locator('[data-testid=kpi-withdrawn]')).toContainText('2.000.000');
      await expect(page.locator('[data-testid=kpi-platformBalance]')).toContainText('6.670.000');
      await expect(chua(page, 'Rút về ngân hàng', 'tr')).toContainText('Thực tế');
      await expect(chua(page, 'DH-1018', 'tr')).toContainText('Đơn tạo tay');
      await page.getByRole('tab', { name: 'Đã thay', exact: true }).click();
      await thayChu(page, 'Không có dòng sổ nào');
    });

    test('kiện sàn giao xong ghi ước tính; sàn quyết toán thay dòng, lệch thuế', async ({ page }) => {
      await giaoDH1015(page);
      await diToi(page, '/c/cmp-001/sales/orders/ord-1015');
      await coChu(tienDon(page), 'Ước tính', 'Thực nhận', 'Giá vốn', 'Lãi đóng góp');
      await expect(tienDon(page)).not.toContainText('Lệch thuế');

      await diToi(page, '/c/cmp-001/dev/marketplace');
      await phat(page, 'finance.order_settled', 'DH-1015 9999 20000');
      await toast(page, /DH-1015: thay 4 dòng ước tính/);

      await diToi(page, '/c/cmp-001/sales/orders/ord-1015');
      await coChu(tienDon(page), 'Theo quyết toán', 'Lệch thuế');
      await expect(chua(tienDon(page), 'Quảng cáo').locator('..')).toContainText('-20.000');

      await chua(tienDon(page), 'dòng sổ của đơn').click();
      await page.getByRole('tab', { name: 'Đã thay', exact: true }).click();
      await expect(page.locator('tbody tr')).toHaveCount(4);
      await expect(page.locator('tbody tr').first().locator('.line-through').first()).toBeAttached();
      await page.getByRole('tab', { name: 'Thực tế', exact: true }).click();
      await coChu(chua(page, 'Thuế khấu trừ', 'tr'), '-9.999', 'TXN-DH-1015');

      await page.getByRole('tab', { name: 'Lãi theo đơn', exact: true }).click();
      await coChu(chua(page, 'DH-1015', 'tr'), 'Theo quyết toán', 'Lệch thuế');
    });

    test('đơn tạo tay đã giao: tiền thực tế, có giá vốn', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1018');
      await coChu(tienDon(page), 'Theo quyết toán', 'Lãi gộp');
    });
  });

  test.describe('Kế toán', () => {
    test.beforeEach(({ page }) => dangNhap(page, 'ketoan@commerio.vn', 'ketoan'));

    test('không thấy giá vốn, xuất được chứng từ', async ({ page }) => {
      await page.goto('/c/cmp-001/finance/ledger');
      await thayChu(page, 'DH-1018', 'tr');
      await expect(page.locator('td', { hasText: chu('Giá vốn') })).toHaveCount(0);
      await page.getByRole('button', { name: 'Xuất chứng từ kiểu MISA', exact: true }).click();
      await toast(page, 'Đã xuất chứng từ');
      await page.getByRole('tab', { name: 'Lãi theo đơn', exact: true }).click();
      await expect(chua(page, 'DH-1018', 'tr')).not.toContainText('Lãi gộp');

      await diToi(page, '/c/cmp-001/sales/orders/ord-1018');
      await coChu(tienDon(page), 'Thực nhận', 'Cần quyền xem giá vốn');
      await expect(tienDon(page)).not.toContainText('Lãi gộp');
    });
  });

  test.describe('Sale', () => {
    test.beforeEach(({ page }) => dangNhap(page, 'sale@commerio.vn', 'sale'));

    test('không có quyền sổ tiền', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1018');
      await thayChu(page, 'DH-1018', 'h1');
      await expect(page.locator('[data-testid=order-profit]')).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Sổ tiền', exact: true })).toHaveCount(0);
      await page.goto('/c/cmp-001/finance/ledger');
      await thayChu(page, CHAN_QUYEN);
    });
  });
});
