// P3 với BE thật · Sale xin ghép "không quản tồn", CEO thấy ở tab Chờ duyệt rồi từ chối (FE#262; Documents/21 §18.6.5)
// Chạy: PW_BASE_URL=<địa chỉ FE trỏ BE thật> pnpm e2e:be
//
// Spec có ghi: tạo một yêu cầu ghép chờ rồi từ chối, nên SKU sàn về lại Chưa ghép như cũ. Tự bỏ qua trừ khi đặt:
//   E2E_SAN_SHOP_ID                            gian hàng đang hoạt động, còn SKU sàn chưa ghép có SKU người bán
//   E2E_SAN_EMAIL, E2E_SAN_PASSWORD            tài khoản CEO của công ty thử
//   E2E_SAN_SALE_EMAIL, E2E_SAN_SALE_PASSWORD  tài khoản Sale cùng công ty
//   E2E_SAN_DUYET_GHEP=1                       đồng ý cho spec ghi
//   E2E_SAN_CONG_TY                            (tuỳ chọn) tên công ty, mặc định "Commerio Test Sàn"
import { type Page, type Response } from '@playwright/test';
import { chu, duongDan, expect, test, toast } from '../../fixtures';

const SHOP_ID = process.env.E2E_SAN_SHOP_ID ?? '';
const EMAIL = process.env.E2E_SAN_EMAIL ?? '';
const MAT_KHAU = process.env.E2E_SAN_PASSWORD ?? '';
const SALE_EMAIL = process.env.E2E_SAN_SALE_EMAIL ?? '';
const SALE_MAT_KHAU = process.env.E2E_SAN_SALE_PASSWORD ?? '';
const CONG_TY = process.env.E2E_SAN_CONG_TY ?? 'Commerio Test Sàn';
const CHO_GHI = process.env.E2E_SAN_DUYET_GHEP === '1';

const UUID = '[0-9a-f-]{36}';

interface RemoteSku {
  externalSkuId: string;
  sellerSku: string | null;
  mode: string | null;
  matchedVariantId: string | null;
  listingId: string | null;
  pendingMapping: { variantId: string | null; requestedBy: { name: string } } | null;
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

const apiGet = (r: Response, suffix: string) =>
  r.request().method() === 'GET' && r.request().resourceType() !== 'document' && new URL(r.url()).pathname.endsWith(suffix);

/** Mở trang ghép SKU, trả SKU sàn BE gửi về; gian hàng không hoạt động thì bỏ qua */
async function moTrangGhep(page: Page, companyId: string): Promise<RemoteSku[]> {
  const shopRes = page.waitForResponse((r) => apiGet(r, `/channel/shops/${SHOP_ID}`));
  const remoteRes = page.waitForResponse((r) => apiGet(r, `/channel/shops/${SHOP_ID}/remote-skus`));
  await page.goto(`/c/${companyId}/channel/shops/${SHOP_ID}`);
  const shop = (await (await shopRes).json()) as { status: string };
  test.skip(shop.status !== 'active', `Gian hàng ${SHOP_ID} đang ${shop.status}`);
  const res = await remoteRes;
  expect(res.status()).toBe(200);
  return ((await res.json()) as { items: RemoteSku[] }).items;
}

const khuSkuSan = (page: Page) => page.locator('[data-testid=remote-section]');

test.describe.configure({ mode: 'serial' });

test.describe('P3-BE · CEO duyệt ghép SKU (§18.6.5)', () => {
  test.skip(
    !SHOP_ID || !EMAIL || !MAT_KHAU || !SALE_EMAIL || !SALE_MAT_KHAU || !CHO_GHI,
    'Thiếu E2E_SAN_SHOP_ID, tài khoản CEO/Sale hoặc E2E_SAN_DUYET_GHEP=1',
  );

  let sellerSku = '';

  test('Sale đặt SKU sàn chưa ghép là không quản tồn: BE trả 202, chờ CEO duyệt', async ({ page }) => {
    const companyId = await dangNhap(page, SALE_EMAIL, SALE_MAT_KHAU);
    const items = await moTrangGhep(page, companyId);
    const sku = items.find((r) => !r.mode && !r.matchedVariantId && !r.pendingMapping && r.sellerSku);
    test.skip(!sku, 'Gian hàng không còn SKU sàn chưa ghép có SKU người bán');
    sellerSku = sku!.sellerSku!;

    await page.locator('[data-testid=listing-tab-unmatched]').click();
    const dong = khuSkuSan(page).locator('tr', { hasText: chu(sellerSku) });
    await dong.getByRole('button', { name: 'Ghép với biến thể', exact: true }).click();
    const hop = page.getByRole('dialog');
    await hop.getByRole('radio', { name: /Không quản tồn/ }).click();
    const match = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/listings/match'));
    await hop.getByRole('button', { name: 'Lưu ghép', exact: true }).click();
    expect((await match).status()).toBe(202);
    await toast(page, `Đã gửi CEO duyệt ghép SKU sàn ${sellerSku}`);
    await expect(dong.getByTestId('pending-mapping')).toBeVisible();
    // Sale không có quyền duyệt
    await expect(dong.getByRole('button', { name: /^(Duyệt ghép|Từ chối ghép)$/ })).toHaveCount(0);
  });

  test('CEO thấy yêu cầu ở tab Chờ duyệt, từ chối kèm lý do: SKU sàn về lại Chưa ghép', async ({ page }) => {
    test.skip(!sellerSku, 'Bước Sale xin ghép chưa chạy');
    const companyId = await dangNhap(page, EMAIL, MAT_KHAU);
    const items = await moTrangGhep(page, companyId);
    expect(items.find((r) => r.sellerSku === sellerSku)?.pendingMapping).toMatchObject({ variantId: null });

    await page.locator('[data-testid=listing-tab-pending]').click();
    const dong = khuSkuSan(page).locator('tr', { hasText: chu(sellerSku) });
    await expect(dong.getByTestId('pending-mapping')).toHaveText('Chờ CEO duyệt');
    await dong.getByRole('button', { name: 'Từ chối ghép', exact: true }).click();
    const hop = page.getByRole('dialog');
    await hop.getByRole('textbox').fill('E2E: thử từ chối ghép chờ');
    const reject = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/mapping/reject'));
    await hop.getByRole('button', { name: 'Từ chối ghép', exact: true }).click();
    expect((await reject).status()).toBe(200);
    await toast(page, /Ghép cũ giữ nguyên/);
    await expect(khuSkuSan(page).locator('tr', { hasText: chu(sellerSku) })).toHaveCount(0);
    await page.locator('[data-testid=listing-tab-unmatched]').click();
    await expect(khuSkuSan(page).locator('tr', { hasText: chu(sellerSku) }).getByTestId('pending-mapping')).toHaveCount(0);
  });
});
