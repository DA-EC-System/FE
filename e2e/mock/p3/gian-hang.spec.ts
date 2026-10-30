// P3 · Gian hàng: kết nối OAuth, ghép SKU, đẩy sản phẩm và giá (UC-CH-01, UC-CH-02; FE#8)
// Vòng đời gian hàng và listing theo sơ đồ C1, C2 (FE#58)
import { type Page } from '@playwright/test';
import { chon, chu, chua, dangNhap, dong, duongDan, expect, menu, mockApi, moiPhanTu, test, thayChu, toast } from '../../fixtures';

const moTrangGhep = async (page: Page, shopId: string) => {
  await dong(page, shopId).getByRole('button', { name: 'Ghép SKU', exact: true }).click();
  await expect.poll(() => duongDan(page)).toMatch(new RegExp(`/channel/shops/${shopId}$`));
  await expect(page.locator('[data-testid=match-summary]')).toBeAttached();
};

const trangThai = (page: Page, shopId: string) => dong(page, shopId).locator('[data-testid=shop-status]');
/** Dòng biến thể ở bảng ghép (bảng SKU sàn chưa ghép bên dưới cũng có data-row-id) */
const dongBienThe = (page: Page) => page.locator('tbody').first().locator('tr[data-row-id]');
const trangThaiListing = (page: Page, variantId: string) => dong(page, variantId).locator('[data-testid=listing-status]');
/** Có ít nhất một phần tử khớp selector chứa chữ */
const coPhanTu = (page: Page, selector: string, text: string) =>
  expect(page.locator(selector).filter({ hasText: chu(text) })).not.toHaveCount(0);

/** Chuyển trang trong app (giữ dữ liệu giả trong bộ nhớ, khác page.goto nạp lại) */
const diToi = (page: Page, path: string) =>
  page.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);

const phat = (page: Page, type: string) =>
  page.locator(`[data-event="${type}"]`).getByRole('button', { name: 'Phát', exact: true }).click();

