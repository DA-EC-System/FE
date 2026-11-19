// P4 · Tài chính cũ đã gỡ (FE#150, commerio-backend#324): chứng từ, phiếu chi, thu COD, hoàn tiền, khoản thu chưa khớp,
// giao dịch cổng, cổng thanh toán, khung thanh toán của đơn tay. Phần tài chính mới (sổ tiền, đối soát) ở e2e/mock/p5.
import { type Page } from '@playwright/test';
import { dangNhap, expect, menu, test, thayChu } from '../../fixtures';

const MUC_CU = ['Chứng từ', 'Thu COD', 'Hoàn tiền', 'Khoản thu chưa khớp', 'Giao dịch cổng', 'Cổng thanh toán'];
const URL_CU = [
  '/finance/documents',
  '/finance/invoices/inv-0001',
  '/finance/receipts/rct-0001',
  '/finance/payment-vouchers/pv-0003',
  '/finance/cod',
  '/finance/refunds',
  '/finance/unmatched',
  '/payment/transactions',
  '/settings/payment-gateways',
];

const muc = (page: Page, label: string) =>
  page.locator('[data-sidebar="menu-button"]', { hasText: new RegExp(`^\\s*${label}\\s*$`) });

test.describe('P4 · Tài chính cũ đã gỡ', () => {
  test.beforeEach(({ page }) => dangNhap(page, 'ceo@commerio.vn', 'ceo'));

  test('CEO không còn mục tiền cũ, vẫn có Sổ tiền', async ({ page }) => {
    await menu(page, 'Tổng quan');
    await expect(muc(page, 'Sổ tiền')).toBeAttached();
    for (const label of MUC_CU) await expect(muc(page, label)).toHaveCount(0);
  });

  test('gõ đường dẫn trang cũ thì báo không tìm thấy trang', async ({ page }) => {
    for (const p of URL_CU) {
      await page.goto(`/c/cmp-001${p}`);
      await thayChu(page, 'Không tìm thấy trang');
    }
  });

  test('đơn tay không còn khung thanh toán, vẫn có ô Tiền ở đầu trang', async ({ page }) => {
    await page.goto('/c/cmp-001/sales/orders/ord-1003');
    await thayChu(page, 'Đơn DH-1003', 'h1');
    await expect(page.locator('[data-testid=payment-panel]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Tạo mã thanh toán', exact: true })).toHaveCount(0);
    await expect(page.locator('span', { hasText: /^Tiền:/ }).first()).toBeVisible();
  });
});
