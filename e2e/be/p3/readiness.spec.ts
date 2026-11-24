// P3 với BE thật · Readiness thống nhất (FE#458, commerio-backend#564)
// Chạy: PW_BASE_URL=<địa chỉ FE trỏ BE thật> pnpm e2e:be
//
// Spec chỉ đọc, không lưu, không đăng. Tự bỏ qua trừ khi đặt đủ:
//   E2E_SAN_EMAIL, E2E_SAN_PASSWORD  tài khoản xem được sản phẩm và gian hàng ở công ty thử
//   E2E_SAN_THIEU_PRODUCT_ID         sản phẩm còn thiếu thông tin sàn ở một gian hàng sàn giả lập (platform "mock")
//   E2E_SAN_CONG_TY                  (tuỳ chọn) tên công ty, mặc định "Commerio Test Sàn"
import { type Page } from '@playwright/test';
import { chu, duongDan, expect, test } from '../../fixtures';

const EMAIL = process.env.E2E_SAN_EMAIL ?? '';
const MAT_KHAU = process.env.E2E_SAN_PASSWORD ?? '';
const PRODUCT_ID = process.env.E2E_SAN_THIEU_PRODUCT_ID ?? '';
const CONG_TY = process.env.E2E_SAN_CONG_TY ?? 'Commerio Test Sàn';

const UUID = '[0-9a-f-]{36}';

interface Readiness {
  items: { shopId: string; shopName: string; platform: string; status: 'ready' | 'blocked'; blockers: unknown[] }[];
}

async function dangNhap(page: Page): Promise<string> {
  await page.goto('/login');
  await page.locator('input[name=email]').fill(EMAIL);
  await page.locator('input[name=password]').fill(MAT_KHAU);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect.poll(() => duongDan(page)).toMatch(/^\/(c\/|select-company)/);
  const nut = page.locator('button:not([data-sidebar])', { hasText: chu(CONG_TY) }).first();
  await expect(async () => {
    if (duongDan(page) === '/select-company') await nut.click({ timeout: 1000 });
    expect(duongDan(page)).toMatch(new RegExp(`^/c/${UUID}`));
  }).toPass();
  return duongDan(page).split('/')[2];
}

const docReadiness = (page: Page) =>
  page.waitForResponse(
    (r) => r.request().method() === 'GET' && new URL(r.url()).pathname.endsWith(`/channel/products/${PRODUCT_ID}/readiness`),
  );

test.describe('P3-BE · Readiness thống nhất (FE#458)', () => {
  test.skip(!EMAIL || !MAT_KHAU || !PRODUCT_ID, 'Thiếu E2E_SAN_EMAIL, E2E_SAN_PASSWORD hoặc E2E_SAN_THIEU_PRODUCT_ID');

  test('sản phẩm thiếu thông tin sàn: rail, nhãn tab sàn, bước 1 trình đăng báo cùng số mục', async ({ page }) => {
    const companyId = await dangNhap(page);
    const res = docReadiness(page);
    await page.goto(`/c/${companyId}/catalog/products/${PRODUCT_ID}`);
    const { items } = (await (await res).json()) as Readiness;
    const shop = items.find((s) => s.platform === 'mock' && s.status === 'blocked');
    test.skip(!shop, 'Sản phẩm không có gian hàng sàn giả lập còn thiếu mục');
    const n = shop!.blockers.length;
    const onlyShopOfPlatform = items.filter((s) => s.platform === shop!.platform).length === 1;

    // Rail: không ghi "Sẵn sàng" khi không gian hàng nào đăng được; dòng gian hàng ghi đúng số mục
    if (!items.some((s) => s.status === 'ready')) await expect(page.getByText('Chưa đăng được gian hàng nào')).toBeVisible();
    await expect(page.getByTestId('rail-shops')).toContainText(`${shop!.shopName}`);
    await expect(page.getByTestId('rail-shops')).toContainText(`còn ${n} mục`);

    // Nhãn tab sàn và danh sách đầu tab: cùng số (sàn một gian hàng thì đúng số trên rail)
    const tab = page.getByRole('tab').filter({ hasText: /Thiếu \d+/ });
    if (onlyShopOfPlatform) {
      await expect(tab.filter({ hasText: `Thiếu ${n}` })).toHaveCount(1);
      await tab.filter({ hasText: `Thiếu ${n}` }).click();
      await expect(page.getByTestId('readiness-note')).toContainText(`Còn ${n} mục trước khi đăng lên ${shop!.shopName}`);
      await expect(page.getByTestId('readiness-item')).toHaveCount(n);
    }

    // Bước 1 trình đăng: dòng gian hàng ghi cùng số mục
    const res2 = docReadiness(page);
    await page.goto(`/c/${companyId}/catalog/products/${PRODUCT_ID}/publish`);
    await res2;
    await expect(page.locator('label', { hasText: shop!.shopName }).getByTestId('pick-readiness')).toHaveText(`Còn ${n} mục`);
  });
});