test.describe('P3 · Gian hàng', () => {
  test.describe('kết nối gian hàng (UC-CH-01)', () => {
    test.beforeEach(async ({ page }) => {
      await dangNhap(page, 'ceo@commerio.vn', 'ceo');
      await menu(page, 'Kênh bán');
      await expect(dong(page, 'shp-001')).toBeAttached();
    });

    test('danh sách hiện trạng thái, hạn token và số SKU đã ghép', async ({ page }) => {
      await expect(trangThai(page, 'shp-001')).toHaveText('Đã kết nối');
      await expect(trangThai(page, 'shp-002')).toHaveText('Cần kết nối lại');
      await expect(dong(page, 'shp-002')).toContainText('3 việc đang chờ');
      // Sắp hết hạn là nhãn phụ của gian hàng đang kết nối, không phải trạng thái
      await expect(trangThai(page, 'shp-003')).toHaveText('Đã kết nối');
      const expiring = dong(page, 'shp-003').locator('[data-testid=shop-expiring]');
      await expect(expiring).toContainText('Sắp hết hạn');
      await expect(expiring).toContainText('Kết nối lại trước');
      const token = dong(page, 'shp-001').locator('[data-testid=shop-token]');
      await expect(token).toContainText('Access token đến');
      await expect(token).toContainText('refresh token đến');
      // Refresh token còn xa hạn thì không có nhãn phụ
      await expect(dong(page, 'shp-001')).toBeAttached();
      await expect(dong(page, 'shp-001').locator('[data-testid=shop-expiring]')).toHaveCount(0);
      await expect(trangThai(page, 'shp-008')).toHaveText('Đã ngắt');
      await expect(dong(page, 'shp-001')).toContainText('2');
      // Gian hàng của công ty khác không lộ ra
      await expect(page.locator('tbody')).not.toContainText('XYZ Beauty Shopee');
      // Gian hàng đã ngắt không đồng bộ được, kết nối lại được
      const ngat = dong(page, 'shp-008');
      await expect(ngat.getByRole('button', { name: 'Đồng bộ đơn', exact: true })).toHaveCount(0);
      await expect(ngat.getByRole('button', { name: 'Kết nối lại', exact: true })).toBeAttached();
      await expect(ngat.getByRole('button', { name: 'Ngắt kết nối', exact: true })).toHaveCount(0);
      await expect(dong(page, 'shp-001')).toBeAttached();
      await expect(dong(page, 'shp-001').getByRole('button', { name: 'Kết nối lại', exact: true })).toHaveCount(0);
    });

    test('banner cần kết nối lại kèm số việc đang chờ', async ({ page }) => {
      const banner = page.locator('[data-testid=reauth-banner]');
      await expect(banner).toHaveCount(1);
      await expect(banner).toContainText('ABC Fashion TikTok Shop');
      await expect(banner).toContainText('3 việc đang chờ');
      await expect(dong(page, 'shp-002')).toBeAttached();
      await expect(dong(page, 'shp-002').getByRole('button', { name: 'Đồng bộ đơn', exact: true })).toHaveCount(0);
      await banner.getByRole('button', { name: 'Kết nối lại', exact: true }).click();
      await page.getByRole('button', { name: 'Đồng ý', exact: true }).click();
      await toast(page, 'Đã kết nối lại ABC Fashion TikTok Shop: chạy 3 việc đang chờ');
      await expect(trangThai(page, 'shp-002')).toHaveText('Đã kết nối');
      await expect(banner).toHaveCount(0);
    });

    test('kết nối gian hàng mới qua sàn giả lập', async ({ page }) => {
      await page.getByRole('button', { name: 'Thêm gian hàng', exact: true }).click();
      await page
        .locator('[data-testid=connect-section]')
        .getByRole('button', { name: 'Kết nối Sàn giả lập (mock)', exact: true })
        .click();
      await expect.poll(() => duongDan(page)).toBe('/mock-oauth/authorize');
      await thayChu(page, 'Uỷ quyền ứng dụng');
      await page.getByLabel('Tên gian hàng', { exact: true }).fill('');
      await page.getByRole('button', { name: 'Đồng ý', exact: true }).click();
      await thayChu(page, 'Nhập tên gian hàng');
      await page.getByLabel('Tên gian hàng', { exact: true }).fill('ABC Thử nghiệm');
      await page.getByLabel('Mã gian hàng trên sàn', { exact: true }).fill('mock-abc-01');
      await page.getByRole('button', { name: 'Đồng ý', exact: true }).click();
      await toast(page, 'Đã kết nối ABC Thử nghiệm. Hoàn tất thiết lập');
      await expect.poll(() => duongDan(page)).toMatch(/\/channel\/shops\/[^/]+\/setup$/);

      // Bước 1: hai SKU trên sàn trùng SKU Commerio được gợi ý, mặc định chọn cả hai
      const goiY = page.locator('[data-testid=setup-suggestions]');
      await expect(goiY.locator('[data-suggestion]')).toHaveCount(2);
      await expect(goiY).toContainText('Còn 1 SKU trên sàn không trùng');
      await expect(goiY.getByRole('checkbox').first()).toHaveAttribute('aria-checked', 'true');
      await page.getByRole('button', { name: 'Tiếp', exact: true }).click();

      // Bước 2: số trên sàn khác khả dụng thì chọn kiểm kê lại
      await expect(page.locator('[data-testid=setup-drift] tbody tr').first()).toBeAttached();
      await page.getByLabel(/Kiểm kê lại trước/).click();
      await page.getByRole('button', { name: 'Tiếp', exact: true }).click();

      // Bước 3: mốc kéo đơn không được ở tương lai
      await page.getByLabel('Kéo đơn từ ngày', { exact: true }).fill('2099-01-01');
      await page.getByRole('button', { name: 'Hoàn tất thiết lập', exact: true }).click();
      await thayChu(page, 'Mốc kéo đơn không được ở tương lai');
      await page.getByLabel('Kéo đơn từ ngày', { exact: true }).fill('2026-04-01');
      await page.getByRole('button', { name: 'Hoàn tất thiết lập', exact: true }).click();
      await toast(page, /ABC Thử nghiệm đã sẵn sàng bán, ghép 2 listing, lập phiếu kiểm kê KK-/);
      await expect(page.locator('[data-testid=shop-status]')).toHaveText('Đã kết nối');
      await expect(page.locator('[data-testid=listing-status]')).toHaveCount(2);
      await coPhanTu(page, '[data-testid=listing-status]', 'Đang bán');
      await coPhanTu(page, '[data-testid=stock-sync]', 'Tồn chờ đẩy');
    });

    test('gian hàng đang thiết lập mở thẳng wizard', async ({ page }) => {
      await page.getByRole('button', { name: 'Thêm gian hàng', exact: true }).click();
      await page.locator('[data-testid=connect-section]').getByRole('button', { name: 'Kết nối Shopee', exact: true }).click();
      await page.getByLabel('Tên gian hàng', { exact: true }).fill('ABC Chưa xong');
      await page.getByRole('button', { name: 'Đồng ý', exact: true }).click();
      await expect.poll(() => duongDan(page)).toMatch(/\/setup$/);
      await expect(page.getByRole('button', { name: 'Danh sách', exact: true })).toHaveCount(0);
      await menu(page, 'Kênh bán');
      const row = chua(page, 'ABC Chưa xong', 'tbody tr');
      await expect(row.locator('[data-testid=shop-status]')).toHaveText('Đang thiết lập');
      await row.getByRole('button', { name: 'Thiết lập', exact: true }).click();
      await expect.poll(() => duongDan(page)).toMatch(/\/setup$/);
      await thayChu(page, 'Thiết lập ABC Chưa xong');
    });

    test('từ chối uỷ quyền thì không tạo gian hàng', async ({ page }) => {
      const rows = page.locator('tbody tr[data-row-id]');
      await expect(rows.first()).toBeAttached();
      const n = await rows.count();
      await page.getByRole('button', { name: 'Thêm gian hàng', exact: true }).click();
      await page.locator('[data-testid=connect-section]').getByRole('button', { name: 'Kết nối Shopee', exact: true }).click();
      await page.getByRole('button', { name: 'Từ chối', exact: true }).click();
      await toast(page, 'Bạn đã từ chối uỷ quyền');
      await expect.poll(() => duongDan(page)).toBe('/c/cmp-001/channel/shops');
      await expect(rows).toHaveCount(n);
    });

    test('kết nối lại gian hàng đã ngắt; uỷ quyền nhầm gian hàng thì báo lỗi', async ({ page }) => {
      await dong(page, 'shp-008').getByRole('button', { name: 'Kết nối lại', exact: true }).click();
      await expect(page.getByLabel('Tên gian hàng', { exact: true })).toHaveValue('ABC Outlet TikTok');
      await page.getByLabel('Mã gian hàng trên sàn', { exact: true }).fill('shop-khac');
      await page.getByRole('button', { name: 'Đồng ý', exact: true }).click();
      await toast(page, /không phải/);
      await expect(trangThai(page, 'shp-008')).toHaveText('Đã ngắt');

      await dong(page, 'shp-008').getByRole('button', { name: 'Kết nối lại', exact: true }).click();
      await page.getByRole('button', { name: 'Đồng ý', exact: true }).click();
      // Kết nối lại dùng bản ghi cũ, đưa listing đã gỡ khi ngắt lên lại và kéo đơn từ mốc cũ
      await toast(page, /Đã kết nối lại ABC Outlet TikTok: đưa lại 1 listing lên sàn, kéo đơn từ/);
      await expect(trangThai(page, 'shp-008')).toHaveText('Đã kết nối');
    });

    test('callback có state lạ thì báo phiên không hợp lệ', async ({ page }) => {
      await expect(dong(page, 'shp-001')).toBeAttached();
      await diToi(page, '/channel/lazada/callback?code=abc&state=st-gia');
      await toast(page, 'Phiên kết nối đã hết hạn hoặc không hợp lệ');
      await expect.poll(() => duongDan(page)).toBe('/c/cmp-001/channel/shops');
    });

    test('ngắt kết nối có xác nhận, hỏi đặt tồn trên sàn về 0', async ({ page }) => {
      await dong(page, 'shp-001').getByRole('button', { name: 'Ngắt kết nối', exact: true }).click();
      const alert = page.getByRole('alertdialog');
      await thayChu(alert, 'ABC Fashion Official');
      await alert.getByRole('checkbox', { name: /Đặt tồn trên sàn về 0/ }).click();
      await alert.getByRole('button', { name: 'Ngắt kết nối', exact: true }).click();
      await toast(page, 'Đã ngắt kết nối ABC Fashion Official, tồn trên sàn đã về 0');
      await expect(trangThai(page, 'shp-001')).toHaveText('Đã ngắt');
      await expect(dong(page, 'shp-001')).toContainText('0');
    });

    test('gian hàng mất quyền thì không đặt tồn về 0 được khi ngắt', async ({ page }) => {
      await dong(page, 'shp-002').getByRole('button', { name: 'Ngắt kết nối', exact: true }).click();
      const alert = page.getByRole('alertdialog');
      await expect(alert.getByRole('checkbox', { name: /Đặt tồn trên sàn về 0/ })).toBeDisabled();
      await thayChu(alert, 'sàn đã thu hồi quyền');
      await alert.getByRole('button', { name: 'Ngắt kết nối', exact: true }).click();
      await toast(page, 'Đã ngắt kết nối ABC Fashion TikTok Shop');
      await expect(trangThai(page, 'shp-002')).toHaveText('Đã ngắt');
    });
  });

  test.describe('ghép SKU và đẩy giá (UC-CH-02)', () => {
    test.beforeEach(async ({ page }) => {
      await dangNhap(page, 'ceo@commerio.vn', 'ceo');
      await menu(page, 'Kênh bán');
      await moTrangGhep(page, 'shp-001');
    });

    test('hiện giá đẩy theo nguồn và trạng thái đẩy từng biến thể', async ({ page }) => {
      await expect(page.locator('[data-testid=match-summary]')).toContainText('Đã ghép 2 /');
      for (const t of ['165.000', 'Giá gian hàng', 'Đã đẩy']) await expect(dong(page, 'prd-001-v1')).toContainText(t);
      for (const t of ['Giá đã đổi, chưa đẩy', '150.000']) await expect(dong(page, 'prd-001-v2')).toContainText(t);
      for (const t of ['Theo giá chuẩn', 'Chưa ghép']) await expect(dong(page, 'prd-001-v3')).toContainText(t);
      await expect(dong(page, 'prd-002-v3')).toContainText('Chưa có giá');
      await chon(page, 'Ghép', 'Giá chưa đẩy');
      await expect(dongBienThe(page)).toHaveCount(1);
      await expect(dong(page, 'prd-001-v2')).toBeAttached();
      await expect(page.locator('[data-testid=remote-section]')).toContainText('OLD-TEE-01');
    });

    test('ghép biến thể với SKU sàn được gợi ý theo SKU người bán', async ({ page }) => {
      await dong(page, 'prd-001-v3').getByRole('button', { name: 'Ghép', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await thayChu(dialog, 'Gợi ý');
      await expect(dialog.getByRole('radio', { checked: true })).toHaveAttribute('value', 'shp-001-sku-003');
      await dialog.getByRole('button', { name: 'Lưu ghép', exact: true }).click();
      await toast(page, 'Đã ghép');
      await expect(dialog).toHaveCount(0);
      await expect(dong(page, 'prd-001-v3').locator('[data-testid=remote-sku]')).toContainText('shp-001-sku-003');
      await expect(page.locator('[data-testid=remote-section]')).not.toContainText('shp-001-sku-003');
      await expect(page.locator('[data-testid=match-summary]')).toContainText('Đã ghép 3 /');
    });

    test('SKU sàn đã bị ghép thì báo trong hộp; xung đột phiên bản thì nạp lại', async ({ page }) => {
      await mockApi(page, 'put', '/channel/shops/shp-001/listings/prd-001-v4', 409, {
        status: 409,
        title: 'SKU sàn đã được ghép',
        code: 'sku_taken',
      });
      await dong(page, 'prd-001-v4').getByRole('button', { name: 'Ghép', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Lưu ghép', exact: true }).click();
      await thayChu(dialog, 'SKU sàn này đã ghép với biến thể khác');

      await mockApi(page, 'put', '/channel/shops/shp-001/listings/prd-001-v4', 409, {
        status: 409,
        title: 'Xung đột phiên bản',
        code: 'version_conflict',
      });
      await dialog.getByRole('button', { name: 'Lưu ghép', exact: true }).click();
      await toast(page, 'vừa được người khác sửa');
      await expect(dialog).toHaveCount(0);
      await expect(dong(page, 'prd-001-v4')).toContainText('Chưa ghép');
    });

    test('ghép từ SKU sàn chưa ghép và bỏ ghép có xác nhận', async ({ page }) => {
      await chua(page.locator('[data-testid=remote-section]'), 'OLD-TEE-01', 'tr')
        .getByRole('button', { name: 'Ghép với biến thể', exact: true })
        .click();
      const dialog = page.getByRole('dialog');
      await dialog.getByPlaceholder('Tìm biến thể theo tên hoặc SKU...', { exact: true }).fill('Thắt lưng');
      await expect(dialog.getByRole('radio')).toHaveCount(1);
      await dialog.getByRole('radio').click();
      await dialog.getByRole('button', { name: 'Lưu ghép', exact: true }).click();
      await toast(page, 'Đã ghép');
      await expect(dong(page, 'prd-003-v1').locator('[data-testid=remote-sku]')).toContainText('OLD-TEE-01');

      await dong(page, 'prd-003-v1').getByRole('button', { name: 'Bỏ ghép', exact: true }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Bỏ ghép', exact: true }).click();
      await toast(page, 'Đã bỏ ghép');
      await expect(dong(page, 'prd-003-v1')).toContainText('Chưa ghép');
      await expect(page.locator('[data-testid=remote-section]')).toContainText('OLD-TEE-01');
    });

    test('đẩy nhiều biến thể: biến thể chưa ghép được tạo mới trên sàn', async ({ page }) => {
      await dong(page, 'prd-001-v2').getByRole('checkbox').click();
      await dong(page, 'prd-002-v2').getByRole('checkbox').click();
      await page.getByRole('button', { name: 'Đẩy 2 biến thể lên sàn', exact: true }).click();
      const alert = page.getByRole('alertdialog');
      await thayChu(alert, '1 biến thể chưa có SKU sàn');
      await alert.getByRole('button', { name: 'Đẩy lên sàn', exact: true }).click();
      await toast(page, 'Đã đẩy 2 biến thể lên sàn (1 tạo mới)');
      await expect(dong(page, 'prd-001-v2')).toContainText('Đã đẩy');
      await expect(dong(page, 'prd-001-v2')).not.toContainText('Giá đã đổi');
      await expect(dong(page, 'prd-002-v2').locator('[data-testid=remote-sku]')).toBeAttached();
      await expect(dong(page, 'prd-002-v2')).toContainText('Đã đẩy');
    });

    test('biến thể chưa có giá thì báo lỗi theo dòng', async ({ page }) => {
      await dong(page, 'prd-002-v3').getByRole('button', { name: 'Đẩy sản phẩm mới', exact: true }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Đẩy lên sàn', exact: true }).click();
      await toast(page, '1 biến thể không đẩy được');
      await expect(dong(page, 'prd-002-v3').locator('[data-testid=push-error]')).toContainText('Chưa có giá');
      await expect(dong(page, 'prd-002-v3')).toContainText('Chưa ghép');
    });
  });

  test.describe('trạng thái listing (sơ đồ C2)', () => {
    test.beforeEach(async ({ page }) => {
      await dangNhap(page, 'ceo@commerio.vn', 'ceo');
      await menu(page, 'Kênh bán');
      await moTrangGhep(page, 'shp-003');
    });

    test('hiện trạng thái listing, lý do từ chối và lệch tồn sàn', async ({ page }) => {
      await expect(trangThaiListing(page, 'prd-002-v1')).toHaveText('Đang bán');
      await expect(dong(page, 'prd-002-v1')).toContainText('Chưa đẩy');
      await expect(trangThaiListing(page, 'prd-002-v2')).toHaveText('Chờ sàn duyệt');
      await expect(trangThaiListing(page, 'prd-001-v3')).toHaveText('Sàn từ chối');
      await expect(dong(page, 'prd-001-v3').locator('[data-testid=listing-note]')).toContainText('Ảnh chính có chữ và logo');
      await expect(dong(page, 'prd-001-v3').getByRole('button', { name: 'Đẩy lại', exact: true })).toBeAttached();
      await expect(dong(page, 'prd-003-v1').locator('[data-testid=stock-sync]')).toHaveText('Lệch tồn sàn (sàn 12)');
      // Lỗi đẩy theo từng SKU: câu của sàn hiện nguyên văn
      await expect(dong(page, 'prd-003-v1').locator('[data-testid=sync-error]')).toContainText(
        'Đẩy tồn lỗi: SellerSku is locked by campaign',
      );
      await expect(dong(page, 'prd-002-v1').locator('[data-testid=qc-alert]')).toContainText('Mô tả thiếu thông tin chất liệu');
      await chon(page, 'Trạng thái', 'Sàn từ chối');
      await expect(dongBienThe(page)).toHaveCount(1);
      await chon(page, 'Trạng thái', 'Chưa lên sàn');
      await moiPhanTu(dongBienThe(page), (t) => expect(t).toContain('Chưa lên sàn'));
    });

    test('đẩy lại listing bị từ chối thì chờ sàn duyệt (Lazada)', async ({ page }) => {
      await dong(page, 'prd-001-v3').getByRole('button', { name: 'Đẩy lại', exact: true }).click();
      await toast(page, 'Đã đẩy 1 biến thể lên sàn');
      await expect(trangThaiListing(page, 'prd-001-v3')).toHaveText('Chờ sàn duyệt');
      await expect(dong(page, 'prd-001-v3')).toBeAttached();
      await expect(dong(page, 'prd-001-v3').locator('[data-testid=listing-note]')).toHaveCount(0);
    });

    test('gỡ khỏi sàn có xác nhận, giữ ghép để đẩy lại', async ({ page }) => {
      await dong(page, 'prd-002-v1').getByRole('button', { name: 'Gỡ khỏi sàn', exact: true }).click();
      const alert = page.getByRole('alertdialog');
      await thayChu(alert, 'ghép SKU vẫn giữ');
      await alert.getByRole('button', { name: 'Gỡ khỏi sàn', exact: true }).click();
      await toast(page, /Đã gỡ .* khỏi sàn/);
      await expect(trangThaiListing(page, 'prd-002-v1')).toHaveText('Đã gỡ');
      await expect(dong(page, 'prd-002-v1').locator('[data-testid=remote-sku]')).toBeAttached();
      await expect(dong(page, 'prd-002-v1')).toBeAttached();
      await expect(dong(page, 'prd-002-v1').getByRole('button', { name: 'Gỡ khỏi sàn', exact: true })).toHaveCount(0);
      await dong(page, 'prd-002-v1').getByRole('button', { name: 'Đẩy lại', exact: true }).click();
      await expect(trangThaiListing(page, 'prd-002-v1')).toHaveText('Chờ sàn duyệt');
    });

    test('sàn giả lập: duyệt listing, khoá listing, thu hồi quyền', async ({ page }) => {
      await diToi(page, '/c/cmp-001/dev/marketplace');
      await chon(page, 'Gian hàng', /ABC Fashion LazMall/);
      await phat(page, 'listing.approved');
      await toast(page, 'sàn đã duyệt');
      await page.locator('[data-event="listing.hold"]').getByRole('textbox').fill('khong-co');
      await phat(page, 'listing.hold');
      await toast(page, 'Không có listing đang bán với SKU khong-co');
      await phat(page, 'shop.deauthorized');
      await toast(page, /ABC Fashion LazMall chuyển sang cần kết nối lại, \d+ việc đang chờ/);

      await diToi(page, '/c/cmp-001/channel/shops/shp-003');
      await expect(trangThaiListing(page, 'prd-002-v2')).toHaveText('Đang bán');
      await expect(page.locator('[data-testid=shop-status]')).toHaveText('Cần kết nối lại');
      await coPhanTu(page, '[data-testid=stock-sync]', 'Tồn chờ đẩy');
    });
  });

  test('gian hàng đã ngắt chỉ xem được ghép cũ', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await menu(page, 'Kênh bán');
    await moTrangGhep(page, 'shp-008');
    await thayChu(page, 'chỉ xem được ghép SKU cũ');
    await expect(page.getByRole('button', { name: 'Kết nối lại', exact: true })).toBeAttached();
    await expect(page.getByRole('button', { name: /Đẩy/ })).toHaveCount(0);
    await expect(dong(page, 'prd-001-v1')).toBeAttached();
    await expect(dong(page, 'prd-001-v1').getByRole('checkbox')).toHaveCount(0);
    await expect(page.locator('[data-testid=remote-section]')).toContainText('chưa kết nối');
  });

  test('Sale chỉ xem: không kết nối, không ghép, không đẩy', async ({ page }) => {
    await dangNhap(page, 'sale@commerio.vn', 'sale');
    await menu(page, 'Kênh bán');
    await expect(page.getByRole('button', { name: 'Thêm gian hàng', exact: true })).toHaveCount(0);
    const shop = dong(page, 'shp-001');
    await expect(shop.getByRole('button', { name: 'Ngắt kết nối', exact: true })).toHaveCount(0);
    await expect(shop.getByRole('button', { name: 'Đồng bộ đơn', exact: true })).toHaveCount(0);
    await moTrangGhep(page, 'shp-001');
    await thayChu(page, 'Bạn chỉ có quyền xem ghép SKU');
    await expect(page.getByRole('button', { name: /Đẩy/ })).toHaveCount(0);
    await expect(dong(page, 'prd-001-v3')).toBeAttached();
    await expect(dong(page, 'prd-001-v3').getByRole('button', { name: 'Ghép', exact: true })).toHaveCount(0);
    await expect(
      page.locator('[data-testid=remote-section]').getByRole('button', { name: 'Ghép với biến thể', exact: true }),
    ).toHaveCount(0);
  });

  test('không mở được gian hàng của công ty khác', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await menu(page, 'Kênh bán');
    await expect(dong(page, 'shp-001')).toBeAttached();
    await diToi(page, '/c/cmp-001/channel/shops/shp-004');
    await page.getByRole('button', { name: 'Về danh sách gian hàng', exact: true }).click();
    await expect.poll(() => duongDan(page)).toBe('/c/cmp-001/channel/shops');
  });
});
