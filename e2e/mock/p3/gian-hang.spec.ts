// P3 · Gian hàng: kết nối OAuth, ghép SKU, đẩy sản phẩm và giá (UC-CH-01, UC-CH-02; FE#8)
// Vòng đời gian hàng và listing theo sơ đồ C1, C2 (FE#58)
import { type Page } from '@playwright/test';
import { chon, chu, chua, dangNhap, dong, duongDan, expect, menu, mockApi, moiPhanTu, test, thayChu, toast } from '../../fixtures';

/** Mở menu "..." của dòng gian hàng rồi chọn một mục */
const chonMenu = async (page: Page, shopId: string, item: string | RegExp) => {
  await dong(page, shopId).getByRole('button', { name: /^Thao tác khác với / }).click();
  await page.getByRole('menuitem', { name: item }).click();
};

/** Mở hộp ngắt kết nối từ menu của dòng */
const moNgat = async (page: Page, shopId: string) => {
  await chonMenu(page, shopId, 'Ngắt kết nối');
  return page.getByRole('dialog');
};

/** Gõ NGAT rồi bấm Ngắt kết nối */
const xacNhanNgat = async (dialog: ReturnType<Page['getByRole']>) => {
  const nut = dialog.getByRole('button', { name: 'Ngắt kết nối', exact: true });
  await expect(nut).toBeDisabled();
  await dialog.getByLabel(/để xác nhận/).fill('NGAT');
  await nut.click();
};

/** Thêm gian hàng: chọn thẻ sàn, giữ cách uỷ quyền mặc định rồi tiếp tục tới sàn */
const themQua = async (page: Page, platformName: string) => {
  await page.getByRole('button', { name: 'Thêm gian hàng', exact: true }).click();
  const section = page.locator('[data-testid=connect-section]');
  await section.getByRole('button', { name: platformName, exact: true }).click();
  await section.getByRole('button', { name: `Tiếp tục tới ${platformName}`, exact: true }).click();
};

