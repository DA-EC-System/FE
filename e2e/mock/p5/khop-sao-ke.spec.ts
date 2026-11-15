// US-TI-09 · Khớp tiền về ngân hàng (Documents/27 §6.8, Documents/21 §21.3, FE#151). Tab Khớp sao kê của trang Đối soát sàn.
import { test, expect, dangNhap, menu, chon, mockApi } from '../../fixtures';
import type { Page } from '@playwright/test';

async function moTabKhop(page: Page) {
  await menu(page, 'Đối soát sàn');
  await page.getByRole('tab', { name: 'Khớp sao kê', exact: true }).click();
  await expect(page.locator('tbody tr').first()).toBeVisible();
}
const dongRut = (page: Page) => page.locator('tbody tr').filter({ hasText: 'Rút tiền' });

test.describe('US-TI-09 · Khớp sao kê', () => {
  test('AC1: Admin (không có finance.invoice.view) vào được trang tiền, nhập mã sao kê thì dòng hiện Đã khớp kèm người, lúc', async ({ page }) => {
    await dangNhap(page, 'admin@commerio.vn', 'admin'); await moTabKhop(page);
    await dongRut(page).getByRole('button', { name: 'Khớp sao kê', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('nhập mã giao dịch trên sao kê ngân hàng');
    await dialog.getByLabel('Mã sao kê', { exact: true }).fill('VCB-RUT-0211');
    await dialog.getByRole('button', { name: 'Khớp sao kê', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(dongRut(page)).toContainText('Đã khớp');
    await expect(dongRut(page)).toContainText('VCB-RUT-0211');
    await expect(dongRut(page).getByTestId('bank-matched-by')).not.toBeEmpty();
  });

  test('AC2: dòng vừa bị người khác khớp thì báo already_matched, giữ hộp thoại để đọc', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo'); await moTabKhop(page);
    await mockApi(page, 'post', '/finance/ledger/withdraw-cmp-001/bank-match', 409, { status: 409, code: 'already_matched' });
    await dongRut(page).getByRole('button', { name: 'Khớp sao kê', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByLabel('Mã sao kê', { exact: true }).fill('VCB-RUT-0211');
    await dialog.getByRole('button', { name: 'Khớp sao kê', exact: true }).click();
    await expect(dialog).toContainText('Khoản tiền đã được khớp sao kê.');
  });

  test('AC3: dòng ước tính hoặc loại khác thì báo not_bank_matchable', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo'); await moTabKhop(page);
    await mockApi(page, 'post', '/finance/ledger/withdraw-cmp-001/bank-match', 422, { status: 422, code: 'not_bank_matchable' });
    await dongRut(page).getByRole('button', { name: 'Khớp sao kê', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByLabel('Mã sao kê', { exact: true }).fill('VCB-X');
    await dialog.getByRole('button', { name: 'Khớp sao kê', exact: true }).click();
    await expect(dialog).toContainText('Chỉ khớp khoản rút tiền, NCC hoàn tiền hoặc bồi thường thực tế.');
  });

  test('AC4: lọc Chưa khớp và theo loại; dòng chưa khớp vẫn nằm ở Chưa khớp', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo'); await moTabKhop(page);
    await chon(page, 'Khớp sao kê', 'Chưa khớp');
    await expect(dongRut(page)).toHaveCount(1);
    await expect(page.locator('tbody')).not.toContainText('NCC hoàn tiền');
    await chon(page, 'Khớp sao kê', 'Đã khớp');
    await expect(page.locator('tbody tr').filter({ hasText: 'NCC hoàn tiền' })).toContainText('VCB-HOAN-001');
    await expect(dongRut(page)).toHaveCount(0);
    await chon(page, 'Loại', 'Rút tiền');
    await expect(page.getByText('Chưa có khoản cần khớp', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/kind=withdrawal/);
  });

  test('AC5: người chỉ có quyền xem thấy Chưa khớp, không có nút khớp', async ({ page }) => {
    await dangNhap(page, 'ketoan@commerio.vn', 'ketoan'); await moTabKhop(page);
    await expect(dongRut(page)).toContainText('Chưa khớp');
    await expect(page.locator('tbody').getByRole('button', { name: 'Khớp sao kê', exact: true })).toHaveCount(0);
  });

  test('AC5: Sale không có quyền tiền nào thì không vào được trang tiền', async ({ page }) => {
    await dangNhap(page, 'sale@commerio.vn', 'sale');
    await page.goto('/c/cmp-001/finance/settlements?tab=bank');
    await expect(page.getByText('Vai trò của bạn trong công ty này không có quyền mở trang này.', { exact: true })).toBeVisible();
  });
});
