// P3 · CEO duyệt, từ chối ghép SKU chờ (FE#262; Documents/21 §18.6.5, POST listings/:listingId/mapping/:action)
// Mock giữ dữ liệu trong bộ nhớ trang: CEO đăng nhập, gọi API ghép thay Sale/Admin ngay trong trang để tạo yêu cầu chờ,
// rồi mới mở trang ghép SKU
import { type Page } from '@playwright/test';
import { chu, chua, dangNhap, dong, duongDan, expect, menu, mockApi, test, toast } from '../../fixtures';

const SALE = 'acc-002';
const ADMIN = 'acc-005';

/** Gọi `POST listings/match` bằng token giả của người khác cùng công ty; trả mã HTTP */
const xinGhep = (page: Page, account: string, externalSkuId: string, variantId: string | null) =>
  page.evaluate(
    ({ account, externalSkuId, variantId }) =>
      fetch('/api/v1/channel/shops/shp-001/listings/match', {
        method: 'POST',
        headers: { Authorization: `Bearer mock.${account}.cmp-001.${Date.now()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ externalSkuId, variantId }),
      }).then((r) => r.status),
    { account, externalSkuId, variantId },
  );

const moTrangGhep = async (page: Page) => {
  await menu(page, 'Kênh bán');
  await dong(page, 'shp-001').getByRole('button', { name: /^Thao tác khác với / }).click();
  await page.getByRole('menuitem', { name: 'Listing & giá' }).click();
  await expect.poll(() => duongDan(page)).toMatch(/\/channel\/shops\/shp-001$/);
  await expect(page.locator('[data-testid=match-summary]')).toBeAttached();
};

const tab = (page: Page, value: 'all' | 'unmatched' | 'pending') => page.locator(`[data-testid=listing-tab-${value}]`);
const khuSkuSan = (page: Page) => page.locator('[data-testid=remote-section]');

test.describe('P3 · Duyệt ghép SKU (FE#262)', () => {
  test.beforeEach(async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    // Sale xin đặt SKU sàn cũ là "không quản tồn"; Admin đổi ghép SKU sàn đã có đơn sang Thắt lưng
    expect(await xinGhep(page, SALE, 'shp-001-sku-006', null)).toBe(202);
    expect(await xinGhep(page, ADMIN, 'shp-001-sku-001', 'prd-003-v1')).toBe(202);
    await moTrangGhep(page);
  });

  test('dòng có ghép chờ mang nhãn Chờ CEO duyệt; tab Chờ duyệt đếm đúng', async ({ page }) => {
    const v1 = dong(page, 'prd-001-v1');
    await expect(v1.getByTestId('pending-mapping')).toHaveText('Chờ CEO duyệt');
    await v1.getByTestId('pending-mapping').focus();
    await expect(page.getByTestId('pending-mapping-hint').first()).toContainText('Vũ Quản Trị xin ghép với');
    await expect(page.getByTestId('pending-mapping-hint').first()).not.toContainText('biến thể khác');
    await expect(tab(page, 'pending')).toContainText('2');

    await tab(page, 'pending').click();
    const oldTee = chua(khuSkuSan(page), 'OLD-TEE-01', 'tr');
    await oldTee.getByTestId('pending-mapping').focus();
    await expect(page.getByTestId('pending-mapping-hint').last()).toContainText('Trần Thị Bán Hàng xin ghép với Không quản tồn');
    await expect(oldTee.getByTestId('remote-current')).toHaveText('Chưa ghép');
  });

  test('CEO duyệt "không quản tồn" ở tab Chưa ghép: SKU sàn rời tab, hết chờ duyệt', async ({ page }) => {
    await tab(page, 'unmatched').click();
    const oldTee = chua(khuSkuSan(page), 'OLD-TEE-01', 'tr');
    await expect(oldTee.getByRole('button', { name: 'Ghép với biến thể', exact: true })).toBeDisabled();
    await oldTee.getByRole('button', { name: 'Duyệt ghép', exact: true }).click();
    const hop = page.getByRole('alertdialog');
    await expect(hop).toContainText('Không quản tồn');
    await hop.getByRole('button', { name: 'Duyệt ghép', exact: true }).click();
    await toast(page, 'Đã duyệt ghép SKU sàn OLD-TEE-01');
    await expect(khuSkuSan(page).locator('tr', { hasText: chu('OLD-TEE-01') })).toHaveCount(0);
    await expect(tab(page, 'pending')).toContainText('1');
  });

  test('CEO duyệt đổi ghép ở dòng biến thể: SKU sàn chuyển sang Thắt lưng', async ({ page }) => {
    await dong(page, 'prd-001-v1').getByRole('button', { name: 'Duyệt ghép', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Duyệt ghép', exact: true }).click();
    await toast(page, /^Đã duyệt ghép SKU sàn/);
    await expect(dong(page, 'prd-003-v1').locator('[data-testid=remote-sku]')).toContainText('shp-001-sku-001');
    await expect(dong(page, 'prd-001-v1').getByTestId('pending-mapping')).toHaveCount(0);
  });

  test('từ chối phải ghi lý do; từ chối xong ghép cũ giữ nguyên', async ({ page }) => {
    const v1 = dong(page, 'prd-001-v1');
    await v1.getByRole('button', { name: 'Từ chối ghép', exact: true }).click();
    const hop = page.getByRole('dialog');
    await hop.getByRole('button', { name: 'Từ chối ghép', exact: true }).click();
    await expect(hop).toContainText('Nhập lý do');
    await hop.getByRole('textbox').fill('SKU này vẫn bán áo thun');
    await hop.getByRole('button', { name: 'Từ chối ghép', exact: true }).click();
    await toast(page, /Ghép cũ giữ nguyên/);
    await expect(v1.getByTestId('pending-mapping')).toHaveCount(0);
    await expect(v1.locator('[data-testid=remote-sku]')).toContainText('shp-001-sku-001');
    await expect(tab(page, 'pending')).toContainText('1');
  });

  test('BE báo lỗi lý do (422 errors.reason): hiện trong hộp, hộp còn mở', async ({ page }) => {
    await mockApi(page, 'post', '/channel/shops/shp-001/listings/:listingId/mapping/reject', 422, {
      code: 'validation_failed',
      title: 'Dữ liệu không hợp lệ',
      errors: { reason: 'Lý do quá ngắn' },
    });
    await dong(page, 'prd-001-v1').getByRole('button', { name: 'Từ chối ghép', exact: true }).click();
    const hop = page.getByRole('dialog');
    await hop.getByRole('textbox').fill('x');
    await hop.getByRole('button', { name: 'Từ chối ghép', exact: true }).click();
    await expect(hop).toContainText('Lý do quá ngắn');
    await expect(hop).toBeVisible();
  });

  test('yêu cầu đã được xử lý (409 invalid_transition): báo và nạp lại', async ({ page }) => {
    await mockApi(page, 'post', '/channel/shops/shp-001/listings/:listingId/mapping/approve', 409, {
      code: 'invalid_transition',
      title: 'Listing không còn ghép chờ duyệt',
    });
    await dong(page, 'prd-001-v1').getByRole('button', { name: 'Duyệt ghép', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Duyệt ghép', exact: true }).click();
    await toast(page, /đã được xử lý hoặc không còn/);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });

  test('ghép vừa bị sửa (409 version_conflict): cảnh báo, không đổi gì', async ({ page }) => {
    await mockApi(page, 'post', '/channel/shops/shp-001/listings/:listingId/mapping/approve', 409, {
      code: 'version_conflict',
      title: 'Dữ liệu vừa được người khác sửa',
      current: null,
    });
    await dong(page, 'prd-001-v1').getByRole('button', { name: 'Duyệt ghép', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Duyệt ghép', exact: true }).click();
    await toast(page, /vừa được người khác sửa/);
    await expect(dong(page, 'prd-001-v1').getByTestId('pending-mapping')).toBeVisible();
  });
});

test('Admin không có nút Duyệt, Từ chối ghép', async ({ page }) => {
  await dangNhap(page, 'admin@commerio.vn', 'admin');
  expect(await xinGhep(page, SALE, 'shp-001-sku-006', null)).toBe(202);
  await moTrangGhep(page);
  await expect(tab(page, 'pending')).toContainText('1');
  await tab(page, 'pending').click();
  await expect(chua(khuSkuSan(page), 'OLD-TEE-01', 'tr').getByTestId('pending-mapping')).toBeVisible();
  await expect(page.getByRole('button', { name: /^(Duyệt ghép|Từ chối ghép)$/ })).toHaveCount(0);
});
