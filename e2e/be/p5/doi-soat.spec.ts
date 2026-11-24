// P5 với BE thật · Đối soát sàn (D4.2–D4.3, Documents/21 §21.2, §21.3) (trang báo cáo kinh doanh ngoài MVP, gỡ ở FE#249). Tự đăng ký công ty giả
// mới qua API công khai (e2e/be/congTyGia.ts), không ghi thẳng DB, chạy được trên staging mỗi đêm. Một lần register, một lần
// login cho cả file.
//
// Công ty mới chưa có gian hàng: gian hàng chỉ tạo được qua OAuth với sàn thật, đơn sàn chỉ vào từ gian hàng đó, route
// /finance/settlements/dev/import (bảng kê khuôn OAS) không gắn khi NODE_ENV=production như staging. Nên ở đây chỉ kiểm phần
// chạy được với công ty trống; các test cần bảng kê, đơn có số liệu, tài khoản thứ hai để fixme, ghi lý do.
// Bảng kê theo mã sàn (Documents/21 §12.6 cũ) đã bỏ: trang Đối soát sàn bây giờ là ba tab Tiền theo đơn, Lần đối soát, Khớp sao kê.
import { expect, test } from '@playwright/test';
import { menu, thayChu } from '../../fixtures';
import { type CongTyGia, taoCongTyGia } from '../congTyGia';

test.describe.configure({ mode: 'serial' });

let s: CongTyGia;
const url = (p: string) => `/c/${s.companyId}${p}`;

const CAN_GIAN_HANG =
  'Cần gian hàng và bảng kê: gian hàng chỉ tạo qua OAuth sàn thật, /finance/settlements/dev/import không gắn ở staging';

test.beforeAll(async ({ browser }) => {
  s = await taoCongTyGia(browser, { ten: 'doi-soat', batThem: ['report'] });
});
test.afterAll(async () => {
  await s?.dispose();
});

test.describe('P5-BE · Đối soát sàn', () => {
  test('ba tab tiền theo đơn, lần đối soát, khớp sao kê; công ty chưa có gian hàng thì trống, nút kéo quyết toán khoá', async () => {
    const { page } = s;
    await menu(page, 'Đối soát công nợ sàn');
    await expect(page.getByRole('tab', { name: 'Đối soát theo đơn', exact: true })).toHaveAttribute('aria-selected', 'true');
    await thayChu(page, 'Chưa có trạng thái thanh toán');

    await page.getByRole('tab', { name: 'Sao kê sàn', exact: true }).click();
    await thayChu(page, 'Chưa lấy sao kê sàn lần nào');
    // Documents/21 §21.3: POST /finance/settlement-runs cần shopId; chưa chọn gian hàng thì FE khoá nút
    await expect(page.getByRole('button', { name: 'Lấy sao kê sàn', exact: true })).toBeDisabled();

    await page.getByRole('tab', { name: 'Đối chiếu ngân hàng', exact: true }).click();
    await thayChu(page, 'Chưa có khoản cần đối chiếu');
    await expect(page.getByRole('button', { name: 'Lấy sao kê sàn', exact: true })).toHaveCount(0);
  });

  test('US-TI-09: lọc khớp sao kê theo loại, chưa khớp gửi đúng tham số; khớp dòng không có thì 404 (FE#151)', async () => {
    const { page, api } = s;
    await page.goto(url('/finance/settlements?tab=bank'));
    const req = page.waitForRequest((r) => r.url().includes('/finance/bank-matching') && r.url().includes('kind=supplier_refund'));
    await page.getByRole('combobox', { name: 'Loại khoản', exact: true }).click();
    await page.getByRole('option', { name: 'NCC hoàn tiền', exact: true }).click();
    expect((await (await req).response())?.status()).toBe(200);
    await thayChu(page, 'Chưa có khoản cần đối chiếu');

    // Documents/21 §21.3: kind chỉ nhận ba loại; dòng sổ không có thì 404
    expect((await api.get('/api/v1/finance/bank-matching?kind=revenue')).status()).toBe(422);
    const res = await api.post('/api/v1/finance/ledger/00000000-0000-4000-8000-000000000000/bank-match', { data: { bankRef: 'VCB-E2E' } });
    expect(res.status()).toBe(404);
  });

  test('danh sách bảng kê: mới nhất trước, số đếm, tiền về, phiếu thu đã sinh', () => {
    test.fixme(true, CAN_GIAN_HANG);
  });
  test('chi tiết bảng kê đã trả: kết quả khớp từng dòng, phiếu thu, công thức', () => {
    test.fixme(true, CAN_GIAN_HANG);
  });
  test('bảng kê chưa trả: phiếu thu chờ sàn trả', () => {
    test.fixme(true, CAN_GIAN_HANG);
  });
  test('tab Chênh lệch: hai dòng, link về bảng kê theo mã sàn', () => {
    test.fixme(true, CAN_GIAN_HANG);
  });
});
