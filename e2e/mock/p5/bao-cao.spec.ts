// P5 · Báo cáo kinh doanh: thẻ số, biểu đồ theo ngày, lãi theo gian hàng, xuất CSV (UC-RP-01, UC-RP-02; FE#13)
import { readFile } from 'node:fs/promises';
import { type Locator, type Page } from '@playwright/test';
import { chon, chu, chua, dangNhap, duongDan, expect, gan, menu, mockApi, test, thayChu, toast } from '../../fixtures';

const CHAN_QUYEN = 'Vai trò của bạn trong công ty này không có quyền mở trang này.';
const KHONG_QUYEN_THAO_TAC = 'Bạn không có quyền thực hiện thao tác này';
const BAO_CAO = '/c/cmp-001/reports';

const DAY_MS = 86_400_000;
/** Ngày giờ VN cách hôm nay `n` ngày, yyyy-mm-dd như mock */
const vnDay = (n = 0) => new Date(Date.now() + 7 * 3600_000 + n * DAY_MS).toISOString().slice(0, 10);
const dmy = (d: string) => d.split('-').reverse().join('/');

const phantich = (page: Page) => dangNhap(page, 'phantich@commerio.vn', 'phantich');
const the = (page: Page, label: string) => chua(page, label, '[data-figure]');
const bangGianHang = (page: Page) => page.getByRole('table', { name: 'Lãi theo gian hàng', exact: true });
const timKiem = (page: Page) => new URL(page.url()).search;
const coMenu = async (page: Page, label: string, co: boolean) => {
  const muc = page.locator('[data-sidebar="menu-button"]', { hasText: new RegExp(`^\\s*${label}\\s*$`) });
  if (co) await expect(muc.first()).toBeAttached();
  else await expect(muc).toHaveCount(0);
};
const coChu = async (el: Locator, ...texts: string[]) => {
  for (const t of texts) await expect(el).toContainText(t);
};
/** Bấm xuất rồi lấy tệp tải về */
const taiVe = async (page: Page, item: string) => {
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: item, exact: true }).click();
  return download;
};

