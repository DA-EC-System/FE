// P5 với BE thật · Đối soát sàn (D4.2–D4.3, Documents/21 §21.2, §21.3) và báo cáo kinh doanh (FE#13). Tự đăng ký công ty giả
// mới qua API công khai (e2e/be/congTyGia.ts), không ghi thẳng DB, chạy được trên staging mỗi đêm. Một lần register, một lần
// login cho cả file.
//
// Công ty mới chưa có gian hàng: gian hàng chỉ tạo được qua OAuth với sàn thật, đơn sàn chỉ vào từ gian hàng đó, route
// /finance/settlements/dev/import (bảng kê khuôn OAS) không gắn khi NODE_ENV=production như staging. Nên ở đây chỉ kiểm phần
// chạy được với công ty trống; các test cần bảng kê, đơn có số liệu, tài khoản thứ hai để fixme, ghi lý do.
// Bảng kê theo mã sàn (Documents/21 §12.6 cũ) đã bỏ: trang Đối soát sàn bây giờ là ba tab Tiền theo đơn, Lần đối soát, Khớp sao kê.
import { readFile } from 'node:fs/promises';
import { type Page, expect, test } from '@playwright/test';
import { chua, menu, thayChu } from '../../fixtures';
import { type CongTyGia, taoCongTyGia } from '../congTyGia';

test.describe.configure({ mode: 'serial' });

let s: CongTyGia;
const url = (p: string) => `/c/${s.companyId}${p}`;
const the = (page: Page, label: string) => chua(page, label, '[data-figure]');
/** Số tiền như formatCurrency: dấu chấm nghìn, khoảng trắng bất kỳ trước ₫ */
const tien = (n: number) => new RegExp(`(^|[^\\d.])${n < 0 ? '-' : ''}${Math.abs(n).toLocaleString('de-DE')}\\s₫`);
/** Ngày hôm nay theo giờ Việt Nam (BE tính ngày theo giờ VN), YYYY-MM-DD */
const homNay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
const dmy = (d: string) => d.split('-').reverse().join('/');

const CAN_GIAN_HANG =
  'Cần gian hàng và bảng kê: gian hàng chỉ tạo qua OAuth sàn thật, /finance/settlements/dev/import không gắn ở staging';

test.beforeAll(async ({ browser }) => {
  s = await taoCongTyGia(browser, { ten: 'doi-soat', optionalModules: ['channel', 'report'] });
});
test.afterAll(async () => {
  await s?.dispose();
});

test.describe('P5-BE · Đối soát sàn', () => {
  test('ba tab tiền theo đơn, lần đối soát, khớp sao kê; công ty chưa có gian hàng thì trống, nút kéo quyết toán khoá', async () => {
    const { page } = s;
    await menu(page, 'Đối soát sàn');
    await expect(page.getByRole('tab', { name: 'Tiền theo đơn', exact: true })).toHaveAttribute('aria-selected', 'true');
    await thayChu(page, 'Chưa có trạng thái tiền');

    await page.getByRole('tab', { name: 'Lần đối soát', exact: true }).click();
    await thayChu(page, 'Chưa chạy đối soát');
    // Documents/21 §21.3: POST /finance/settlement-runs cần shopId; chưa chọn gian hàng thì FE khoá nút
    await expect(page.getByRole('button', { name: 'Kéo quyết toán', exact: true })).toBeDisabled();

    await page.getByRole('tab', { name: 'Khớp sao kê', exact: true }).click();
    await thayChu(page, 'Chưa có khoản cần khớp');
    await expect(page.getByRole('button', { name: 'Kéo quyết toán', exact: true })).toHaveCount(0);
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

test.describe('P5-BE · Báo cáo kinh doanh', () => {
  test('CEO: công ty mới, bảy thẻ số bằng 0, không cảnh báo chưa đối soát, bảng gian hàng trống có dòng Tổng', async () => {
    const { page } = s;
    await menu(page, 'Báo cáo kinh doanh');
    for (const label of ['Doanh thu', 'Tiền đã thu', 'Phí sàn', 'Phí cổng', 'Phí vận chuyển', 'Giá vốn', 'Lãi'])
      await thayChu(the(page, label), tien(0));
    await thayChu(page, 'Chưa có số liệu trong khoảng này', 'p');
    await expect(chua(page, 'Có đơn sàn chưa đối soát', '[role=status]')).toHaveCount(0);

    const bang = page.getByRole('table', { name: 'Lãi theo gian hàng', exact: true });
    await expect(bang.locator('tbody')).toContainText('Chưa có số liệu trong khoảng này');
    await expect(bang.locator('tfoot tr')).toContainText('Tổng');
    await thayChu(bang.locator('tfoot tr'), tien(0));

    const today = homNay();
    await page.goto(url(`/reports?from=${today}&to=${today}`));
    await thayChu(page, `${dmy(today)} – ${dmy(today)}`);
    await thayChu(the(page, 'Doanh thu'), tien(0));
  });

  test('CEO: xuất CSV lãi theo gian hàng từ BE, có BOM và dòng Tổng', async () => {
    const { page } = s;
    const today = homNay();
    await page.goto(url(`/reports?from=${today}&to=${today}`));
    await page.getByRole('button', { name: 'Xuất CSV', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Lãi theo gian hàng', exact: true }).click();
    await thayChu(page, 'Đã xuất báo cáo', '[data-sonner-toast]');
    const file = await download;
    expect(file.suggestedFilename()).toBe(`bao-cao-shops-${today}-${today}.csv`);
    const buf = await readFile(await file.path());
    expect([buf[0], buf[1], buf[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = new TextDecoder().decode(buf).trim().split('\r\n');
    expect(lines[0]).toMatch(/^Nguồn,Sàn,Gian hàng,Doanh thu/);
    expect(lines.pop()).toMatch(/^Tổng,,,0,/);
  });

  test('CEO: thẻ số đúng tính tay khi có đơn sàn, cảnh báo đơn chưa đối soát, bảng gian hàng', () => {
    test.fixme(true, 'Cần đơn sàn đã có hoá đơn: đơn chỉ vào từ gian hàng kết nối OAuth, BE không có route tạo đơn');
  });
  test('Phân tích: không có giá vốn, lãi, nút xuất; BE trả null nên FE ẩn', () => {
    test.fixme(true, 'Cần tài khoản thứ hai: mời nhân viên phải xác minh OTP gửi email (/identity/join/otp), không làm qua API được');
  });
});