const moTrangGhep = async (page: Page, shopId: string) => {
  await chonMenu(page, shopId, 'Listing và giá');
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
      // Dòng chữ dưới chip: mất quyền từ lúc nào, đã ngắt vẫn giữ lịch sử
      await expect(dong(page, 'shp-002').locator('[data-testid=shop-status-line]')).toContainText(/^Từ \d{2}\/\d{2}\/\d{4}/);
      await expect(dong(page, 'shp-008').locator('[data-testid=shop-status-line]')).toContainText('vẫn giữ lịch sử');
      // Chưa có bản cấu hình phí (BE#230) thì "—", gian hàng đã ngắt thì không áp
      await expect(dong(page, 'shp-008')).toContainText('Không áp');
      await expect(dong(page, 'shp-001')).not.toContainText('Không áp');
      // Refresh token còn xa hạn thì không có nhãn phụ
      await expect(dong(page, 'shp-001')).toBeAttached();
      await expect(dong(page, 'shp-001').locator('[data-testid=shop-expiring]')).toHaveCount(0);
      await expect(trangThai(page, 'shp-008')).toHaveText('Đã ngắt');
      await expect(dong(page, 'shp-001')).toContainText('2');
      // Gian hàng của công ty khác không lộ ra
      await expect(page.locator('tbody')).not.toContainText('XYZ Beauty Shopee');
      // Gian hàng đã ngắt: nút chính là Kết nối lại, menu khoá Kéo đơn ngay kèm lý do, không có Ngắt
      const ngat = dong(page, 'shp-008');
      await expect(ngat.getByRole('button', { name: 'Kết nối lại', exact: true })).toBeAttached();
      await ngat.getByRole('button', { name: 'Thao tác khác với ABC Outlet TikTok', exact: true }).click();
      await expect(page.getByRole('menuitem', { name: /^Kéo đơn ngay/ })).toContainText('Đã ngắt');
      await expect(page.getByRole('menuitem', { name: /^Kéo đơn ngay/ })).toHaveAttribute('aria-disabled', 'true');
      await expect(page.getByRole('menuitem', { name: 'Ngắt kết nối', exact: true })).toHaveCount(0);
      await expect(page.getByRole('menuitem', { name: 'Kết nối lại', exact: true })).toBeAttached();
      await page.keyboard.press('Escape');
      // Gian hàng đang chạy: nút chính là Listing, không có Kết nối lại
      await expect(dong(page, 'shp-001').getByRole('button', { name: 'Listing', exact: true })).toBeAttached();
      await expect(dong(page, 'shp-001').getByRole('button', { name: 'Kết nối lại', exact: true })).toHaveCount(0);

      // Cần xử lý: mất quyền (shp-002) và uỷ quyền sắp hết hạn (shp-003)
      await page.getByRole('tab', { name: 'Cần xử lý 2', exact: true }).click();
      await expect(page.locator('tbody tr[data-row-id]')).toHaveCount(2);
      await expect(dong(page, 'shp-002')).toBeAttached();
      await expect(dong(page, 'shp-003')).toBeAttached();
      await page.getByRole('tab', { name: 'Đã ngắt', exact: true }).click();
      await expect(page.locator('tbody tr[data-row-id]')).toHaveCount(1);
      await expect(dong(page, 'shp-008')).toBeAttached();
    });

    test('banner cần kết nối lại kèm số việc đang chờ', async ({ page }) => {
      const banner = page.locator('[data-testid=reauth-banner]');
      await expect(banner).toHaveCount(1);
      await expect(banner).toContainText('ABC Fashion TikTok Shop');
      await expect(banner).toContainText('3 việc đang chờ');
      await expect(dong(page, 'shp-002')).toBeAttached();
      await banner.getByRole('button', { name: 'Kết nối lại', exact: true }).click();
      await page.getByRole('button', { name: 'Đồng ý', exact: true }).click();
      const ketQua = page.locator('[data-outcome=reconnected]');
      await expect(ketQua).toContainText('Đã kết nối lại ABC Fashion TikTok Shop');
      await expect(ketQua).toContainText('chạy 3 việc đang chờ');
      await expect(ketQua).toContainText('Cần kết nối lại');
      await ketQua.getByRole('button', { name: 'Để sau', exact: true }).click();
      await expect(trangThai(page, 'shp-002')).toHaveText('Đã kết nối');
      await expect(banner).toHaveCount(0);
    });

    test('kết nối gian hàng mới qua sàn giả lập', async ({ page }) => {
      await themQua(page, 'Sàn giả lập (mock)');
      await expect.poll(() => duongDan(page)).toBe('/mock-oauth/authorize');
      await thayChu(page, 'Uỷ quyền ứng dụng');
      await page.getByLabel('Tên gian hàng', { exact: true }).fill('');
      await page.getByRole('button', { name: 'Đồng ý', exact: true }).click();
      await thayChu(page, 'Nhập tên gian hàng');
      await page.getByLabel('Tên gian hàng', { exact: true }).fill('ABC Thử nghiệm');
      await page.getByLabel('Mã gian hàng trên sàn', { exact: true }).fill('mock-abc-01');
      await page.getByRole('button', { name: 'Đồng ý', exact: true }).click();
      const ketQua = page.locator('[data-outcome=connected]');
      await expect(ketQua).toContainText('Đã nối ABC Thử nghiệm');
      await expect(ketQua).toContainText('mock-abc-01');
      await expect(ketQua).toContainText('Listing tìm thấy');
      await ketQua.getByRole('button', { name: 'Thiết lập ngay', exact: true }).click();
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

      // Bước 3: mốc kéo đơn do BE đề xuất, chỉ hiển thị; sàn giả lập tính hạn trả theo số ngày nên phải nhập 1–60
      await expect(page.locator('[data-testid=proposed-cutoff]')).toContainText(/\d{2}\/\d{2}\/\d{4}/);
      await expect(page.getByLabel('Kéo đơn từ ngày', { exact: true })).toHaveCount(0);
      const soNgay = page.getByRole('spinbutton', { name: /Số ngày đổi trả/ });
      await page.getByRole('button', { name: 'Hoàn tất thiết lập', exact: true }).click();
      await thayChu(page, 'Nhập số ngày đổi trả');
      await soNgay.fill('61');
      await page.getByRole('button', { name: 'Hoàn tất thiết lập', exact: true }).click();
      await thayChu(page, 'Số ngày đổi trả là số nguyên từ 1 đến 60');
      await soNgay.fill('7');
      await page.getByRole('button', { name: 'Hoàn tất thiết lập', exact: true }).click();
      await toast(page, /ABC Thử nghiệm đã sẵn sàng bán, ghép 2 listing, lập phiếu kiểm kê KK-/);
      await expect(page.locator('[data-testid=shop-status]')).toHaveText('Đã kết nối');
      await expect(page.locator('[data-testid=listing-status]')).toHaveCount(2);
      await coPhanTu(page, '[data-testid=listing-status]', 'Đang bán');
      await coPhanTu(page, '[data-testid=stock-sync]', 'Tồn chờ đẩy');
      // Phiếu kiểm kê đầu kỳ chưa ghi sổ: banner dẫn tới phiếu
      const banner = page.locator('[data-testid=opening-stocktake-banner]');
      await expect(banner).toContainText('Gian hàng đang chờ kiểm kê đầu kỳ');
      await expect(banner.getByRole('link', { name: /^KK-/ })).toHaveAttribute('href', /\/c\/cmp-001\/inventory\/documents\//);
    });

    test('gian hàng đầu tiên của công ty chỉ được kiểm kê đầu kỳ; lỗi 422 gắn đúng bước', async ({ page }) => {
      await mockApi(page, 'get', '/channel/shops/:id/setup', 200, {
        suggestions: [],
        unmatchedRemote: 0,
        proposedCutoffAt: '2026-11-01T08:00:00Z',
        firstShopOfCompany: true,
      });
      await themQua(page, 'Shopee');
      await page.getByLabel('Tên gian hàng', { exact: true }).fill('ABC Đầu tiên');
      await page.getByRole('button', { name: 'Đồng ý', exact: true }).click();
      await page.getByRole('button', { name: 'Thiết lập ngay', exact: true }).click();
      await expect.poll(() => duongDan(page)).toMatch(/\/setup$/);
      await page.getByRole('button', { name: 'Tiếp', exact: true }).click();
      await thayChu(page, 'Đây là gian hàng đầu tiên của công ty nên phải kiểm kê đầu kỳ');
      await expect(page.getByRole('radio', { name: /Lấy số Commerio đẩy lên sàn/ })).toBeDisabled();
      await expect(page.getByRole('radio', { name: /Kiểm kê lại trước/ })).toBeChecked();
      await page.getByRole('button', { name: 'Tiếp', exact: true }).click();
      await expect(page.locator('[data-testid=proposed-cutoff]')).toContainText('01/11/2026');
      // Shopee tính hạn trả theo trạng thái sàn: không hỏi số ngày
      await expect(page.getByRole('spinbutton', { name: /Số ngày đổi trả/ })).toHaveCount(0);
      await mockApi(page, 'post', '/channel/shops/:id/setup', 422, {
        status: 422,
        errors: { openingStock: 'Gian hàng đầu tiên của công ty phải kiểm kê đầu kỳ' },
      });
      await page.getByRole('button', { name: 'Hoàn tất thiết lập', exact: true }).click();
      await thayChu(page, 'Gian hàng đầu tiên của công ty phải kiểm kê đầu kỳ');
      await expect(page.getByRole('radio', { name: /Kiểm kê lại trước/ })).toBeVisible();
    });

    test('gian hàng đang thiết lập mở thẳng wizard', async ({ page }) => {
      await themQua(page, 'Shopee');
      await page.getByLabel('Tên gian hàng', { exact: true }).fill('ABC Chưa xong');
      await page.getByRole('button', { name: 'Đồng ý', exact: true }).click();
      await page.getByRole('button', { name: 'Thiết lập ngay', exact: true }).click();
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
      await themQua(page, 'Shopee');
      await page.getByRole('button', { name: 'Từ chối', exact: true }).click();
      const ketQua = page.locator('[data-outcome=declined]');
      await expect(ketQua).toContainText('Bạn đã bấm Từ chối trên Shopee');
      await expect(ketQua).toContainText('Bạn đã từ chối uỷ quyền, chưa kết nối gian hàng nào.');
      await expect(ketQua.getByRole('button', { name: 'Thử lại', exact: true })).toBeVisible();
      await ketQua.getByRole('button', { name: 'Về danh sách gian hàng', exact: true }).click();
      await expect.poll(() => duongDan(page)).toBe('/c/cmp-001/channel/shops');
      await expect(rows).toHaveCount(n);
    });

    test('kết nối lại gian hàng đã ngắt; uỷ quyền nhầm gian hàng thì báo lỗi', async ({ page }) => {
      await dong(page, 'shp-008').getByRole('button', { name: 'Kết nối lại', exact: true }).click();
      await expect(page.getByLabel('Tên gian hàng', { exact: true })).toHaveValue('ABC Outlet TikTok');
      await page.getByLabel('Mã gian hàng trên sàn', { exact: true }).fill('shop-khac');
      await page.getByRole('button', { name: 'Đồng ý', exact: true }).click();
      const ketQua = page.locator('[data-outcome=mismatch]');
      await expect(ketQua).toContainText(/Bạn vừa đăng nhập .+, không phải ABC Outlet TikTok/);
      await expect(ketQua.locator('[data-testid=mismatch-compare]')).toContainText('shop-khac');

      // Nút thử lại mở lại đúng gian hàng đang kết nối lại
      await ketQua.getByRole('button', { name: 'Kết nối lại ABC Outlet TikTok', exact: true }).click();
      await expect(page.getByLabel('Tên gian hàng', { exact: true })).toHaveValue('ABC Outlet TikTok');
      await page.getByRole('button', { name: 'Đồng ý', exact: true }).click();
      // Kết nối lại dùng bản ghi cũ, đưa listing đã gỡ khi ngắt lên lại và kéo đơn từ mốc cũ
      const noiLai = page.locator('[data-outcome=reconnected]');
      await expect(noiLai).toContainText(/đưa lại 1 listing lên sàn, kéo đơn từ/);
      await expect(noiLai).toContainText('Đã ngắt');
      await noiLai.getByRole('button', { name: 'Để sau', exact: true }).click();
      await expect(trangThai(page, 'shp-008')).toHaveText('Đã kết nối');
    });

    test('callback có state lạ thì báo phiên không hợp lệ', async ({ page }) => {
      await expect(dong(page, 'shp-001')).toBeAttached();
      await diToi(page, '/channel/lazada/callback?code=abc&state=st-gia');
      const ketQua = page.locator('[data-outcome=state_invalid]');
      await expect(ketQua).toContainText('Phiên kết nối đã hết hạn hoặc không hợp lệ');
      await expect(ketQua.getByRole('button', { name: 'Bắt đầu lại', exact: true })).toBeVisible();
      await ketQua.getByRole('button', { name: 'Về danh sách gian hàng', exact: true }).click();
      await expect.poll(() => duongDan(page)).toBe('/c/cmp-001/channel/shops');
    });

    test('callback không có state thì không gọi BE, nhắc bấm kết nối trong Commerio', async ({ page }) => {
      await expect(dong(page, 'shp-001')).toBeAttached();
      await mockApi(page, 'post', '/channel/shops/tiktok/callback', 500, { detail: 'Không được gọi callback' });
      await diToi(page, '/channel/tiktok/callback?code=abc&shop_region=VN');
      const ketQua = page.locator('[data-outcome=no_state]');
      await expect(ketQua).toContainText('Hãy bấm Kết nối TikTok Shop trong Commerio, không uỷ quyền từ Partner Center.');
      await expect(ketQua).not.toContainText('Không được gọi callback');
    });

    // shp-003 không có đơn nên ngắt được; shp-001, shp-002 còn đơn chưa xong (§18.6.1)
    test('ngắt kết nối có xác nhận, hỏi đặt tồn trên sàn về 0', async ({ page }) => {
      const dialog = await moNgat(page, 'shp-003');
      await thayChu(dialog, 'ABC Fashion LazMall');
      // Mặc định đặt tồn về 0
      await expect(dialog.getByRole('checkbox', { name: /Đặt tồn trên sàn về 0/ })).toBeChecked();
      await dialog.getByLabel(/để xác nhận/).fill('ngat sai');
      await expect(dialog.getByRole('button', { name: 'Ngắt kết nối', exact: true })).toBeDisabled();
      await dialog.getByLabel(/để xác nhận/).fill('');
      await xacNhanNgat(dialog);
      await toast(page, 'Đã ngắt kết nối ABC Fashion LazMall, tồn trên sàn đã về 0');
      await expect(trangThai(page, 'shp-003')).toHaveText('Đã ngắt');
    });

    test('gian hàng mất quyền thì không đặt tồn về 0 được khi ngắt', async ({ page }) => {
      const dialog = await moNgat(page, 'shp-002');
      await expect(dialog.getByRole('checkbox', { name: /Đặt tồn trên sàn về 0/ })).toBeDisabled();
      await expect(dialog.getByRole('checkbox', { name: /Đặt tồn trên sàn về 0/ })).not.toBeChecked();
      await thayChu(dialog, 'sàn đã thu hồi quyền');
      await xacNhanNgat(dialog);
      await thayChu(page.locator('[data-testid=disconnect-blocked]'), 'Chưa ngắt được: còn 2 đơn chưa xong');
      await expect(trangThai(page, 'shp-002')).toHaveText('Cần kết nối lại');
    });

    test('còn đơn chưa xong thì không ngắt, báo số đơn và link danh sách đơn của gian hàng', async ({ page }) => {
      await xacNhanNgat(await moNgat(page, 'shp-001'));
      const blocked = page.locator('[data-testid=disconnect-blocked]');
      await expect(blocked).toContainText('Chưa ngắt được: còn 2 đơn chưa xong');
      await expect(blocked).toContainText('Còn 2 đơn chưa xong. Đợi các đơn hoàn tất hoặc huỷ rồi ngắt.');
      // Bảng đơn chưa xong BE trả kèm 409
      await expect(blocked.locator('tbody tr[data-order-id]')).toHaveCount(2);
      const link = blocked.getByRole('link', { name: 'Mở đơn bán', exact: true });
      await expect(link).toHaveAttribute('href', '/c/cmp-001/sales/orders?shopId=shp-001');
      await blocked.getByRole('button', { name: 'Đóng', exact: true }).first().click();
      await expect(trangThai(page, 'shp-001')).toHaveText('Đã kết nối');

      // Mở link: trang Đơn bán lọc theo gian hàng, bộ lọc hiện gian hàng đang chọn và xoá được
      await xacNhanNgat(await moNgat(page, 'shp-001'));
      await link.click();
      await expect.poll(() => new URL(page.url()).search).toBe('?shopId=shp-001');
      await expect(page.getByRole('combobox', { name: 'Gian hàng', exact: true })).toHaveText('ABC Fashion Official');
      await expect(page.locator('tbody tr[data-row-id]')).toHaveCount(2);
      await chon(page, 'Gian hàng', 'Tất cả');
      await expect.poll(() => new URL(page.url()).search).toBe('');
      await expect(page.locator('tbody tr[data-row-id]')).not.toHaveCount(2);
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
    await shop.getByRole('button', { name: /^Thao tác khác với / }).click();
    await expect(page.getByRole('menuitem', { name: 'Listing và giá', exact: true })).toBeAttached();
    await expect(page.getByRole('menuitem', { name: 'Ngắt kết nối', exact: true })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: /^Kéo đơn ngay/ })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: /^Thiết lập lại/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
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
