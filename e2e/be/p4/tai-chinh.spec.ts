// P4 với BE thật · Tài chính (FE#12; commerio-backend#25, #27). BE chưa có API tạo đơn nên dựng dữ liệu trước mỗi lần chạy
// bằng e2e/be/seed/tai-chinh.mts (xem đầu file đó), ghi ra e2e/be/seed/fe12-be.json.
// Các test chạy theo thứ tự, test sau dùng trạng thái test trước để lại.
import { readFileSync } from 'node:fs';
import { type Page } from '@playwright/test';
import { chon, chu, chua, dong, duongDan, expect, menu, test, thayChu, toast } from '../../fixtures';

interface Don {
  orderId: string;
  code: string;
  amount: number;
}
interface Seed {
  run: string;
  email: string;
  password: string;
  companyId: string;
  cod: Don[];
  codNotCollected: Don;
  refund: Don[];
  paid: Don;
  invoice: { id: string; number: string };
  mismatch: Don;
  assignTarget: Don;
}

let s: Seed;
const tab = (page: Page, name: string) => page.getByRole('tab', { name: new RegExp(`^${name}`) });
const hopGan = (page: Page) => chua(page, 'Gán vào đơn', '[role=dialog]');
const hopHoanLai = (page: Page) => chua(page, 'Hoàn lại khoản thu', '[role=dialog]');
const dongCo = (page: Page, text: string) => chua(page, text, 'tbody tr[data-row-id]');
const url = (p: string) => `/c/${s.companyId}${p}`;
const coLink = (page: Page, id: string, text: string) =>
  expect(dong(page, id).locator('a').filter({ hasText: chu(text) })).not.toHaveCount(0);

test.beforeAll(() => {
  s = JSON.parse(readFileSync(new URL('../seed/fe12-be.json', import.meta.url), 'utf8')) as Seed;
});
test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[name=email]').fill(s.email);
  await page.locator('input[name=password]').fill(s.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect.poll(() => duongDan(page)).toMatch(new RegExp(`^/c/${s.companyId}`));
});

