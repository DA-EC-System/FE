// P3 với BE thật · Đẩy listing chạy nền (FE#164; Documents/21 §18.5, §18.6.4, commerio-backend#219)
// Chạy: PW_BASE_URL=<địa chỉ FE trỏ BE thật> pnpm e2e:be
//
// Spec tạo sản phẩm thật trên sàn nên chỉ chạy với gian hàng sàn giả lập (platform "mock"). Tự bỏ qua trừ khi đặt đủ:
//   E2E_SAN_EMAIL, E2E_SAN_PASSWORD  tài khoản có quyền đẩy listing ở công ty thử
//   E2E_SAN_PUSH_SHOP_ID             gian hàng sàn giả lập, đang hoạt động, còn biến thể chưa lên sàn
//   E2E_SAN_BE219=1                  xác nhận BE đang chạy đã có commerio-backend#219 (đẩy chạy nền)
//   E2E_SAN_CONG_TY                  (tuỳ chọn) tên công ty, mặc định "Commerio Test Sàn"
// Staging không có sàn giả lập: spec tự bỏ qua khi gian hàng không phải "mock", không đẩy lên sàn thật.
import { type Page } from '@playwright/test';
import { chu, duongDan, expect, test } from '../../fixtures';

const EMAIL = process.env.E2E_SAN_EMAIL ?? '';
const MAT_KHAU = process.env.E2E_SAN_PASSWORD ?? '';
const SHOP_ID = process.env.E2E_SAN_PUSH_SHOP_ID ?? '';
const CONG_TY = process.env.E2E_SAN_CONG_TY ?? 'Commerio Test Sàn';
const DA_CO_BE219 = process.env.E2E_SAN_BE219 === '1';

const UUID = '[0-9a-f-]{36}';

interface PushResult {
  variantId: string;
  listingId: string | null;
  status: string | null;
  code: string | null;
  message: string | null;
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

test.describe('P3-BE · Đẩy listing chạy nền (§18.6.4)', () => {
  test.skip(!EMAIL || !MAT_KHAU || !SHOP_ID, 'Thiếu E2E_SAN_EMAIL, E2E_SAN_PASSWORD hoặc E2E_SAN_PUSH_SHOP_ID');
  test.skip(!DA_CO_BE219, 'Chưa xác nhận BE có commerio-backend#219 (E2E_SAN_BE219=1)');

  test('đẩy một biến thể mới: dòng Đang đẩy, trang tự đọc lại tới khi sàn trả kết quả', async ({ page }) => {
    test.setTimeout(120_000);
    const companyId = await dangNhap(page);

    const shopRes = page.waitForResponse(
      (r) => r.request().method() === 'GET' && new URL(r.url()).pathname.endsWith(`/channel/shops/${SHOP_ID}`),
    );
    await page.goto(`/c/${companyId}/channel/shops/${SHOP_ID}`);
    const shop = (await (await shopRes).json()) as { platform: string; status: string };
    test.skip(shop.platform !== 'mock', `Gian hàng ${SHOP_ID} là sàn ${shop.platform}, không đẩy thật lên sàn`);
    test.skip(shop.status !== 'active', `Gian hàng ${SHOP_ID} đang ${shop.status}`);

    const nutDay = page.locator('tbody tr[data-row-id]').getByRole('button', { name: 'Đẩy sản phẩm mới', exact: true });
    await expect(page.locator('tbody tr[data-row-id]').first()).toBeVisible();
    test.skip((await nutDay.count()) === 0, 'Gian hàng không còn biến thể chưa lên sàn');
    const dong = page.locator('tbody tr[data-row-id]', { has: nutDay.first() });
    const variantId = await dong.getAttribute('data-row-id');

    const pushRes = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith(`/channel/shops/${SHOP_ID}/listings/push`),
    );
    await nutDay.first().click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Đẩy lên sàn', exact: true }).click();
    const res = await pushRes;
    expect(res.status()).toBe(200);
    const { results } = (await res.json()) as { results: PushResult[] };
    expect(results).toHaveLength(1);
    const kq = results[0];
    expect(kq.variantId).toBe(variantId);

    const dongNay = page.locator(`tbody tr[data-row-id="${variantId}"]`);
    if (kq.code) {
      // Bị chặn theo dòng (§18.5): không xếp việc, lý do hiện ở cột Trạng thái
      expect(kq.status).not.toBe('pushing');
      await expect(dongNay.locator('[data-testid=push-error]')).toBeVisible();
      return;
    }
    expect(kq.status).toBe('pushing');
    expect(kq.listingId).toBeTruthy();
    const trangThai = dongNay.locator('[data-testid=listing-status]');
    await expect(trangThai).toHaveText('Đang đẩy');
    // Không tải lại trang: trang đọc lại mỗi 5 giây tới khi rời Đang đẩy
    await expect(trangThai).not.toHaveText('Đang đẩy', { timeout: 90_000 });
    await expect(trangThai).toHaveText(/Đang bán|Chờ sàn duyệt|Lỗi đẩy|Sàn từ chối/);
  });
});
