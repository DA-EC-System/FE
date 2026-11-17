// P3 với BE thật · Ghép SKU chờ CEO duyệt (FE#262; Documents/21 §18.6.5):
//   1–2. Sale xin ghép "không quản tồn", CEO thấy ở tab Chờ duyệt rồi từ chối.
//   3–4. Sale đổi ghép SKU sàn đã có đơn sang biến thể khác (202, chờ duyệt), CEO duyệt rồi ghép lại như cũ.
// Chạy: PW_BASE_URL=<địa chỉ FE trỏ BE thật> pnpm e2e:be
//
// Spec có ghi nhưng trả gian hàng về như cũ: yêu cầu "không quản tồn" bị từ chối; đổi ghép được duyệt thì CEO ghép lại
// biến thể cũ (CEO tự duyệt nên BE trả 200). Ca duyệt không dùng "không quản tồn" vì BE chưa có API đưa SKU sàn đã
// duyệt "không quản tồn" về Chưa ghép, gian hàng thử sẽ bẩn mãi. Ca 3–4 tự bỏ qua khi 20 đơn gần nhất của gian hàng
// không có SKU người bán nào đang ghép, hoặc không còn biến thể chưa ghép để đổi sang.
// Tự bỏ qua trừ khi đặt:
//   E2E_SAN_SHOP_ID                            gian hàng đang hoạt động, còn SKU sàn chưa ghép có SKU người bán
//   E2E_SAN_EMAIL, E2E_SAN_PASSWORD            tài khoản CEO của công ty thử
//   E2E_SAN_SALE_EMAIL, E2E_SAN_SALE_PASSWORD  tài khoản Sale cùng công ty
//   E2E_SAN_DUYET_GHEP=1                       đồng ý cho spec ghi
//   E2E_SAN_CONG_TY                            (tuỳ chọn) tên công ty, mặc định "Commerio Test Sàn"
import { type Page, type Response } from '@playwright/test';
import { chu, dong, duongDan, expect, test, toast } from '../../fixtures';

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

interface DongListing {
  variantId: string;
  sku: string;
  listing: {
    id: string;
    version: number;
    status: string;
    externalSkuId: string | null;
    sellerSku: string | null;
    pendingMapping: { variantId: string | null } | null;
  } | null;
}

