// P3 · Đẩy lên TikTok: báo gian hàng chưa đủ điều kiện, sản phẩm sai luật đăng (FE#266, commerio-backend#305, 21 §18.6.4)
import { type Page } from '@playwright/test';
import { dangNhap, dong, expect, phatSuKienSan, test, toast } from '../../fixtures';

/** Chuyển trang trong app, giữ dữ liệu giả trong bộ nhớ */
const diToi = (page: Page, path: string) =>
  page.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);

/** Gian hàng TikTok của mock đang cần kết nối lại: nối lại rồi mở trang listing */
const moTiktok = async (page: Page) => {
  await diToi(page, '/c/cmp-001/channel/shops');
  await page.getByTestId('reauth-banner').getByRole('button', { name: 'Kết nối lại', exact: true }).click();
  await page.getByRole('button', { name: 'Đồng ý', exact: true }).click();
  await page.locator('[data-outcome=reconnected]').getByRole('button', { name: 'Để sau', exact: true }).click();
  await diToi(page, '/c/cmp-001/channel/shops/shp-002');
  await expect(page.locator('[data-testid=match-summary]')).toBeAttached();
};

const dayMoi = async (page: Page, variantId: string) => {
  await dong(page, variantId).getByRole('button', { name: 'Đẩy sản phẩm mới', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Đẩy lên sàn', exact: true }).click();
  await toast(page, /Đã xếp 1 biến thể/);
};

const trangThai = (page: Page, variantId: string) => dong(page, variantId).getByTestId('listing-status');
const ghiChu = (page: Page, variantId: string) => dong(page, variantId).getByTestId('listing-note');
const chiTietSan = async (page: Page, variantId: string, text: string) => {
  const chiTiet = dong(page, variantId).getByTestId('platform-detail');
  await chiTiet.getByRole('button', { name: 'Chi tiết từ sàn' }).click();
  await expect(chiTiet).toContainText(text);
};

test.describe('P3 · TikTok kiểm điều kiện đăng trước khi tạo sản phẩm', () => {
  test('gian hàng chưa đủ điều kiện: Lỗi đẩy, câu tiếng Việt kèm câu của sàn, không có lối sửa sản phẩm', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await moTiktok(page);
    await phatSuKienSan(page, 'shop.not_eligible', 'shp-002');
    await dayMoi(page, 'prd-002-v1');

    await expect(trangThai(page, 'prd-002-v1')).toHaveText('Đăng lỗi', { timeout: 15_000 });
    await expect(ghiChu(page, 'prd-002-v1')).toContainText('Gian hàng chưa đủ điều kiện đăng sản phẩm');
    await expect(ghiChu(page, 'prd-002-v1')).toContainText('Seller Center');
    // FE#250: câu gốc của sàn trong "Chi tiết từ sàn" thu gọn
    await chiTietSan(page, 'prd-002-v1', 'Shop has not completed onboarding');
    await expect(dong(page, 'prd-002-v1').getByRole('button', { name: 'Sửa sản phẩm', exact: true })).toHaveCount(0);
  });

  test('sản phẩm sai luật đăng: câu kèm mã sàn, có lối sửa sản phẩm; sàn đạt thì đẩy lại được', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await moTiktok(page);
    await phatSuKienSan(page, 'listing.check_failed', 'shp-002');
    await dayMoi(page, 'prd-002-v1');

    await expect(trangThai(page, 'prd-002-v1')).toHaveText('Đăng lỗi', { timeout: 15_000 });
    // FE#250: câu sàn về độ dài tên được dịch, câu gốc trong "Chi tiết từ sàn"
    await expect(ghiChu(page, 'prd-002-v1')).toContainText('Tên sản phẩm phải dài 25–255 ký tự trên TikTok');
    await chiTietSan(page, 'prd-002-v1', '12052051');
    await expect(dong(page, 'prd-002-v1').getByRole('button', { name: 'Sửa sản phẩm', exact: true })).toBeAttached();

    await phatSuKienSan(page, 'listing.check_failed', 'shp-002');
    // Listing đã có (Lỗi đẩy) nên Đẩy lại không hỏi; sàn vẫn kiểm vì sản phẩm chưa tạo trên sàn
    await dong(page, 'prd-002-v1').getByRole('button', { name: 'Đẩy lại', exact: true }).click();
    await toast(page, /Đã xếp 1 biến thể/);
    await expect(trangThai(page, 'prd-002-v1')).toHaveText('Chờ sàn duyệt', { timeout: 15_000 });
    await expect(ghiChu(page, 'prd-002-v1')).toHaveCount(0);
  });
});
