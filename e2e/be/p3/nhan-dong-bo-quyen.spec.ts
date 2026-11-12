// P3 với BE thật · Nhãn đồng bộ listing và nút Ghép/Đẩy theo quyền (FE#165; Documents/21 §18.6.5, §18.6.6, commerio-backend#309)
// Chạy: PW_BASE_URL=<địa chỉ FE trỏ BE thật> pnpm e2e:be
//
// Spec chỉ đọc, không ghép, không đẩy, nên chạy được cả trên staging. Tự bỏ qua trừ khi đặt:
//   E2E_SAN_SHOP_ID                      gian hàng đang hoạt động của công ty thử, đã có biến thể ghép SKU
//   E2E_SAN_EMAIL, E2E_SAN_PASSWORD      tài khoản có quyền đẩy listing (CEO hoặc Admin)
//   E2E_SAN_SALE_EMAIL, E2E_SAN_SALE_PASSWORD  (tuỳ chọn) tài khoản Sale cùng công ty: ghép được, không đẩy, không gỡ
//   E2E_SAN_CONG_TY                      (tuỳ chọn) tên công ty, mặc định "Commerio Test Sàn"
import { type Page } from '@playwright/test';
import { chu, duongDan, expect, test, thayChu } from '../../fixtures';

const SHOP_ID = process.env.E2E_SAN_SHOP_ID ?? '';
const EMAIL = process.env.E2E_SAN_EMAIL ?? '';
const MAT_KHAU = process.env.E2E_SAN_PASSWORD ?? '';
const SALE_EMAIL = process.env.E2E_SAN_SALE_EMAIL ?? '';
const SALE_MAT_KHAU = process.env.E2E_SAN_SALE_PASSWORD ?? '';
const CONG_TY = process.env.E2E_SAN_CONG_TY ?? 'Commerio Test Sàn';

const UUID = '[0-9a-f-]{36}';

interface SyncError {
  code: string;
  message: string;
  at: string;
}
interface Row {
  variantId: string;
  listing: {
    status: string;
    hiddenBy: string | null;
    stockSync: string;
    priceSync: string;
    stockSyncError: SyncError | null;
    priceSyncError: SyncError | null;
    lastPushedAt: string | null;
  } | null;
}

async function dangNhap(page: Page, email: string, matKhau: string): Promise<string> {
  await page.goto('/login');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(matKhau);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect.poll(() => duongDan(page)).toMatch(/^\/(c\/|select-company)/);
  const nut = page.locator('button:not([data-sidebar])', { hasText: chu(CONG_TY) }).first();
  await expect(async () => {
    if (duongDan(page) === '/select-company') await nut.click({ timeout: 1000 });
    expect(duongDan(page)).toMatch(new RegExp(`^/c/${UUID}`));
  }).toPass();
  await expect(page.getByTestId('nav-user')).toBeVisible();
  return duongDan(page).split('/')[2];
}

/** Mở trang ghép SKU, trả các dòng BE gửi về; gian hàng không hoạt động thì bỏ qua */
async function moTrangGhep(page: Page, companyId: string): Promise<Row[]> {
  const shopRes = page.waitForResponse(
    (r) => r.request().method() === 'GET' && new URL(r.url()).pathname.endsWith(`/channel/shops/${SHOP_ID}`),
  );
  const listRes = page.waitForResponse(
    (r) => r.request().method() === 'GET' && new URL(r.url()).pathname.endsWith(`/channel/shops/${SHOP_ID}/listings`),
  );
  await page.goto(`/c/${companyId}/channel/shops/${SHOP_ID}`);
  const shop = (await (await shopRes).json()) as { status: string };
  test.skip(shop.status !== 'active', `Gian hàng ${SHOP_ID} đang ${shop.status}`);
  const res = await listRes;
  expect(res.status()).toBe(200);
  const { items } = (await res.json()) as { items: Row[] };
  await expect(page.locator('tbody tr[data-row-id]').first()).toBeVisible();
  return items;
}

const dongBienThe = (page: Page) => page.locator('tbody tr[data-row-id]');

test.describe('P3-BE · Nhãn đồng bộ và quyền nút ghép SKU (§18.6.5, §18.6.6)', () => {
  test.skip(!SHOP_ID || !EMAIL || !MAT_KHAU, 'Thiếu E2E_SAN_SHOP_ID, E2E_SAN_EMAIL hoặc E2E_SAN_PASSWORD');

  test('nhãn ở cột Trạng thái khớp trường đồng bộ BE trả', async ({ page }) => {
    const companyId = await dangNhap(page, EMAIL, MAT_KHAU);
    const items = await moTrangGhep(page, companyId);
    const theoId = new Map(items.map((r) => [r.variantId, r]));
    const ids = await dongBienThe(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-row-id') ?? ''));
    expect(ids.length).toBeGreaterThan(0);

    for (const id of ids) {
      const l = theoId.get(id)?.listing;
      const dong = page.locator(`tbody tr[data-row-id="${id}"]`);
      if (!l) {
        await expect(dong.locator('[data-testid=sync-error], [data-testid=stock-sync]')).toHaveCount(0);
        continue;
      }
      const trenSan = l.status !== 'delisted';
      // Lệch tồn: sàn lệch app hai lượt đối chiếu liền
      if (trenSan && l.stockSync === 'error') await expect(dong.locator('[data-testid=stock-sync]')).toHaveText(/^Lệch tồn/);
      // Lỗi đẩy theo SKU: nhãn cố định, câu của sàn trong tooltip
      const loi = [
        ...(l.stockSyncError ? ['Cập nhật tồn lên sàn lỗi'] : []),
        ...(l.priceSyncError ? ['Đẩy giá lỗi'] : []),
      ];
      await expect(dong.locator('[data-testid=sync-error]')).toHaveText(loi);
      if (trenSan && l.lastPushedAt && l.priceSync === 'pending')
        await expect(dong.locator('[data-testid=price-sync]')).toHaveText('Giá đã đổi, chưa đẩy');
      await expect(dong.locator('[data-testid=hidden-zero]')).toHaveCount(
        l.status === 'hidden' && l.hiddenBy === 'zero_stock' ? 1 : 0,
      );
    }
  });

  test('CEO hoặc Admin có nút Ghép và Đẩy', async ({ page }) => {
    const companyId = await dangNhap(page, EMAIL, MAT_KHAU);
    await moTrangGhep(page, companyId);
    await expect(page.getByRole('button', { name: /^(Đẩy lên sàn|Đẩy \d+ biến thể lên sàn)$/ })).toBeVisible();
    await expect(dongBienThe(page).getByRole('button', { name: /^(Ghép|Đổi ghép)$/ }).first()).toBeAttached();
  });

  test('Sale có nút Ghép, không có nút Đẩy, Gỡ, Bỏ ghép', async ({ page }) => {
    test.skip(!SALE_EMAIL || !SALE_MAT_KHAU, 'Thiếu E2E_SAN_SALE_EMAIL hoặc E2E_SAN_SALE_PASSWORD');
    const companyId = await dangNhap(page, SALE_EMAIL, SALE_MAT_KHAU);
    await moTrangGhep(page, companyId);
    await thayChu(page, 'Bạn ghép được SKU sàn với biến thể');
    await expect(dongBienThe(page).getByRole('button', { name: /^(Ghép|Đổi ghép)$/ }).first()).toBeAttached();
    await expect(page.getByRole('button', { name: /Đẩy/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Gỡ khỏi sàn|Bỏ ghép/ })).toHaveCount(0);
  });
});
