// P5 · Sổ tiền (sơ đồ D4.1; FE#76, FE#150 theo Documents/21 §21.1): dòng sổ ước tính/thực tế, sàn quyết toán thay dòng, lãi theo đơn, theo SKU, cảnh báo mốc
import { type Page } from '@playwright/test';
import { chu, chua, dangNhap, dong, expect, test, thayChu, toast } from '../../fixtures';

const CHAN_QUYEN = 'Vai trò của bạn trong công ty này không có quyền mở trang này.';
/** DH-1018 (đơn tạo tay) giao ngày 11/10/2026: kỳ chỉ có đơn này */
const KY_DH1018 = 'from=2026-10-11&to=2026-10-11';

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
/** Cách tính lãi của đơn nằm trong popover "Cách tính" (FE#138) */
const cachTinh = async (page: Page) => {
  await tienDon(page).getByRole('button', { name: 'Cách tính', exact: true }).click();
  return page.getByTestId('order-profit-detail');
};
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
      await page.getByRole('button', { name: 'Giải thích: Sổ tiền', exact: true }).hover();
      await expect(page.getByRole('tooltip')).toContainText('thay bằng dòng thực tế khi sàn quyết toán');
      await coChu(page.locator('[data-testid=tax-warnings]'), 'sắp vượt mốc 500 triệu', 'App không khai thuế');
      await expect(page.locator('[data-testid=kpi-withdrawn]')).toContainText('2.000.000');
      // 6.670.000 cộng khoản 189.000 của đơn không có trong app (dữ liệu mock của BE#250)
      await expect(page.locator('[data-testid=kpi-platformBalance]')).toContainText('6.859.000');
      await expect(chua(page, 'Rút về ngân hàng', 'tr')).toContainText('Thực tế');
      await expect(chua(page, 'DH-1018', 'tr')).toContainText('Đơn tạo tay');
      // Khoản của đơn sàn không có trong app: dòng của gian hàng, cờ Không rõ đơn (E140, BE#250)
      await expect(chua(page, '700000000000009', 'tr').locator('[data-flag=unknown_order]')).toHaveText('Không rõ đơn');
      await page.getByRole('tab', { name: 'Đã thay', exact: true }).click();
      await thayChu(page, 'Không có dòng sổ nào');
    });

    test('kiện sàn giao xong ghi ước tính; sàn quyết toán thay từng dòng bằng số thực tế', async ({ page }) => {
      await giaoDH1015(page);
      await diToi(page, '/c/cmp-001/sales/orders/ord-1015');
      await coChu(tienDon(page), 'Ước tính', 'Thực nhận', 'Lãi gộp');
      await expect(tienDon(page)).not.toContainText('Giá vốn');
      await coChu(await cachTinh(page), 'Thực nhận', 'Giá vốn', 'Lãi gộp');
      await page.keyboard.press('Escape');

      // Ước tính: doanh thu, phí cố định, phí giao dịch, phí dịch vụ, thuế sàn khấu trừ
      await diToi(page, '/c/cmp-001/dev/marketplace');
      await phat(page, 'finance.order_settled', 'DH-1015 9999');
      await toast(page, /DH-1015: thay 5 dòng ước tính/);

      await diToi(page, '/c/cmp-001/sales/orders/ord-1015');
      await thayChu(tienDon(page), 'Theo quyết toán');
      await chua(tienDon(page), 'dòng sổ của đơn').click();
      await page.getByRole('tab', { name: 'Đã thay', exact: true }).click();
      await expect(page.locator('tbody tr')).toHaveCount(5);
      await expect(page.locator('tbody tr').first().locator('.line-through').first()).toBeAttached();
      await page.getByRole('tab', { name: 'Thực tế', exact: true }).click();
      await coChu(chua(page, 'Thuế sàn khấu trừ', 'tr'), '-9.999', 'TXN-DH-1015');

      await page.getByRole('tab', { name: 'Lãi theo đơn', exact: true }).click();
      await thayChu(chua(page, 'DH-1015', 'tr'), 'Theo quyết toán');
      await coChu(page.getByTestId('profit-totals'), 'Tổng kỳ', 'Thực nhận', 'Giá vốn', 'Lãi gộp');
    });

    test('đơn tạo tay đã giao: tiền thực tế, có giá vốn; lãi theo đơn và theo SKU của kỳ', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1018');
      await coChu(tienDon(page), 'Theo quyết toán', 'Lãi gộp');
      await coChu(await cachTinh(page), 'Lãi gộp');
      await page.keyboard.press('Escape');

      await page.goto(`/c/cmp-001/finance/ledger?tab=orders&${KY_DH1018}`);
      await expect(page.locator('tbody tr')).toHaveCount(1);
      await coChu(dong(page, 'ord-1018'), 'DH-1018', 'Đơn tạo tay', 'Theo quyết toán');
      await expect(dong(page, 'ord-1018').locator('[data-flag]')).toHaveCount(0);
      await page.getByLabel('Thiếu giá vốn', { exact: true }).click();
      await expect(page).toHaveURL(/costMissing=true/);
      await thayChu(page, 'Không có đơn nào giao trong kỳ');

      await page.getByRole('tab', { name: 'Lãi theo SKU', exact: true }).click();
      await expect(dong(page, 'prd-001-v1')).toBeVisible();
      await coChu(page.getByTestId('profit-totals'), 'Tổng kỳ', 'Lãi gộp');
    });
  });

  test.describe('Kế toán', () => {
    test.beforeEach(({ page }) => dangNhap(page, 'ketoan@commerio.vn', 'ketoan'));

    test('không thấy giá vốn; chưa có nút xuất MISA (BE chưa có, D4.1)', async ({ page }) => {
      await page.goto('/c/cmp-001/finance/ledger');
      await thayChu(page, 'DH-1018', 'tr');
      await expect(page.locator('td', { hasText: chu('Giá vốn') })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Xuất chứng từ kiểu MISA', exact: true })).toHaveCount(0);
      await page.goto(`/c/cmp-001/finance/ledger?tab=orders&${KY_DH1018}`);
      await thayChu(dong(page, 'ord-1018'), 'DH-1018');
      await expect(page.getByTestId('profit-totals')).toContainText('Thực nhận');
      await expect(page.getByTestId('profit-totals')).not.toContainText('Giá vốn');
      await expect(page.getByTestId('profit-totals')).not.toContainText('Lãi gộp');

      await diToi(page, '/c/cmp-001/sales/orders/ord-1018');
      await coChu(tienDon(page), 'Thực nhận', 'Cần quyền xem giá vốn');
      await expect(tienDon(page)).not.toContainText('Lãi gộp');
      await expect(tienDon(page).getByRole('button', { name: 'Cách tính', exact: true })).toHaveCount(0);
    });
  });

  test.describe('Admin', () => {
    test.beforeEach(({ page }) => dangNhap(page, 'admin@commerio.vn', 'admin'));

    // Admin chỉ có finance.config.manage, finance.settlement.resolve: đủ xem sổ tiền như financeView ở BE
    test('mở được sổ tiền từ menu', async ({ page }) => {
      await page.goto('/c/cmp-001');
      await page.getByRole('link', { name: 'Sổ giao dịch', exact: true }).click();
      await thayChu(page, 'Sổ tiền', 'h1');
      await thayChu(page, 'DH-1018', 'tr');
    });
  });

  test.describe('Sale', () => {
    test.beforeEach(({ page }) => dangNhap(page, 'sale@commerio.vn', 'sale'));

    test('không có quyền sổ tiền', async ({ page }) => {
      await page.goto('/c/cmp-001/sales/orders/ord-1018');
      await thayChu(page, 'DH-1018', 'h1');
      await expect(page.locator('[data-testid=order-profit]')).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Sổ giao dịch', exact: true })).toHaveCount(0);
      await page.goto('/c/cmp-001/finance/ledger');
      await thayChu(page, CHAN_QUYEN);
    });
  });
});