test.describe('P4-BE · Tài chính', () => {
  test('chứng từ: hoá đơn, chi tiết dòng hàng; phiếu thu cổng mở được giao dịch gốc', async ({ page }) => {
    await menu(page, 'Chứng từ');
    await expect(tab(page, 'Hoá đơn')).toHaveAttribute('aria-selected', 'true');
    await expect(dong(page, s.invoice.id)).toContainText(s.invoice.number);
    await expect(dong(page, s.invoice.id)).toContainText(s.paid.code);
    await dong(page, s.invoice.id).click();
    await expect.poll(() => duongDan(page)).toBe(url(`/finance/invoices/${s.invoice.id}`));
    await expect(page.locator('[data-testid=invoice-lines]').locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('[data-testid=invoice-totals]')).toContainText('99.000');

    await page.goto(url('/finance/documents?tab=receipts'));
    await chua(dongCo(page, s.paid.code), /^PT-/, 'td').click();
    await page.locator('[data-testid=receipt-origin]').getByRole('button', { name: 'Xem giao dịch cổng', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('[data-testid=txn-fields]')).toContainText('VietQR');
    await expect(dialog.locator('[data-testid=txn-payload]')).toContainText('"simulated": true');
  });

  test('hoá đơn không có báo 404', async ({ page }) => {
    await page.goto(url('/finance/invoices/00000000-0000-4000-8000-000000000000'));
    await thayChu(page, 'Không tìm thấy hoá đơn. Hoá đơn không tồn tại hoặc không thuộc công ty này.');
  });

  test('thu COD: chờ thu có hai đơn đã giao, không thu có đơn huỷ; xác nhận lô sinh phiếu thu', async ({ page }) => {
    await menu(page, 'Thu COD');
    await expect(page.locator('tbody tr[data-row-id]')).toHaveCount(2);
    await expect(dong(page, s.cod[0]!.orderId)).toContainText('200.000');
    await tab(page, 'Không thu').click();
    await expect(dong(page, s.codNotCollected.orderId)).toContainText('—');
    await tab(page, 'Chờ thu').click();
    await page.getByRole('checkbox', { name: 'Chọn cả trang', exact: true }).click();
    await expect(page.locator('[data-testid=cod-total]')).toContainText('550.000');
    await page.getByRole('button', { name: 'Xác nhận đã nhận tiền (2)', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await toast(page, /^Đã xác nhận 2 đơn COD, lập phiếu thu PT-/);
    await thayChu(page, 'Chưa có đơn COD');
    await tab(page, 'Đã thu').click();
    await coLink(page, s.cod[0]!.orderId, 'PT-');
    await coLink(page, s.cod[1]!.orderId, 'PT-');
  });

  test('hoàn tiền một bước: phiếu chi, sang tab Đã hoàn', async ({ page }) => {
    const d = s.refund[0]!;
    await menu(page, 'Hoàn tiền');
    await expect(dong(page, d.orderId)).toContainText('VietQR');
    await dong(page, d.orderId).getByRole('button', { name: 'Hoàn tiền', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('[data-testid=refund-summary]')).toContainText(d.code);
    await expect(dialog.locator('[data-testid=refund-summary]')).toContainText('180.000');
    await dialog.getByLabel('Ghi chú', { exact: true }).fill('Hoàn E2E');
    await dialog.getByRole('button', { name: 'Hoàn tiền', exact: true }).click();
    await toast(page, new RegExp(`^Đã hoàn 180\\.000\\s₫ cho đơn ${d.code}, phiếu chi PC-`));
    await expect(dong(page, d.orderId)).toHaveCount(0);
    await tab(page, 'Đã hoàn').click();
    await expect(dong(page, d.orderId)).toContainText('PC-');
  });

  test('phiếu chi nháp rồi ghi sổ: đơn chờ hoàn sang Đã hoàn', async ({ page }) => {
    const d = s.refund[1]!;
    await page.goto(url('/finance/documents?tab=vouchers'));
    await page.getByRole('button', { name: 'Lập phiếu chi', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await chon(dialog, 'Mục đích', 'Hoàn tiền khách');
    await dialog.locator('#voucher-source').fill(d.code);
    await page.getByRole('option', { name: new RegExp(d.code) }).click();
    await expect(dialog.locator('#voucher-amount')).toBeDisabled();
    await expect(dialog.locator('#voucher-amount')).toHaveValue(/260\.000/);
    await dialog.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
    await toast(page, /^Đã lập phiếu chi nháp PC-/);
    await expect.poll(() => duongDan(page)).toMatch(/\/finance\/payment-vouchers\/[0-9a-f-]{36}$/);
    await expect(page.locator('[data-testid=doc-status]')).toContainText('Nháp');
    await page.getByRole('button', { name: 'Ghi sổ', exact: true }).click();
    const alert = page.getByRole('alertdialog');
    await expect(alert).toContainText('260.000');
    await alert.getByRole('button', { name: 'Ghi sổ', exact: true }).click();
    await toast(page, /^Đã ghi sổ phiếu chi PC-/);
    await expect(page.locator('[data-testid=doc-status]')).toContainText('Đã ghi sổ');
    await expect(page.getByRole('button', { name: /^(Sửa|Xoá|Ghi sổ)$/ })).toHaveCount(0);

    await menu(page, 'Hoàn tiền');
    await thayChu(page, 'Chưa có đơn chờ hoàn');
    await tab(page, 'Đã hoàn').click();
    await expect(dong(page, d.orderId)).toContainText('PC-');
  });

  test('khoản thu chưa khớp: lệch tiền khoá nút Gán; gán khoản khớp tiền; hoàn lại khoản còn lại', async ({ page }) => {
    await menu(page, 'Khoản thu chưa khớp');
    await expect(page.locator('tbody tr[data-row-id]')).toHaveCount(3);
    await expect(dongCo(page, '149.000')).toContainText('Lệch số tiền');
    await expect(dongCo(page, '149.000')).toContainText(s.mismatch.code);
    await dongCo(page, '149.000').getByRole('button', { name: 'Gán vào đơn', exact: true }).click();
    await expect(hopGan(page).locator('[data-testid=assign-order]')).toContainText(s.mismatch.code);
    await expect(hopGan(page).locator('[data-testid=assign-order]')).toContainText('Lệch');
    await expect(hopGan(page).getByRole('button', { name: 'Gán', exact: true })).toBeDisabled();
    await hopGan(page).getByRole('button', { name: 'Đóng', exact: true }).click();

    await dongCo(page, `CK GAN ${s.run}`).getByRole('button', { name: 'Gán vào đơn', exact: true }).click();
    await hopGan(page).locator('#assign-order').fill(s.assignTarget.code);
    await page.getByRole('option', { name: new RegExp(s.assignTarget.code) }).click();
    await expect(hopGan(page).locator('[data-testid=assign-order]')).toContainText(s.assignTarget.code);
    await expect(hopGan(page).locator('[data-testid=assign-order]')).not.toContainText('Lệch');
    await hopGan(page).getByRole('button', { name: 'Gán', exact: true }).click();
    await toast(page, new RegExp(`^Đã gán vào đơn ${s.assignTarget.code}, phiếu thu PT-`));

    await dongCo(page, `CK HOAN ${s.run}`).getByRole('button', { name: 'Hoàn lại', exact: true }).click();
    await thayChu(hopHoanLai(page), '50.000');
    await hopHoanLai(page).getByRole('button', { name: 'Hoàn lại', exact: true }).click();
    await toast(page, /^Đã hoàn lại 50\.000\s₫, phiếu chi PC-/);
    await expect(page.locator('tbody tr[data-row-id]')).toHaveCount(1);

    await tab(page, 'Đã gán').click();
    await expect(dongCo(page, `CK GAN ${s.run}`)).toContainText(s.assignTarget.code);
    await expect(dongCo(page, `CK GAN ${s.run}`)).toContainText('PT-');
    await tab(page, 'Đã hoàn lại').click();
    await expect(dongCo(page, `CK HOAN ${s.run}`)).toContainText('PC-');
  });

  test('giao dịch cổng: giao dịch cần xem lại có link khoản thu chưa khớp; panel chi tiết chỉ xem', async ({ page }) => {
    await menu(page, 'Giao dịch cổng');
    await expect(dongCo(page, '149.000')).toContainText('Cần xem lại');
    await expect(dongCo(page, '149.000').locator('a').filter({ hasText: chu('Xem khoản thu chưa khớp') })).not.toHaveCount(0);
    await expect(dongCo(page, '99.000')).toContainText('PT-');
    await dongCo(page, '99.000').click();
    await expect.poll(() => new URL(page.url()).search).toContain('txn=');
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('[data-testid=txn-fields]')).toContainText('VietQR');
    await expect(dialog.locator('[data-testid=txn-payload]')).toContainText('"simulated": true');
    await expect(dialog.getByRole('button').first()).toBeAttached();
    for (const t of await dialog.getByRole('button').allTextContents()) expect(t).not.toMatch(/Gán|Hoàn|Xoá|Sửa|Ghi sổ/);
  });
});
