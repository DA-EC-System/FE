// P4 với BE thật · Tài chính (FE#12; Documents/21 §21.1). Tự đăng ký công ty giả mới qua API công khai (e2e/be/congTyGia.ts),
// không ghi thẳng DB, chạy được trên staging mỗi đêm. Một lần register, một lần login cho cả file.
//
// Phần tiền cũ (chứng từ, thu COD, hoàn tiền, khoản thu chưa khớp, giao dịch cổng) đã gỡ ở FE#150 theo commerio-backend#324.
import { expect, test } from '@playwright/test';
import { thayChu } from '../../fixtures';
import { type CongTyGia, taoCongTyGia } from '../congTyGia';

test.describe.configure({ mode: 'serial' });

let s: CongTyGia;
const url = (p: string) => `/c/${s.companyId}${p}`;

test.beforeAll(async ({ browser }) => {
  s = await taoCongTyGia(browser, { ten: 'tai-chinh' });
});
test.afterAll(async () => {
  await s?.dispose();
});

test.describe('P4-BE · Tài chính', () => {
  // Documents/21 §21.1: GET /finance/ledger trả `totals`; công ty mới mọi số bằng 0. `committedPurchase` BE trả null
  // (chưa nối cổng purchasing) nên không kiểm thẻ "Tiền sẽ ra".
  test('sổ tiền: công ty mới chưa có dòng sổ, phải thu, số dư sàn, đã rút đều 0', async () => {
    const { page } = s;
    await page.goto(url('/finance/ledger'));
    await thayChu(page, 'Sổ tiền', 'h1');
    for (const k of ['receivable', 'platformBalance', 'withdrawn'])
      await expect(page.getByTestId(`kpi-${k}`)).toContainText(/(^|\D)0\s₫/);
    await thayChu(page, 'Không có dòng sổ nào');
    await expect(page.getByTestId('tax-warnings')).toHaveCount(0);
  });
});