interface TrangGhep {
  remote: RemoteSku[];
  rows: DongListing[];
  /** Header Authorization trang đang dùng, để đọc đơn bán bằng chính phiên đó */
  auth: string;
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

/** Mở trang ghép SKU, trả SKU sàn và dòng biến thể BE gửi về; gian hàng không hoạt động thì bỏ qua */
async function moTrangGhep(page: Page, companyId: string): Promise<TrangGhep> {
  const shopRes = page.waitForResponse((r) => apiGet(r, `/channel/shops/${SHOP_ID}`));
  const remoteRes = page.waitForResponse((r) => apiGet(r, `/channel/shops/${SHOP_ID}/remote-skus`));
  const rowsRes = page.waitForResponse((r) => apiGet(r, `/channel/shops/${SHOP_ID}/listings`));
  await page.goto(`/c/${companyId}/channel/shops/${SHOP_ID}`);
  const shop = (await (await shopRes).json()) as { status: string };
  test.skip(shop.status !== 'active', `Gian hàng ${SHOP_ID} đang ${shop.status}`);
  const res = await remoteRes;
  expect(res.status()).toBe(200);
  const rowsR = await rowsRes;
  expect(rowsR.status()).toBe(200);
  return {
    remote: ((await res.json()) as { items: RemoteSku[] }).items,
    rows: ((await rowsR.json()) as { items: DongListing[] }).items,
    auth: (await rowsR.request().headerValue('authorization')) ?? '',
  };
}

/** SKU người bán có trong 20 đơn gần nhất của gian hàng (BE bắt CEO duyệt đổi ghép khi SKU đã có đơn) */
async function skuCoDon(page: Page, auth: string): Promise<Set<string>> {
  const headers = { Authorization: auth };
  const list = await page.request.get('/api/v1/sales/orders', { params: { shopId: SHOP_ID, pageSize: 20 }, headers });
  expect(list.status(), await list.text()).toBe(200);
  const skus = new Set<string>();
  for (const o of ((await list.json()) as { items: { id: string }[] }).items) {
    const res = await page.request.get(`/api/v1/sales/orders/${o.id}`, { headers });
    expect(res.status()).toBe(200);
    for (const l of ((await res.json()) as { lines: { externalSku: string | null }[] }).lines) {
      if (l.externalSku) skus.add(l.externalSku);
    }
  }
  return skus;
}

/** Lọc bảng biến thể theo SKU để dòng cần bấm không nằm ở trang sau */
const timDong = (page: Page, sku: string) => page.getByPlaceholder('Tìm theo tên, SKU hoặc SKU sàn...').fill(sku);

/** Đổi ghép SKU sàn của dòng biến thể `tu` sang biến thể `sang`, trả phản hồi POST /listings/match */
async function doiGhepSang(page: Page, tu: DongListing, sang: DongListing): Promise<Response> {
  await timDong(page, tu.sku);
  await dong(page, tu.variantId).getByRole('button', { name: 'Đổi ghép', exact: true }).click();
  const hop = page.getByRole('dialog');
  await hop.getByPlaceholder('Tìm biến thể theo tên hoặc SKU...').fill(sang.sku);
  await hop.locator(`[id="match-${sang.variantId}"]`).click();
  const match = page.waitForResponse((r) => apiPost(r, '/listings/match'));
  await hop.getByRole('button', { name: 'Lưu ghép', exact: true }).click();
  return match;
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
    const { remote: items } = await moTrangGhep(page, companyId);
    const sku = items.find((r) => !r.mode && !r.matchedVariantId && !r.pendingMapping && r.sellerSku);
    test.skip(!sku, 'Gian hàng không còn SKU sàn chưa ghép có SKU người bán');
    sellerSku = sku!.sellerSku!;

    await page.locator('[data-testid=listing-tab-unmatched]').click();
    const dong = khuSkuSan(page).locator('tr', { hasText: chu(sellerSku) });
    await dong.getByRole('button', { name: 'Ghép với biến thể', exact: true }).click();
    const hop = page.getByRole('dialog');
    await hop.getByRole('radio', { name: /Không quản tồn/ }).click();
    const match = page.waitForResponse((r) => apiPost(r, '/listings/match'));
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
    const { remote: items } = await moTrangGhep(page, companyId);
    expect(items.find((r) => r.sellerSku === sellerSku)?.pendingMapping).toMatchObject({ variantId: null });

    await page.locator('[data-testid=listing-tab-pending]').click();
    const dong = khuSkuSan(page).locator('tr', { hasText: chu(sellerSku) });
    await expect(dong.getByTestId('pending-mapping')).toHaveText('Chờ CEO duyệt');
    await dong.getByRole('button', { name: 'Từ chối ghép', exact: true }).click();
    const hop = page.getByRole('dialog');
    await hop.getByRole('textbox').fill('E2E: thử từ chối ghép chờ');
    const reject = page.waitForResponse((r) => apiPost(r, '/mapping/reject'));
    await hop.getByRole('button', { name: 'Từ chối ghép', exact: true }).click();
    expect((await reject).status()).toBe(200);
    await toast(page, /Ghép cũ giữ nguyên/);
    await expect(khuSkuSan(page).locator('tr', { hasText: chu(sellerSku) })).toHaveCount(0);
    await page.locator('[data-testid=listing-tab-unmatched]').click();
    await expect(khuSkuSan(page).locator('tr', { hasText: chu(sellerSku) }).getByTestId('pending-mapping')).toHaveCount(0);
  });

  /** Ca 3–4: SKU sàn đang ghép biến thể `tu`, Sale xin đổi sang `sang` */
  let doiGhep: { sellerSku: string; tu: DongListing; sang: DongListing } | null = null;

  test('Sale đổi ghép SKU sàn đã có đơn sang biến thể khác: BE trả 202, nhãn Chờ CEO duyệt', async ({ page }) => {
    const companyId = await dangNhap(page, SALE_EMAIL, SALE_MAT_KHAU);
    const { rows, auth } = await moTrangGhep(page, companyId);
    const coDon = await skuCoDon(page, auth);
    const tu = rows.find(
      (r) =>
        r.listing?.externalSkuId &&
        r.listing.sellerSku &&
        coDon.has(r.listing.sellerSku) &&
        !r.listing.pendingMapping &&
        r.listing.status !== 'pushing',
    );
    test.skip(!tu, 'Không thấy SKU sàn đang ghép nào có trong 20 đơn gần nhất của gian hàng');
    const sang = rows.find((r) => !r.listing);
    test.skip(!sang, 'Gian hàng không còn biến thể chưa ghép để đổi sang');
    const sku = tu!.listing!.sellerSku!;

    const res = await doiGhepSang(page, tu!, sang!);
    expect(res.status(), await res.text()).toBe(202);
    doiGhep = { sellerSku: sku, tu: tu!, sang: sang! };
    await toast(page, `Đã gửi CEO duyệt ghép SKU sàn ${sku}`);
    // Trong lúc chờ ghép cũ giữ nguyên: nhãn chờ hiện ở dòng biến thể đang ghép, Sale không có nút duyệt
    await expect(dong(page, tu!.variantId).getByTestId('pending-mapping')).toBeVisible();
    await expect(dong(page, tu!.variantId).getByRole('button', { name: /^(Duyệt ghép|Từ chối ghép)$/ })).toHaveCount(0);
  });

  test('CEO duyệt đổi ghép: SKU sàn sang biến thể mới; rồi ghép lại biến thể cũ để dọn', async ({ page }) => {
    test.skip(!doiGhep, 'Bước Sale đổi ghép chưa chạy');
    const { sellerSku: sku, tu, sang } = doiGhep!;
    const companyId = await dangNhap(page, EMAIL, MAT_KHAU);
    const { rows } = await moTrangGhep(page, companyId);
    expect(rows.find((r) => r.variantId === tu.variantId)?.listing?.pendingMapping).toMatchObject({ variantId: sang.variantId });

    await timDong(page, tu.sku);
    const dongCu = dong(page, tu.variantId);
    await expect(dongCu.getByTestId('pending-mapping')).toHaveText('Chờ CEO duyệt');
    await dongCu.getByRole('button', { name: 'Duyệt ghép', exact: true }).click();
    const hop = page.getByRole('alertdialog');
    await expect(hop).toContainText(sang.sku);
    const approve = page.waitForResponse((r) => apiPost(r, '/mapping/approve'));
    const napLai = page.waitForResponse((r) => apiGet(r, `/channel/shops/${SHOP_ID}/listings`));
    await hop.getByRole('button', { name: 'Duyệt ghép', exact: true }).click();
    const res = await approve;
    expect(res.status(), await res.text()).toBe(200);
    await toast(page, `Đã duyệt ghép SKU sàn ${sku}`);
    const sau = ((await (await napLai).json()) as { items: DongListing[] }).items;
    expect(sau.find((r) => r.variantId === sang.variantId)?.listing).toMatchObject({
      externalSkuId: tu.listing!.externalSkuId,
      pendingMapping: null,
    });
    await expect(dongCu.getByTestId('pending-mapping')).toHaveCount(0);

    // Dọn: CEO ghép SKU sàn lại với biến thể cũ. CEO tự duyệt nên BE trả 200, không tạo yêu cầu chờ
    const moi = sau.find((r) => r.variantId === sang.variantId)!;
    const lai = await doiGhepSang(page, moi, tu);
    expect(lai.status(), await lai.text()).toBe(200);
    expect(await lai.json()).toMatchObject({ externalSkuId: tu.listing!.externalSkuId, pendingMapping: null });
    await toast(page, `Đã ghép ${tu.sku}`);
    await timDong(page, tu.sku);
    await expect(dong(page, tu.variantId).getByRole('button', { name: 'Đổi ghép', exact: true })).toBeVisible();
  });
});
