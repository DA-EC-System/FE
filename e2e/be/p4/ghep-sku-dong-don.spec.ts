// P4 với BE thật · Ghép SKU từ dòng đơn trên trang chi tiết đơn (FE#283; commerio-backend#237, Documents/21 §18.6):
//   1. Sale mở đơn có cờ Chưa ghép SKU, bấm "Ghép SKU" ở dòng, chọn "Không quản tồn": BE trả 202, dòng hiện Chờ CEO duyệt.
//   2. CEO thấy dòng đang chờ (không còn nút ghép), từ chối qua API để trả gian hàng về như cũ; nút "Ghép SKU" hiện lại.
// Không thử ghép với biến thể (200): ghép có hiệu lực áp lên mọi đơn đã nhận của SKU đó và BE chưa có API bỏ ghép,
// gian hàng thử sẽ bẩn mãi. Ca đó có ở e2e mock và test handler.
// Chạy: PW_BASE_URL=<địa chỉ FE trỏ BE thật> pnpm e2e:be
// Tự bỏ qua trừ khi đặt (cùng biến với e2e/be/p3/duyet-ghep.spec.ts):
//   E2E_SAN_SHOP_ID                            gian hàng đang hoạt động, có đơn mang cờ Chưa ghép SKU
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
  listingVersion: number | null;
  pendingMapping: { variantId: string | null } | null;
}

interface DongDon {
  externalSku: string | null;
  externalSkuId?: string | null;
  variantId: string | null;
  untracked?: boolean;
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
const apiPost = (r: Response, suffix: string) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith(suffix);

/** Mở danh sách đơn để lấy header Authorization phiên đang dùng */
async function layAuth(page: Page, companyId: string): Promise<string> {
  const list = page.waitForResponse((r) => apiGet(r, '/sales/orders'));
  await page.goto(`/c/${companyId}/sales/orders`);
  return (await (await list).request().headerValue('authorization')) ?? '';
}

const isChuaGhep = (l: DongDon) => Boolean(l.externalSku) && !l.variantId && !l.untracked;

test.describe.configure({ mode: 'serial' });

test.describe('P4-BE · Ghép SKU từ dòng đơn (FE#283)', () => {
  test.skip(
    !SHOP_ID || !EMAIL || !MAT_KHAU || !SALE_EMAIL || !SALE_MAT_KHAU || !CHO_GHI,
    'Thiếu E2E_SAN_SHOP_ID, tài khoản CEO/Sale hoặc E2E_SAN_DUYET_GHEP=1',
  );

  let orderId = '';
  let sellerSku = '';

  test('Sale chọn "Không quản tồn" ở dòng đơn: BE trả 202, dòng hiện Chờ CEO duyệt', async ({ page }) => {
    const companyId = await dangNhap(page, SALE_EMAIL, SALE_MAT_KHAU);
    const headers = { Authorization: await layAuth(page, companyId) };
    const remoteRes = await page.request.get(`/api/v1/channel/shops/${SHOP_ID}/remote-skus`, { headers });
    expect(remoteRes.status(), await remoteRes.text()).toBe(200);
    const remote = ((await remoteRes.json()) as { items: RemoteSku[] }).items;
    const list = await page.request.get('/api/v1/sales/orders', {
      params: { shopId: SHOP_ID, flag: 'unmapped_sku', pageSize: 20 },
      headers,
    });
    expect(list.status(), await list.text()).toBe(200);
    // Đơn có dòng chưa ghép mà SKU sàn chưa có ghép chờ
    for (const o of ((await list.json()) as { items: { id: string }[] }).items) {
      const res = await page.request.get(`/api/v1/sales/orders/${o.id}`, { headers });
      expect(res.status()).toBe(200);
      const line = ((await res.json()) as { lines: DongDon[] }).lines.find(
        (l) => isChuaGhep(l) && remote.some((r) => r.sellerSku === l.externalSku && !r.pendingMapping && !r.mode),
      );
      if (line) {
        orderId = o.id;
        sellerSku = line.externalSku!;
        break;
      }
    }
    test.skip(!orderId, 'Gian hàng không có đơn mang dòng Chưa ghép SKU nào để thử');

    await page.goto(`/c/${companyId}/sales/orders/${orderId}`);
    const dong = page.locator('[data-testid=line-unmapped]').first();
    await expect(dong).toContainText('Chưa ghép SKU');
    await dong.getByRole('button', { name: 'Ghép SKU', exact: true }).click();
    const hop = page.getByRole('dialog');
    await expect(hop).toContainText(sellerSku);
    await hop.getByRole('radio', { name: /Không quản tồn/ }).check();
    const match = page.waitForResponse((r) => apiPost(r, '/listings/match'));
    await hop.getByRole('button', { name: 'Lưu ghép', exact: true }).click();
    expect((await match).status()).toBe(202);
    await toast(page, `Đã gửi CEO duyệt ghép SKU sàn ${sellerSku}`);
    await expect(dong.getByTestId('pending-mapping')).toHaveText('Chờ CEO duyệt');
    await expect(dong.getByRole('button', { name: 'Ghép SKU', exact: true })).toHaveCount(0);
  });

  test('CEO thấy dòng đang chờ; từ chối thì nút "Ghép SKU" hiện lại', async ({ page }) => {
    test.skip(!orderId, 'Bước Sale xin ghép chưa chạy');
    const companyId = await dangNhap(page, EMAIL, MAT_KHAU);
    const headers = { Authorization: await layAuth(page, companyId) };
    await page.goto(`/c/${companyId}/sales/orders/${orderId}`);
    const dong = page.locator('[data-testid=line-unmapped]', { hasText: chu(sellerSku) }).first();
    await expect(dong.getByTestId('pending-mapping')).toHaveText('Chờ CEO duyệt');

    const remoteRes = await page.request.get(`/api/v1/channel/shops/${SHOP_ID}/remote-skus`, { headers });
    const sku = ((await remoteRes.json()) as { items: RemoteSku[] }).items.find((r) => r.sellerSku === sellerSku);
    expect(sku?.pendingMapping).toMatchObject({ variantId: null });
    const reject = await page.request.post(`/api/v1/channel/shops/${SHOP_ID}/listings/${sku!.listingId}/mapping/reject`, {
      headers,
      data: { version: sku!.listingVersion, reason: 'E2E: trả ghép chờ từ dòng đơn' },
    });
    expect(reject.status(), await reject.text()).toBe(200);

    await page.reload();
    await expect(dong.getByTestId('pending-mapping')).toHaveCount(0);
    await expect(dong.getByRole('button', { name: 'Ghép SKU', exact: true })).toBeVisible();
  });
});
