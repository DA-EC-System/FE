// P5 · Đối soát tiền sàn: bảng kê, dòng đối soát, chênh lệch, đối soát ngay, nhãn trên đơn (UC-PF-10; FE#13)
import { type Locator, type Page } from '@playwright/test';
import { chon, chu, chua, dangNhap, dong, duongDan, expect, menu, mockApi, test, thayChu, toast } from '../../fixtures';

const CHAN_QUYEN = 'Vai trò của bạn trong công ty này không có quyền mở trang này.';
const DOI_SOAT = '/c/cmp-001/finance/settlements';

const ketoan = (page: Page) => dangNhap(page, 'ketoan@commerio.vn', 'ketoan');
const timKiem = (page: Page) => new URL(page.url()).search;
const coChu = async (el: Locator, ...texts: string[]) => {
  for (const t of texts) await expect(el).toContainText(t);
};
const hopDoiSoat = (page: Page) => chua(page, 'Đối soát ngay', '[role=dialog]');

test.describe('P5 · Đối soát tiền sàn', () => {
  test.describe('danh sách bảng kê (AC-S1)', () => {
    test.beforeEach(({ page }) => ketoan(page));

    test('menu Đối soát sàn mở danh sách mới nhất trước, đủ cột, số chênh lệch tô cảnh báo', async ({ page }) => {
      await menu(page, 'Đối soát sàn');
      await expect.poll(() => duongDan(page)).toBe(DOI_SOAT);
      for (const h of [
        'Mã bảng kê sàn',
        'Gian hàng',
        'Thời điểm bảng kê',
        'Sàn trả',
        'Trạng thái trả',
        'Số dòng',
        'Khớp',
        'Chênh lệch',
        'Sàn đã hoàn',
        'Phiếu thu đã sinh',
      ])
        await thayChu(page, h, 'thead th');
      await expect(page.locator('tbody tr').first()).toHaveAttribute('data-row-id', 'stm-0002');
      await coChu(dong(page, 'stm-0002'), '7395018264001', 'ABC Fashion TikTok Shop (TikTok Shop)', 'Đang xử lý');
      await coChu(dong(page, 'stm-0001'), '2026101400001', 'ABC Fashion Official (Shopee)', 'Đã trả');
      await expect(dong(page, 'stm-0001').locator('[data-warn]')).toHaveText('3');
      await expect(dong(page, 'stm-0002')).toBeAttached();
      await expect(dong(page, 'stm-0002').locator('[data-warn]')).toHaveCount(0);
      await expect(dong(page, 'stm-0003')).toContainText('Thất bại');
    });

    test('lọc gian hàng, trạng thái trả, ngày lên URL; không có kết quả thì báo', async ({ page }) => {
      await page.goto(DOI_SOAT);
      await chon(page, 'Gian hàng', /ABC Fashion Official/);
      await expect.poll(() => timKiem(page)).toContain('shopId=shp-001');
      await expect(page.locator('tbody tr')).toHaveCount(1);
      await expect(dong(page, 'stm-0001')).toBeAttached();
      await chon(page, 'Trạng thái trả', 'Đang xử lý');
      await expect.poll(() => timKiem(page)).toContain('paymentStatus=PROCESSING');
      await thayChu(page, 'Không có bảng kê phù hợp');

      await page.goto(`${DOI_SOAT}?from=2026-10-16`);
      await expect(dong(page, 'stm-0002')).toBeAttached();
      await expect(page.locator('tbody tr[data-row-id=stm-0001]')).toHaveCount(0);
    });

    test('bấm dòng mở chi tiết bảng kê', async ({ page }) => {
      await page.goto(DOI_SOAT);
      await dong(page, 'stm-0001').click();
      await expect.poll(() => duongDan(page)).toBe(`${DOI_SOAT}/stm-0001`);
      await thayChu(page, 'Bảng kê 2026101400001', 'h1');
    });
  });

  test.describe('chi tiết bảng kê (AC-S2)', () => {
    test.beforeEach(({ page }) => ketoan(page));

    test('đầu trang đủ thông tin và kết quả khớp', async ({ page }) => {
      await page.goto(`${DOI_SOAT}/stm-0001`);
      await thayChu(page, 'Bảng kê 2026101400001', 'h1');
      for (const l of ['Gian hàng', 'Mã bảng kê sàn', 'Thời điểm bảng kê', 'Trạng thái trả', 'Sàn trả', 'Phiếu thu đã sinh', 'Số dòng'])
        await thayChu(page, l);
      await thayChu(page, 'Khớp 1');
      await thayChu(page, 'Chênh lệch 3');
      await thayChu(page, 'Sàn đã hoàn 1');
      await expect(page.locator('tbody tr[data-row-id]')).toHaveCount(5);
    });

    test('cột đơn hàng, kết quả, phiếu thu đúng từng loại dòng', async ({ page }) => {
      await page.goto(`${DOI_SOAT}/stm-0001`);
      await expect(dong(page, 'stl-line-0001')).toContainText('Khớp');
      await expect(dong(page, 'stl-line-0001').getByRole('link', { name: 'PT-000005', exact: true })).toBeAttached();
      await coChu(dong(page, 'stl-line-0002'), '2610149999999', 'Không có trong hệ thống', 'Không tìm thấy đơn');
      await expect(dong(page, 'stl-line-0003')).toContainText('Lệch doanh thu');
      await coChu(dong(page, 'stl-line-0004'), 'Giữ lại', 'Sai công thức');
      await expect(dong(page, 'stl-line-0005')).toContainText('Sàn đã hoàn');
    });

    test('mở rộng dòng: bảy ô phí, phép kiểm công thức, lệch tô đỏ', async ({ page }) => {
      await page.goto(`${DOI_SOAT}/stm-0001`);
      await dong(page, 'stl-line-0001').getByRole('button', { name: 'Mở rộng', exact: true }).click();
      const breakdown = page.locator('[data-expanded-for=stl-line-0001] [data-testid=line-breakdown]');
      for (const l of ['Hoa hồng', 'Phí giao dịch', 'Phí hạ tầng', 'Tiếp thị liên kết', 'Chiến dịch', 'Thuế', 'Khác'])
        await thayChu(breakdown, l);
      await thayChu(breakdown, 'Doanh thu − Phí − Vận chuyển + Điều chỉnh');
      await expect(breakdown.locator('.text-destructive')).toHaveCount(0);
      await dong(page, 'stl-line-0001').getByRole('button', { name: 'Thu gọn', exact: true }).click();
      await expect(page.locator('[data-expanded-for=stl-line-0001]')).toHaveCount(0);

      await dong(page, 'stl-line-0004').getByRole('button', { name: 'Mở rộng', exact: true }).click();
      await thayChu(page.locator('[data-expanded-for=stl-line-0004]'), /^Lệch 5\.000\s₫$/, '.text-destructive');

      await dong(page, 'stl-line-0003').getByRole('button', { name: 'Mở rộng', exact: true }).click();
      await thayChu(page.locator('[data-expanded-for=stl-line-0003]'), /Doanh thu sàn 170\.000\s₫, tổng đơn .+, lệch .+₫/);

      await dong(page, 'stl-line-0005').getByRole('button', { name: 'Mở rộng', exact: true }).click();
      await expect(page.locator('[data-expanded-for=stl-line-0005]')).toContainText('sàn hoàn');
    });

    test('tab Khớp / Chênh lệch / Sàn đã hoàn lọc dòng trên URL', async ({ page }) => {
      await page.goto(`${DOI_SOAT}/stm-0001`);
      const rows = page.locator('tbody tr[data-row-id]');
      await page.getByRole('tab', { name: 'Chênh lệch', exact: true }).click();
      await expect.poll(() => timKiem(page)).toContain('match=discrepancy');
      await expect(rows).toHaveCount(3);
      await page.getByRole('tab', { name: 'Sàn đã hoàn', exact: true }).click();
      await expect(rows).toHaveCount(1);
      await expect(dong(page, 'stl-line-0005')).toBeAttached();
      await page.getByRole('tab', { name: 'Tất cả', exact: true }).click();
      await expect.poll(() => timKiem(page)).toBe('');
    });

    test('?line= tô sáng và mở sẵn dòng', async ({ page }) => {
      await page.goto(`${DOI_SOAT}/stm-0001?line=stl-line-0003`);
      await expect(dong(page, 'stl-line-0003')).toContainClass('bg-primary/10');
      await expect(page.locator('[data-expanded-for=stl-line-0003] [data-testid=line-breakdown]')).toBeAttached();
    });

    test('bảng kê không có hoặc của công ty khác thì báo không tìm thấy', async ({ page }) => {
      await page.goto(`${DOI_SOAT}/stm-khong-co`);
      await thayChu(page, 'Không tìm thấy bảng kê. Bảng kê không tồn tại hoặc không thuộc công ty này.');
      await page.getByRole('button', { name: 'Đối soát sàn', exact: true }).click();
      await expect.poll(() => duongDan(page)).toBe(DOI_SOAT);
    });
  });

  test.describe('tab Chênh lệch (AC-S3)', () => {
    test.beforeEach(({ page }) => ketoan(page));

    test('liệt kê mọi dòng chênh lệch, link về bảng kê, lọc lý do', async ({ page }) => {
      await page.goto(DOI_SOAT);
      await page.getByRole('tab', { name: 'Chênh lệch', exact: true }).click();
      await expect.poll(() => timKiem(page)).toContain('tab=discrepancies');
      await expect(page.locator('tbody tr[data-row-id]')).toHaveCount(4);
      for (const h of ['Bảng kê', 'Mã giao dịch sàn', 'Loại', 'Đơn hàng', 'Doanh thu', 'Tiền về', 'Tổng đơn', 'Lý do'])
        await thayChu(page, h, 'thead th');
      await coChu(dong(page, 'stl-line-0009'), '7395018263777', 'Không tìm thấy đơn');

      await chon(page, 'Lý do', 'Lệch doanh thu');
      await expect(page.locator('tbody tr[data-row-id]')).toHaveCount(1);
      await dong(page, 'stl-line-0003').getByRole('link', { name: '2026101400001', exact: true }).click();
      await expect.poll(() => duongDan(page)).toBe(`${DOI_SOAT}/stm-0001`);
    });
  });

  test.describe('đối soát ngay (AC-S4)', () => {
    test('Kế toán chạy cho mọi gian hàng hoặc một gian hàng', async ({ page }) => {
      await ketoan(page);
      await page.goto(DOI_SOAT);
      await page.getByRole('button', { name: 'Đối soát ngay', exact: true }).click();
      await expect(hopDoiSoat(page).getByRole('combobox', { name: 'Gian hàng', exact: true })).toContainText('Mọi gian hàng');
      await hopDoiSoat(page).getByRole('button', { name: 'Đối soát', exact: true }).click();
      await toast(page, 'Đã bắt đầu đối soát, kết quả sẽ hiện khi chạy xong');
      await expect(page.locator('[role=dialog]')).toHaveCount(0);
    });

    test('BE trả 409 thì báo trong hộp thoại; 422 thì báo dưới ô gian hàng', async ({ page }) => {
      await ketoan(page);
      await page.goto(DOI_SOAT);
      await expect(dong(page, 'stm-0001')).toBeAttached();
      await mockApi(page, 'post', '/finance/settlements/run', 409, { status: 409, code: 'run_in_progress', title: 'Conflict' });
      await page.getByRole('button', { name: 'Đối soát ngay', exact: true }).click();
      await hopDoiSoat(page).getByRole('button', { name: 'Đối soát', exact: true }).click();
      await thayChu(hopDoiSoat(page), 'Lần đối soát trước chưa chạy xong, thử lại sau.', '[role=alert]');
      await mockApi(page, 'post', '/finance/settlements/run', 422, {
        status: 422,
        code: 'validation_failed',
        title: 'Invalid',
        errors: { shopId: 'Gian hàng đã ngắt kết nối' },
      });
      await hopDoiSoat(page).getByRole('button', { name: 'Đối soát', exact: true }).click();
      await thayChu(hopDoiSoat(page), 'Gian hàng đã ngắt kết nối');
      await hopDoiSoat(page).getByRole('button', { name: 'Huỷ', exact: true }).click();
      await expect(page.locator('[role=dialog]')).toHaveCount(0);
    });

    test('Kiểm soát chỉ xem: không có nút Đối soát ngay', async ({ page }) => {
      await dangNhap(page, 'kiemsoat@commerio.vn', 'kiemsoat');
      await menu(page, 'Đối soát sàn');
      await expect(dong(page, 'stm-0001')).toBeAttached();
      await expect(page.getByRole('button', { name: 'Đối soát ngay', exact: true })).toHaveCount(0);
    });
  });

  test.describe('nhãn trên chi tiết đơn (AC-S5)', () => {
    test('đơn sàn có dòng hoàn và chênh lệch: hai nhãn, nhãn Sàn đã hoàn mở bảng kê', async ({ page }) => {
      await ketoan(page);
      await page.goto('/c/cmp-001/sales/orders/ord-1002');
      await thayChu(page, 'Chênh lệch đối soát');
      await page.getByRole('link', { name: 'Sàn đã hoàn', exact: true }).click();
      await expect.poll(() => duongDan(page)).toBe(`${DOI_SOAT}/stm-0001`);
    });

    test('đơn khớp bình thường không có nhãn', async ({ page }) => {
      await ketoan(page);
      await page.goto('/c/cmp-001/sales/orders/ord-1012');
      await thayChu(page, /.+/, 'h1');
      await expect(page.getByText(chu('Chênh lệch đối soát'))).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Sàn đã hoàn', exact: true })).toHaveCount(0);
    });
  });

  test.describe('phân quyền và phân hệ', () => {
    test('Sale không có menu, gõ đường dẫn bị chặn', async ({ page }) => {
      await dangNhap(page, 'sale@commerio.vn', 'sale');
      await menu(page, 'Tổng quan');
      await expect(page.locator('[data-sidebar="menu-button"]', { hasText: chu('Đối soát sàn') })).toHaveCount(0);
      await page.goto(DOI_SOAT);
      await thayChu(page, CHAN_QUYEN);
    });

    test('công ty chưa bật Kênh bán: gõ đường dẫn báo phân hệ chưa bật', async ({ page }) => {
      await dangNhap(page, 'ceo@commerio.vn', 'ceo', 'Minh Phát');
      await menu(page, 'Tổng quan');
      await expect(page.locator('[data-sidebar="menu-button"]', { hasText: chu('Đối soát sàn') })).toHaveCount(0);
      await page.goto('/c/cmp-003/finance/settlements');
      await expect(page.locator('main')).toContainText('Phân hệ chưa bật');
    });
  });
});
