// P4 với BE thật · Tài chính (FE#12; Documents/21 §21.1). Tự đăng ký công ty giả mới qua API công khai (e2e/be/congTyGia.ts),
// không ghi thẳng DB, chạy được trên staging mỗi đêm. Một lần register, một lần login cho cả file.
//
// Chứng từ theo đơn (hoá đơn, thu COD, hoàn tiền, khoản thu chưa khớp, giao dịch cổng) cần đơn bán hoặc tiền vào qua cổng.
// Công ty mới không tạo được các thứ đó qua API: BE không có route tạo đơn (đơn chỉ vào từ sàn đã kết nối OAuth), route
// /payment/dev/simulate không gắn khi NODE_ENV=production như staging, và staging chưa đặt PAYMENT_CREDENTIALS_KEY nên không
// cấu hình được cổng VietQR để nhận webhook SePay (PUT /payment/gateways/vietqr trả 500). Các test đó để fixme, ghi lý do.
// Documents/21 §12 cũng ghi phần "thanh toán và tài chính cũ" đã bỏ, thay bằng §21 (commerio-backend#235 gỡ phần cũ).
import { expect, test } from '@playwright/test';
import { thayChu } from '../../fixtures';
import { type CongTyGia, taoCongTyGia } from '../congTyGia';

test.describe.configure({ mode: 'serial' });

let s: CongTyGia;
const url = (p: string) => `/c/${s.companyId}${p}`;
const CAN_DON = 'Cần đơn bán: BE không có route tạo đơn (đơn chỉ vào từ sàn qua OAuth), /payment/dev/simulate không gắn ở staging';

test.beforeAll(async ({ browser }) => {
  s = await taoCongTyGia(browser, { ten: 'tai-chinh' });
});
test.afterAll(async () => {
  await s?.dispose();
});

test.describe('P4-BE · Tài chính', () => {
  test('chứng từ: công ty mới chưa có hoá đơn, phiếu thu, phiếu chi', async () => {
    const { page } = s;
    for (const [tab, empty] of [
      ['invoices', 'Chưa có hoá đơn'],
      ['receipts', 'Chưa có phiếu thu'],
      ['vouchers', 'Chưa có phiếu chi'],
    ] as const) {
      await page.goto(url(`/finance/documents?tab=${tab}`));
      await thayChu(page, empty);
    }
  });

  test('hoá đơn không có báo 404', async () => {
    await s.page.goto(url('/finance/invoices/00000000-0000-4000-8000-000000000000'));
    await thayChu(s.page, 'Không tìm thấy hoá đơn. Hoá đơn không tồn tại hoặc không thuộc công ty này.');
  });

  test('thu COD, hoàn tiền, khoản thu chưa khớp, giao dịch cổng mở được trên BE thật, công ty mới thì trống', async () => {
    const { page } = s;
    for (const [path, empty] of [
      ['/finance/cod', 'Chưa có đơn COD'],
      ['/finance/refunds', 'Chưa có đơn chờ hoàn tiền'],
      ['/finance/unmatched', 'Chưa có khoản thu chưa khớp'],
      ['/payment/transactions', 'Chưa có giao dịch'],
    ] as const) {
      await page.goto(url(path));
      await thayChu(page, empty);
    }
  });

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

  test('chứng từ: hoá đơn, chi tiết dòng hàng; phiếu thu cổng mở được giao dịch gốc', () => {
    test.fixme(true, CAN_DON);
  });
  test('thu COD: chờ thu có hai đơn đã giao, không thu có đơn huỷ; xác nhận lô sinh phiếu thu', () => {
    test.fixme(true, CAN_DON);
  });
  test('hoàn tiền một bước: phiếu chi, sang tab Đã hoàn', () => {
    test.fixme(true, CAN_DON);
  });
  test('phiếu chi nháp rồi ghi sổ: đơn chờ hoàn sang Đã hoàn', () => {
    test.fixme(true, CAN_DON);
  });
  test('khoản thu chưa khớp: lệch tiền khoá nút Gán; gán khoản khớp tiền; hoàn lại khoản còn lại', () => {
    test.fixme(true, `${CAN_DON}; khoản thu không mã cần webhook SePay mà staging chưa đặt PAYMENT_CREDENTIALS_KEY`);
  });
  test('giao dịch cổng: giao dịch cần xem lại có link khoản thu chưa khớp; panel chi tiết chỉ xem', () => {
    test.fixme(true, 'Cần giao dịch cổng: staging chưa đặt PAYMENT_CREDENTIALS_KEY nên không cấu hình được cổng VietQR');
  });
});