test.describe('P5 · Báo cáo kinh doanh', () => {
  test.describe('khoảng ngày (AC-B1)', () => {
    test.beforeEach(({ page }) => dangNhap(page, 'ceo@commerio.vn', 'ceo'));

    test('mặc định 30 ngày theo BE; nút nhanh đưa from/to lên URL, tải lại vẫn giữ', async ({ page }) => {
      await menu(page, 'Báo cáo kinh doanh');
      await expect.poll(() => timKiem(page)).toBe('');
      await thayChu(page, `${dmy(vnDay(-29))} – ${dmy(vnDay())}`);
      await expect(page.getByRole('button', { name: '30 ngày', exact: true })).toHaveAttribute('aria-pressed', 'true');
      for (const n of ['7 ngày', 'Tháng này', 'Tháng trước', 'Tuỳ chọn'])
        await expect(page.getByRole('button', { name: n, exact: true })).toBeAttached();

      await page.getByRole('button', { name: '7 ngày', exact: true }).click();
      await expect.poll(() => timKiem(page)).toBe(`?from=${vnDay(-6)}&to=${vnDay()}`);
      await thayChu(page, `${dmy(vnDay(-6))} – ${dmy(vnDay())}`);
      await page.reload();
      await expect(page.getByRole('button', { name: '7 ngày', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await thayChu(page, `${dmy(vnDay(-6))} – ${dmy(vnDay())}`);

      await page.getByRole('button', { name: '30 ngày', exact: true }).click();
      await expect.poll(() => timKiem(page)).toBe('');
    });

    test('Tuỳ chọn sai thì zod báo dưới ô, không đổi URL; đúng thì áp dụng', async ({ page }) => {
      await page.goto(BAO_CAO);
      await page.getByRole('button', { name: 'Tuỳ chọn', exact: true }).click();
      const nhap = async (from: string, to: string) => {
        await page.getByLabel('Từ ngày', { exact: true }).fill(from);
        await page.getByLabel('Đến ngày', { exact: true }).fill(to);
        await page.getByRole('button', { name: 'Áp dụng', exact: true }).click();
      };
      await nhap(vnDay(-3), vnDay(-10));
      await thayChu(page, 'Từ ngày phải trước hoặc bằng Đến ngày');
      await nhap(vnDay(-400), vnDay());
      await thayChu(page, 'Khoảng tối đa 366 ngày');
      await nhap(vnDay(2), vnDay(5));
      await thayChu(page, 'Từ ngày không được sau hôm nay');
      await expect.poll(() => timKiem(page)).toBe('');

      await nhap(vnDay(-12), vnDay(-2));
      await expect.poll(() => timKiem(page)).toBe(`?from=${vnDay(-12)}&to=${vnDay(-2)}`);
      await thayChu(page, `${dmy(vnDay(-12))} – ${dmy(vnDay(-2))}`);
    });

    test('BE trả 422 thì lỗi hiện dưới đúng ô', async ({ page }) => {
      await page.goto(`${BAO_CAO}?from=${vnDay(-3)}&to=${vnDay(-10)}`);
      await expect(gan(page.getByLabel('Từ ngày', { exact: true }), 'data-slot', 'form-item')).toContainText(
        'Từ ngày phải trước hoặc bằng đến ngày',
      );
      await expect(page.locator('[data-figure]')).toHaveCount(0);
    });
  });

  test.describe('thẻ số, biểu đồ, bảng gian hàng (AC-B2 đến AC-B4)', () => {
    test.beforeEach(({ page }) => dangNhap(page, 'ceo@commerio.vn', 'ceo'));

    test('đủ bảy thẻ, giờ tính, chú thích cố định, cảnh báo phí sàn có link sang đối soát', async ({ page }) => {
      await page.goto(BAO_CAO);
      for (const l of ['Doanh thu', 'Tiền đã thu', 'Phí sàn', 'Phí cổng', 'Phí vận chuyển', 'Giá vốn', 'Lãi'])
        await expect(the(page, l)).toContainText('₫');
      await thayChu(page, /Số liệu tính lúc \d{2}:\d{2} \d{2}\/\d{2}\/\d{4}/);
      await thayChu(page, 'Phí cổng thanh toán và chi phí vận chuyển của đơn tự giao chưa được thu thập, đang tính 0');
      await chua(
        page,
        'Có đơn sàn chưa đối soát, phí sàn của những ngày đó đang tính 0 nên lãi có thể cao hơn thực tế.',
        '[role=status]',
      )
        .getByRole('link', { name: 'Xem đối soát sàn', exact: true })
        .click();
      await expect.poll(() => duongDan(page)).toBe('/c/cmp-001/finance/settlements');
    });

    test('khoảng chưa có số: ghi chưa có số liệu, thẻ là 0 ₫', async ({ page }) => {
      await page.goto(`${BAO_CAO}?from=2025-01-01&to=2025-01-31`);
      await thayChu(page, 'Chưa có số liệu trong khoảng này');
      await expect(the(page, 'Doanh thu').locator('.tabular-nums')).toHaveText(/^0\s₫$/);
      await expect(the(page, 'Lãi').locator('.tabular-nums')).toHaveText(/^0\s₫$/);
      await expect(page.getByText(chu('Có đơn sàn chưa đối soát'))).toHaveCount(0);
    });

    test('ngày lãi âm: số âm chữ đỏ', async ({ page }) => {
      await page.goto(`${BAO_CAO}?from=${vnDay(-9)}&to=${vnDay(-9)}`);
      await expect(the(page, 'Lãi').locator('.text-destructive')).toHaveText(/^-150\.000\s₫$/);
      await expect(chua(bangGianHang(page), 'Tạo tay', 'tr')).toContainText('-50,0%');
    });

    test('biểu đồ ba đường, rê chuột hiện ngày và số; lọc nguồn, gian hàng trên URL', async ({ page }) => {
      await page.goto(`${BAO_CAO}?from=${vnDay(-6)}&to=${vnDay()}`);
      const chart = page.locator('[data-testid=daily-chart]');
      await coChu(chart.locator('.recharts-legend-wrapper'), 'Doanh thu', 'Tiền đã thu', 'Lãi');
      await expect(chart.locator('.recharts-line')).toHaveCount(3);
      await chart.locator('.recharts-wrapper > .recharts-surface').hover();
      await coChu(chart.locator('.recharts-tooltip-wrapper'), dmy(vnDay(-3)), 'Doanh thu', '₫');

      await chon(page, 'Nguồn', 'Hộp thư');
      await expect.poll(() => timKiem(page)).toContain('source=inbox');
      await expect(page.getByRole('combobox', { name: 'Gian hàng', exact: true })).toBeDisabled();
      await chon(page, 'Nguồn', 'Sàn TMĐT');
      await chon(page, 'Gian hàng', /ABC Fashion TikTok Shop/);
      await expect.poll(() => timKiem(page)).toContain('source=marketplace');
      await expect.poll(() => timKiem(page)).toContain('shopId=shp-002');
      await page.reload();
      await expect(page.getByRole('combobox', { name: 'Gian hàng', exact: true })).toContainText('ABC Fashion TikTok Shop');
      // Đổi bộ lọc biểu đồ không đổi thẻ số
      await expect.poll(() => the(page, 'Doanh thu').textContent()).not.toContain(' 0 ₫');
    });

    test('bảng gian hàng: tên kênh, dòng Tổng, sắp xếp, gộp theo nguồn, cảnh báo phí sàn', async ({ page }) => {
      await page.goto(BAO_CAO);
      const bang = bangGianHang(page);
      await expect(chua(bang, 'Doanh thu', 'th')).toHaveAttribute('aria-sort', 'descending');
      await expect(chua(bang, 'ABC Fashion TikTok Shop', 'tbody tr')).toContainText('TikTok Shop');
      await expect(chua(bang, 'ABC Fashion Official', 'tbody tr')).toContainText('Shopee');
      for (const t of ['Hộp thư', 'Tạo tay', 'Gian hàng đã xoá']) await expect(chua(bang, t, 'tbody tr')).toBeAttached();
      await expect(chua(bang, 'Biên lãi', 'th')).toBeAttached();
      await coChu(bang.locator('tfoot tr'), 'Tổng', '%');
      await expect(bang.locator('tbody tr').first()).toContainText('ABC Fashion TikTok Shop');

      const phiVanChuyen = chua(bang, 'Phí vận chuyển', 'th');
      await phiVanChuyen.locator('button').click();
      await expect(phiVanChuyen).toHaveAttribute('aria-sort', 'descending');
      await phiVanChuyen.locator('button').click();
      await expect(phiVanChuyen).toHaveAttribute('aria-sort', 'ascending');
      await expect(bang.locator('tbody tr').first()).toContainText('Tạo tay');

      await chua(bang, 'ABC Fashion TikTok Shop', 'tbody tr').getByLabel('Phí sàn chưa đối soát', { exact: true }).focus();
      await expect(page.getByRole('tooltip')).toContainText('Phí sàn chưa đối soát');

      const tong = await bang.locator('tfoot').textContent();
      await page.getByRole('switch', { name: 'Gộp theo nguồn', exact: true }).click();
      await expect(bang.locator('tbody tr')).toHaveCount(3);
      await expect(chua(bang, 'Sàn TMĐT', 'tbody tr')).toBeAttached();
      await expect.poll(() => bang.locator('tfoot').textContent()).toBe(tong);
    });
  });

  test.describe('xuất CSV (AC-X1, AC-X2)', () => {
    test.beforeEach(({ page }) => dangNhap(page, 'ceo@commerio.vn', 'ceo'));

    test('xuất Lãi theo gian hàng: tên tệp theo BE, BOM, tiêu đề tiếng Việt, dòng Tổng', async ({ page }) => {
      const from = vnDay(-6);
      const to = vnDay();
      await page.goto(`${BAO_CAO}?from=${from}&to=${to}`);
      await page.getByRole('button', { name: 'Xuất CSV', exact: true }).click();
      await expect(page.getByRole('menuitem', { name: 'Tổng quan', exact: true })).toBeAttached();
      await expect(page.getByRole('menuitem', { name: 'Theo ngày', exact: true })).toBeAttached();
      const download = await taiVe(page, 'Lãi theo gian hàng');
      await toast(page, 'Đã xuất báo cáo');
      expect(download.suggestedFilename()).toBe(`bao-cao-shops-${from}-${to}.csv`);
      const buf = await readFile(await download.path());
      expect([buf[0], buf[1], buf[2]]).toEqual([0xef, 0xbb, 0xbf]);
      const text = new TextDecoder().decode(buf);
      expect(text).toContain('Doanh thu,Tiền đã thu,Phí sàn,Phí cổng,Phí vận chuyển,Giá vốn,Lãi');
      expect(text.trim().split('\r\n').pop()).toMatch(/^Tổng/);
    });

    test('xuất Theo ngày gửi kèm bộ lọc đang xem', async ({ page }) => {
      const from = vnDay(-6);
      const to = vnDay();
      await page.goto(`${BAO_CAO}?from=${from}&to=${to}&source=inbox`);
      await page.getByRole('button', { name: 'Xuất CSV', exact: true }).click();
      const download = await taiVe(page, 'Theo ngày');
      await toast(page, 'Đã xuất báo cáo');
      expect(download.suggestedFilename()).toBe(`bao-cao-daily-${from}-${to}.csv`);
      expect(await readFile(await download.path(), 'utf8')).toContain('Ngày');
    });

    test('BE trả lỗi thì báo, không tải tệp', async ({ page }) => {
      await page.goto(BAO_CAO);
      await expect(the(page, 'Doanh thu')).toBeAttached();
      await mockApi(page, 'get', '/report/export', 403, { status: 403, code: 'forbidden', title: 'Forbidden' });
      await page.getByRole('button', { name: 'Xuất CSV', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Tổng quan', exact: true }).click();
      await toast(page, KHONG_QUYEN_THAO_TAC);
      await expect(page.locator('[data-sonner-toast]', { hasText: chu('Đã xuất báo cáo') })).toHaveCount(0);
    });
  });

  test.describe('thiếu quyền giá vốn và xuất tệp (AC-B5, AC-X1)', () => {
    test('Phân tích: không có Giá vốn, Lãi, Biên lãi, đường Lãi, nút Xuất CSV', async ({ page }) => {
      await phantich(page);
      await menu(page, 'Báo cáo kinh doanh');
      await expect(the(page, 'Doanh thu')).toBeAttached();
      await expect(the(page, 'Phí sàn')).toBeAttached();
      await expect(page.locator('[data-figure=cogs], [data-figure=profit]')).toHaveCount(0);
      const th = bangGianHang(page).locator('th');
      await expect(th).toHaveCount(6);
      await expect(th.filter({ hasText: chu('Giá vốn') })).toHaveCount(0);
      await expect(th.filter({ hasText: chu('Lãi') })).toHaveCount(0);
      await expect(chua(bangGianHang(page), 'Hộp thư', 'tbody tr')).not.toContainText('%');
      await expect(page.locator('[data-testid=daily-chart] .recharts-line')).toHaveCount(2);
      await expect(page.locator('[data-testid=daily-chart] .recharts-legend-wrapper')).not.toContainText('Lãi');
      await expect(page.getByRole('button', { name: 'Xuất CSV', exact: true })).toHaveCount(0);
    });
  });

  test.describe('phân quyền, phân hệ, lỗi BE (AC-P1 đến AC-P3)', () => {
    test('CEO thấy Báo cáo kinh doanh và Đối soát sàn', async ({ page }) => {
      await dangNhap(page, 'ceo@commerio.vn', 'ceo');
      await coMenu(page, 'Báo cáo kinh doanh', true);
      await coMenu(page, 'Đối soát sàn', true);
    });

    test('Phân tích thấy Báo cáo kinh doanh và Đối soát sàn (chỉ xem)', async ({ page }) => {
      await phantich(page);
      await coMenu(page, 'Báo cáo kinh doanh', true);
      await coMenu(page, 'Đối soát sàn', true);
    });

    for (const u of ['ketoan', 'kiemsoat'] as const) {
      test(`${u}: thấy Đối soát sàn, không thấy Báo cáo kinh doanh`, async ({ page }) => {
        await dangNhap(page, `${u}@commerio.vn`, u);
        await coMenu(page, 'Đối soát sàn', true);
        await coMenu(page, 'Báo cáo kinh doanh', false);
      });
    }

    test('Kho không thấy Báo cáo kinh doanh', async ({ page }) => {
      await dangNhap(page, 'kho@commerio.vn', 'kho');
      await menu(page, 'Tổng quan');
      await coMenu(page, 'Báo cáo kinh doanh', false);
    });

    test('Admin có quyền xem báo cáo nhưng thiếu quyền tài chính (D18): không có menu, gõ đường dẫn bị chặn', async ({ page }) => {
      await dangNhap(page, 'admin@commerio.vn', 'admin');
      await menu(page, 'Tổng quan');
      await coMenu(page, 'Báo cáo kinh doanh', false);
      await page.goto(BAO_CAO);
      await thayChu(page, CHAN_QUYEN);
    });

    test('Sale không có menu, gõ đường dẫn bị chặn', async ({ page }) => {
      await dangNhap(page, 'sale@commerio.vn', 'sale');
      await menu(page, 'Tổng quan');
      await coMenu(page, 'Báo cáo kinh doanh', false);
      await page.goto(BAO_CAO);
      await thayChu(page, CHAN_QUYEN);
    });

    test('công ty chưa bật Báo cáo: không có menu, gõ đường dẫn báo phân hệ chưa bật', async ({ page }) => {
      await dangNhap(page, 'ceo@commerio.vn', 'ceo', 'Minh Phát');
      await menu(page, 'Tổng quan');
      await coMenu(page, 'Báo cáo kinh doanh', false);
      await page.goto('/c/cmp-003/reports');
      await expect(page.locator('main')).toContainText('Phân hệ chưa bật');
    });

    test('BE trả 403 module_disabled hoặc forbidden thì báo lỗi, không hiện số cũ', async ({ page }) => {
      await dangNhap(page, 'ceo@commerio.vn', 'ceo');
      await page.goto(BAO_CAO);
      await expect(the(page, 'Doanh thu')).toBeAttached();
      await mockApi(page, 'get', '/report/overview', 403, { status: 403, code: 'module_disabled', title: 'Phân hệ Báo cáo đang tắt' });
      await page.getByRole('button', { name: '7 ngày', exact: true }).click();
      await thayChu(page, 'Phân hệ này đã bị tắt', '[role=alert]');
      await expect(page.locator('[data-figure]')).toHaveCount(0);

      await mockApi(page, 'get', '/report/shops', 403, { status: 403, code: 'forbidden', title: 'Forbidden' });
      await page.getByRole('button', { name: 'Tháng này', exact: true }).click();
      await thayChu(page, KHONG_QUYEN_THAO_TAC, '[role=alert]');
      await expect(page.locator('[data-figure]')).toHaveCount(0);
      await expect(bangGianHang(page)).toHaveCount(0);
    });
  });
});
