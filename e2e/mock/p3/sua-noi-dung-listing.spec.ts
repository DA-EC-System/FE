// P3 · Sửa nội dung listing đang bán, nhãn bản sửa đang duyệt / bị từ chối (FE#275, commerio-backend#293, 21 §18.3)
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

const trangThai = (page: Page, variantId: string) => dong(page, variantId).getByTestId('listing-status');
const banSua = (page: Page, variantId: string) => dong(page, variantId).getByTestId('pending-revision');
const nutSua = (page: Page, variantId: string) =>
  dong(page, variantId).getByRole('button', { name: 'Cập nhật thông tin lên sàn', exact: true });

const suaNoiDung = async (page: Page, variantId: string) => {
  await nutSua(page, variantId).click();
  const hop = page.getByRole('alertdialog');
  await expect(hop).toContainText('sàn sẽ duyệt lại. Thường sàn vẫn bán bản cũ trong lúc duyệt; nếu sàn ngừng bán để duyệt, listing chuyển Chờ sàn duyệt. Ảnh, giá và tồn không đổi.');
  await hop.getByRole('button', { name: 'Cập nhật', exact: true }).click();
};

test.describe('P3 · Sửa nội dung listing đang bán (TikTok)', () => {
  test('nhãn bản sửa: đang duyệt, bị từ chối kèm lý do; sàn duyệt thì nhãn mất', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await moTiktok(page);

    await expect(trangThai(page, 'prd-001-v3')).toHaveText('Đang bán');
    await expect(banSua(page, 'prd-001-v3')).toHaveText('Chỉnh sửa chờ duyệt');
    await banSua(page, 'prd-001-v3').hover();
    await expect(page.getByTestId('pending-revision-hint')).toContainText('vẫn bán bản cũ');

    await expect(trangThai(page, 'prd-001-v2')).toHaveText('Đang bán');
    await expect(banSua(page, 'prd-001-v2')).toHaveText('Chỉnh sửa bị từ chối');
    await expect(dong(page, 'prd-001-v2').getByTestId('revision-reason')).toHaveText(
      'Sàn báo: Mô tả chứa thông tin liên hệ ngoài sàn',
    );

    await phatSuKienSan(page, 'listing.revision_approved', 'shp-002');
    await diToi(page, '/c/cmp-001/channel/shops');
    await diToi(page, '/c/cmp-001/channel/shops/shp-002');
    await expect(banSua(page, 'prd-001-v3')).toHaveCount(0);
  });

  test('sửa nội dung: hỏi lại, sàn vẫn bán bản cũ nên giữ Đang bán kèm Bản sửa đang duyệt', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await moTiktok(page);
    await expect(banSua(page, 'prd-001-v1')).toHaveCount(0);

    await suaNoiDung(page, 'prd-001-v1');
    await toast(page, /Sàn đang duyệt, listing vẫn bán bản cũ/);
    await expect(trangThai(page, 'prd-001-v1')).toHaveText('Đang bán');
    await expect(banSua(page, 'prd-001-v1')).toHaveText('Chỉnh sửa chờ duyệt');
    // Vẫn gửi lại được khi bản sửa đang duyệt
    await expect(nutSua(page, 'prd-001-v1')).toBeEnabled();
  });

  test('bản sửa bị từ chối: bấm Sửa nội dung lại thì về đang duyệt, lý do mất', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await moTiktok(page);

    await suaNoiDung(page, 'prd-001-v2');
    await toast(page, /Đã cập nhật thông tin mới/);
    await expect(banSua(page, 'prd-001-v2')).toHaveText('Chỉnh sửa chờ duyệt');
    await expect(dong(page, 'prd-001-v2').getByTestId('revision-reason')).toHaveCount(0);
  });

  test('sàn không nhận bản sửa: báo câu của sàn, listing giữ nguyên', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await moTiktok(page);
    await phatSuKienSan(page, 'listing.content_rejected', 'shp-002');

    await suaNoiDung(page, 'prd-001-v1');
    await toast(page, /Sàn không nhận bản sửa, listing giữ nguyên\. Sàn báo: 12019018/);
    await expect(trangThai(page, 'prd-001-v1')).toHaveText('Đang bán');
    await expect(banSua(page, 'prd-001-v1')).toHaveCount(0);
  });

  test('sàn ngừng bán để duyệt: listing chuyển Chờ sàn duyệt, không còn nút Sửa nội dung', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await moTiktok(page);
    await phatSuKienSan(page, 'listing.content_review_stop', 'shp-002');

    await suaNoiDung(page, 'prd-001-v1');
    await toast(page, /Sàn tạm ngừng bán để duyệt lại/);
    await expect(trangThai(page, 'prd-001-v1')).toHaveText('Chờ sàn duyệt');
    await expect(banSua(page, 'prd-001-v1')).toHaveCount(0);
    await expect(nutSua(page, 'prd-001-v1')).toHaveCount(0);
  });

  test('Lazada không có nút Sửa nội dung', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await diToi(page, '/c/cmp-001/channel/shops/shp-003');
    await expect(page.locator('[data-testid=match-summary]')).toBeAttached();
    await expect(trangThai(page, 'prd-002-v1')).toHaveText('Đang bán');
    await expect(nutSua(page, 'prd-002-v1')).toHaveCount(0);
  });
});
