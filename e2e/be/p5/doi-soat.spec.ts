// P5 với BE thật · Đối soát tiền sàn và báo cáo kinh doanh (FE#13; commerio-backend#29, #30). Dựng dữ liệu trước mỗi lần chạy
// bằng e2e/be/seed/doi-soat.mts (xem đầu file đó), ghi ra e2e/be/seed/fe13-be.json.
// Năm đơn sàn có hoá đơn hôm nay: 100.000 khớp, 200.000 sàn đã hoàn, 150.000 lệch doanh thu, 80.000 ở bảng kê chưa trả,
// 120.000 chưa đối soát. Mỗi dòng đơn phí 17.000, vận chuyển 15.000, tiền về = doanh thu sàn − 32.000.
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { type Page } from '@playwright/test';
import { chon, chu, chua, dong, duongDan, expect, menu, test, thayChu } from '../../fixtures';

interface Don {
  orderId: string;
  code: string;
  externalOrderId: string;
  total: number;
}
interface Seed {
  email: string;
  analyst: string;
  password: string;
  companyId: string;
  shopId: string;
  shopName: string;
  today: string;
  orders: Record<'matched' | 'refunded' | 'mismatch' | 'processing' | 'unsettled', Don>;
  tx: Record<'matched' | 'notFound' | 'refunded' | 'mismatch' | 'processing', string>;
  statements: Record<'paid' | 'processing', { id: string; code: string }>;
}

let s: Seed;
const url = (p: string) => `/c/${s.companyId}${p}`;
const dongCo = (page: Page, text: string) => chua(page, text, 'tbody tr[data-row-id]');
const the = (page: Page, label: string) => chua(page, label, '[data-figure]');
/** Số tiền như formatCurrency: dấu chấm nghìn, khoảng trắng bất kỳ trước ₫ */
const tien = (n: number) => new RegExp(`${n < 0 ? '-' : ''}${Math.abs(n).toLocaleString('de-DE')}\\s₫`);
const dmy = (d: string) => d.split('-').reverse().join('/');

async function dangNhap(page: Page, email: string) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(s.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect.poll(() => duongDan(page)).toMatch(new RegExp(`^/c/${s.companyId}`));
}

test.beforeAll(() => {
  s = JSON.parse(readFileSync(new URL('../seed/fe13-be.json', import.meta.url), 'utf8')) as Seed;
});

test.describe('P5-BE · Đối soát sàn', () => {
  test.beforeEach(({ page }) => dangNhap(page, s.email));

  test('danh sách bảng kê: mới nhất trước, số đếm, tiền về, phiếu thu đã sinh', async ({ page }) => {
    const rows = page.locator('tbody tr[data-row-id]');
    await menu(page, 'Đối soát sàn');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toHaveAttribute('data-row-id', s.statements.processing.id);
    for (const t of [s.statements.processing.code, `${s.shopName} (TikTok Shop)`, 'Đang xử lý'])
      await expect(dong(page, s.statements.processing.id)).toContainText(t);
    for (const t of ['Đã trả', '372.000', '186.000']) await expect(dong(page, s.statements.paid.id)).toContainText(t);
    await expect(dong(page, s.statements.paid.id).locator('[data-warn]')).toHaveText('2');

    await chon(page, 'Trạng thái trả', 'Đã trả');
    await expect(rows).toHaveCount(1);
    await dong(page, s.statements.paid.id).click();
    await expect.poll(() => duongDan(page)).toBe(url(`/finance/settlements/${s.statements.paid.id}`));
  });

  test('chi tiết bảng kê đã trả: kết quả khớp từng dòng, phiếu thu, công thức', async ({ page }) => {
    await page.goto(url(`/finance/settlements/${s.statements.paid.id}`));
    await thayChu(page, `Bảng kê ${s.statements.paid.code}`, 'h1');
    await thayChu(page, 'Khớp 1');
    await thayChu(page, 'Chênh lệch 2');
    await thayChu(page, 'Sàn đã hoàn 1');

    for (const t of [s.orders.matched.code, 'Khớp']) await expect(dongCo(page, s.tx.matched)).toContainText(t);
    await thayChu(dongCo(page, s.tx.matched), /^PT-/, 'a');
    for (const t of [s.orders.refunded.code, 'Sàn đã hoàn', 'PT-']) await expect(dongCo(page, s.tx.refunded)).toContainText(t);
    await expect(dongCo(page, s.tx.mismatch)).toContainText('Lệch doanh thu');
    await expect(dongCo(page, s.tx.mismatch)).not.toContainText('PT-');
    for (const t of ['Không có trong hệ thống', 'Không tìm thấy đơn']) await expect(dongCo(page, s.tx.notFound)).toContainText(t);

    await dongCo(page, s.tx.mismatch).getByRole('button', { name: 'Mở rộng', exact: true }).click();
    const breakdown = page.locator('[data-testid=line-breakdown]');
    await expect(breakdown).toContainText('Hoa hồng');
    await expect(breakdown).toContainText('Doanh thu − Phí − Vận chuyển + Điều chỉnh');
    await thayChu(breakdown, /Doanh thu sàn 140\.000\s₫, tổng đơn 150\.000\s₫, lệch 10\.000\s₫/);
    await expect(page.locator('[data-testid=line-breakdown] .text-destructive')).toHaveCount(0);

    // Phiếu thu sinh từ dòng khớp mở được
    await chua(dongCo(page, s.tx.matched), /^PT-/, 'a').click();
    await expect.poll(() => duongDan(page)).toMatch(new RegExp(`^/c/${s.companyId}/finance/receipts/`));
    await thayChu(page, /68\.000\s₫/);
  });

  test('bảng kê chưa trả: phiếu thu chờ sàn trả', async ({ page }) => {
    await page.goto(url(`/finance/settlements/${s.statements.processing.id}`));
    await expect(dongCo(page, s.tx.processing)).toContainText('Khớp');
    await expect(dongCo(page, s.tx.processing)).toContainText('Chờ sàn trả');
  });

  test('tab Chênh lệch: hai dòng, link về bảng kê theo mã sàn', async ({ page }) => {
    await page.goto(url('/finance/settlements?tab=discrepancies'));
    await expect(page.locator('tbody tr[data-row-id]')).toHaveCount(2);
    await chon(page, 'Lý do', 'Không tìm thấy đơn');
    await expect(page.locator('tbody tr[data-row-id]')).toHaveCount(1);
    await dongCo(page, s.tx.notFound).getByRole('link', { name: s.statements.paid.code, exact: true }).click();
    await expect.poll(() => duongDan(page)).toBe(url(`/finance/settlements/${s.statements.paid.id}`));
  });

  // Nhãn đối soát ở chi tiết đơn chỉ thử bằng mock: BE chưa có GET /sales/orders/:id (#24, #25)

  test('BE chưa có đối soát ngay: không hiện nút', async ({ page }) => {
    await page.goto(url('/finance/settlements'));
    await expect(dong(page, s.statements.paid.id)).toBeAttached();
    await expect(page.getByRole('button', { name: 'Đối soát ngay', exact: true })).toHaveCount(0);
  });
});

test.describe('P5-BE · Báo cáo kinh doanh', () => {
  // Doanh thu 650.000; tiền đã thu = phiếu thu khớp 68.000 + hoàn 118.000; phí sàn 4 × 17.000; vận chuyển 4 × 15.000; chưa có giá vốn
  const SO = { revenue: 650000, cash: 186000, platformFee: 68000, shipping: 60000, cogs: 0, profit: 522000 };

  test('CEO: thẻ số đúng tính tay, cảnh báo đơn chưa đối soát, bảng gian hàng', async ({ page }) => {
    await dangNhap(page, s.email);
    await menu(page, 'Báo cáo kinh doanh');
    await thayChu(the(page, 'Doanh thu'), tien(SO.revenue));
    await thayChu(the(page, 'Tiền đã thu'), tien(SO.cash));
    await thayChu(the(page, 'Phí sàn'), tien(SO.platformFee));
    await thayChu(the(page, 'Phí cổng'), tien(0));
    await thayChu(the(page, 'Phí vận chuyển'), tien(SO.shipping));
    await thayChu(the(page, 'Giá vốn'), tien(SO.cogs));
    await thayChu(the(page, 'Lãi'), tien(SO.profit));
    await thayChu(page, /Số liệu tính lúc \d{2}:\d{2} \d{2}\/\d{2}\/\d{4}/);
    await expect(
      chua(page, 'Có đơn sàn chưa đối soát', '[role=status]').getByRole('link', { name: 'Xem đối soát sàn', exact: true }),
    ).toBeAttached();

    const bang = page.getByRole('table', { name: 'Lãi theo gian hàng', exact: true });
    for (const t of ['TikTok Shop', '80,3%']) await expect(chua(bang, s.shopName, 'tbody tr')).toContainText(t);
    await expect(chua(bang, s.shopName, 'tbody tr').getByLabel('Phí sàn chưa đối soát', { exact: true })).toBeAttached();
    await expect(bang.locator('tfoot tr')).toContainText('Tổng');
    await thayChu(bang.locator('tfoot tr'), tien(SO.profit));
    await expect(page.locator('[data-testid=daily-chart] .recharts-line')).toHaveCount(3);

    await page.goto(url(`/reports?from=${s.today}&to=${s.today}`));
    await thayChu(page, `${dmy(s.today)} – ${dmy(s.today)}`);
    await thayChu(the(page, 'Doanh thu'), tien(SO.revenue));
  });

  test('CEO: xuất CSV lãi theo gian hàng từ BE, có BOM và dòng Tổng', async ({ page }) => {
    await dangNhap(page, s.email);
    await page.goto(url(`/reports?from=${s.today}&to=${s.today}`));
    await page.getByRole('button', { name: 'Xuất CSV', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Lãi theo gian hàng', exact: true }).click();
    await thayChu(page, 'Đã xuất báo cáo', '[data-sonner-toast]');
    const file = await download;
    expect(file.suggestedFilename()).toBe(`bao-cao-shops-${s.today}-${s.today}.csv`);
    const buf = await readFile(await file.path());
    expect([buf[0], buf[1], buf[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(buf);
    expect(text).toContain(s.shopName);
    expect(text).toContain('522000');
    expect(text.trim().split('\r\n').pop()).toMatch(/^Tổng/);
  });

  test('Phân tích: không có giá vốn, lãi, nút xuất; BE trả null nên FE ẩn', async ({ page }) => {
    await dangNhap(page, s.analyst);
    await menu(page, 'Báo cáo kinh doanh');
    await thayChu(the(page, 'Doanh thu'), tien(SO.revenue));
    await expect(page.locator('[data-figure=cogs], [data-figure=profit]')).toHaveCount(0);
    await expect(
      page.getByRole('table', { name: 'Lãi theo gian hàng', exact: true }).locator('th').filter({ hasText: chu('Lãi') }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Xuất CSV', exact: true })).toHaveCount(0);
  });
});
