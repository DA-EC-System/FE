// P4 với BE thật · Đổi liên kết SKU khi kiện đã đóng (FE#359; commerio-backend#237 PR 2, Documents/21 §18.3, §19.2):
//   1. CEO đổi liên kết một SKU sàn đang nằm trong kiện Đã đóng gói / Chờ lấy hàng sang biến thể khác (qua API, 200).
//   2. Kiện sang Cần mở lại kiện với mục đích "Đổi liên kết SKU": hàng đợi, chi tiết kiện (dấu dòng), chi tiết đơn (việc dỡ kiện).
//   3. Kho bấm Mở kiện: kiện về Chờ đóng gói hoặc Thiếu hàng, dòng mang SKU của biến thể mới, hết dấu.
//   Cuối cùng trả liên kết về biến thể cũ (kiện đã mở nên BE đổi phần giữ ngay, không bật Cần mở).
// Spec ghi dữ liệu thật trên gian hàng thử (staging chỉ có dữ liệu của nhóm). BE phải có commerio-backend#453.
// Đổi liên kết áp cho mọi đơn còn mở của SKU đó trong gian hàng, không chỉ kiện được chọn. Thử kiện Chờ lấy hàng trước
// (mở giữ vận đơn, không gọi sàn); chỉ khi không có mới dùng kiện Đã đóng gói, mà kiện Lazada đã đóng gói thì mở là
// repack thật trên sàn, mất mã kiện và vận đơn cũ.
// Chạy: PW_BASE_URL=<địa chỉ FE trỏ BE thật> pnpm e2e:be
// Tự bỏ qua trừ khi đặt:
//   E2E_SAN_SHOP_ID                  gian hàng đang hoạt động, có kiện đơn sàn Chờ lấy hàng / Đã đóng gói không cờ
//   E2E_SAN_EMAIL, E2E_SAN_PASSWORD  tài khoản CEO của công ty thử (CEO đổi liên kết thì áp luôn, không chờ duyệt)
//   E2E_SAN_DOI_LIEN_KET=1           đồng ý cho spec ghi
//   E2E_SAN_CONG_TY                  (tuỳ chọn) tên công ty, mặc định "Commerio Test Sàn"
import { type Page, type Response } from '@playwright/test';
import { chu, dong, duongDan, expect, test } from '../../fixtures';

const SHOP_ID = process.env.E2E_SAN_SHOP_ID ?? '';
const EMAIL = process.env.E2E_SAN_EMAIL ?? '';
const MAT_KHAU = process.env.E2E_SAN_PASSWORD ?? '';
const CONG_TY = process.env.E2E_SAN_CONG_TY ?? 'Commerio Test Sàn';
const CHO_GHI = process.env.E2E_SAN_DOI_LIEN_KET === '1';

const UUID = '[0-9a-f-]{36}';

interface DongKien {
  id: string;
  variantId: string | null;
  externalSku: string | null;
  sku: string;
  remapPending?: boolean;
}

interface Kien {
  id: string;
  code: string;
  status: string;
  flags: string[];
  openPurpose: string | null;
  order: { id: string; code: string };
  lines: DongKien[];
}

interface DongDon {
  variantId: string | null;
  externalSku: string | null;
  externalSkuId: string | null;
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

test.describe.configure({ mode: 'serial' });

test.describe('P4-BE · Đổi liên kết SKU khi kiện đã đóng (FE#359)', () => {
  test.skip(!SHOP_ID || !EMAIL || !MAT_KHAU || !CHO_GHI, 'Thiếu E2E_SAN_SHOP_ID, tài khoản CEO hoặc E2E_SAN_DOI_LIEN_KET=1');

  // Liên kết cần trả về sau khi thử; rỗng khi chưa đổi
  let khoiPhuc: { externalSkuId: string; variantId: string } | null = null;
  let auth = '';

  test.afterAll(async ({ request }) => {
    if (!khoiPhuc) return;
    const res = await request.post(`/api/v1/channel/shops/${SHOP_ID}/listings/match`, {
      data: khoiPhuc,
      headers: { Authorization: auth },
    });
    expect(res.status(), await res.text()).toBe(200);
  });

  test('CEO đổi liên kết SKU: kiện đã đóng sang Cần mở, kho mở thì dòng thành biến thể mới', async ({ page }) => {
    const companyId = await dangNhap(page, EMAIL, MAT_KHAU);
    auth = await layAuth(page, companyId);
    const headers = { Authorization: auth };

    // Kiện đơn sàn đã đóng, không cờ, có dòng đã liên kết biến thể
    let kien: Kien | undefined;
    let dongA: DongKien | undefined;
    for (const tab of ['awaiting_pickup', 'packed']) {
      const res = await page.request.get('/api/v1/fulfillment/packages', { params: { tab, shopId: SHOP_ID, pageSize: 50 }, headers });
      expect(res.status(), await res.text()).toBe(200);
      for (const k of ((await res.json()) as { items: Kien[] }).items) {
        const l = k.flags.length === 0 ? k.lines.find((x) => x.variantId && x.externalSku) : undefined;
        if (l) {
          kien = k;
          dongA = l;
          break;
        }
      }
      if (kien) break;
    }
    test.skip(!kien || !dongA, 'Gian hàng không có kiện Đã đóng gói / Chờ lấy hàng không cờ nào có dòng đã liên kết');
    const k = kien!;
    const a = dongA!;

    // SKU sàn (sku_id) của dòng, đọc từ dòng đơn cùng biến thể, cùng SKU người bán
    const donRes = await page.request.get(`/api/v1/sales/orders/${k.order.id}`, { headers });
    expect(donRes.status(), await donRes.text()).toBe(200);
    const dongDon = ((await donRes.json()) as { lines: DongDon[] }).lines.find(
      (l) => l.variantId === a.variantId && l.externalSku === a.externalSku && l.externalSkuId,
    );
    test.skip(!dongDon, `Dòng đơn của ${a.externalSku} không có sku_id`);
    const externalSkuId = dongDon!.externalSkuId!;

    // Biến thể B: SKU khác của công ty
    const bienThe = await page.request.get('/api/v1/catalog/variants/bulk-edit', { params: { pageSize: 50 }, headers });
    expect(bienThe.status(), await bienThe.text()).toBe(200);
    const b = ((await bienThe.json()) as { items: { variantId: string; sku: string }[] }).items.find((v) => v.variantId !== a.variantId);
    test.skip(!b, 'Công ty chỉ có một biến thể');

    const doi = await page.request.post(`/api/v1/channel/shops/${SHOP_ID}/listings/match`, {
      data: { externalSkuId, variantId: b!.variantId },
      headers,
    });
    expect(doi.status(), await doi.text()).toBe(200);
    khoiPhuc = { externalSkuId, variantId: a.variantId! };

    // Hàng đợi, tab Cần mở lại kiện: mục đích Đổi liên kết SKU
    await page.goto(`/c/${companyId}/fulfillment/packages?tab=needs_open`);
    await expect(dong(page, k.id).getByTestId('open-purpose')).toHaveText('Đổi liên kết SKU');

    // Chi tiết đơn: việc dỡ kiện, dòng kiện ghi đổi khi mở
    await page.goto(`/c/${companyId}/sales/orders/${k.order.id}`);
    await expect(page.getByTestId('unload-task')).toBeVisible();
    await expect(page.getByText(chu(`${a.sku} × `)).first()).toContainText('(đổi liên kết SKU khi mở kiện)');

    // Chi tiết kiện: cảnh báo, dấu ở dòng SKU cũ, không còn Báo sẵn sàng
    await page.goto(`/c/${companyId}/fulfillment/packages/${k.id}`);
    await expect(page.getByText('Cần mở lại kiện: Đổi liên kết SKU')).toBeVisible();
    const bang = page.getByTestId('package-lines');
    await expect(bang.locator(`tr[data-row-id="${a.sku}"]`).getByTestId('remap-pending')).toBeVisible();
    await expect(page.getByRole('button', { name: /Sẵn sàng giao/ })).toHaveCount(0);

    // Kho mở kiện: BE áp liên kết mới; thiếu hàng thì kiện về Thiếu hàng, mở vẫn thành công
    await page.getByRole('button', { name: 'Mở kiện', exact: true }).click();
    // ConfirmDialog dựng trên AlertDialog: role `alertdialog`
    const hoi = page.getByRole('alertdialog');
    await expect(hoi).toContainText('Mở ra sẽ áp liên kết SKU mới');
    const mo = page.waitForResponse((r) => apiPost(r, `/fulfillment/packages/${k.id}/open`));
    await hoi.getByRole('button', { name: 'Mở kiện', exact: true }).click();
    expect((await mo).status()).toBe(200);

    const sau = (await (await page.request.get(`/api/v1/fulfillment/packages/${k.id}`, { headers })).json()) as Kien;
    expect(['reserved', 'backordered']).toContain(sau.status);
    expect(sau.flags).not.toContain('needs_open');
    expect(sau.lines.some((l) => l.remapPending)).toBe(false);
    expect(sau.lines.some((l) => l.variantId === b!.variantId)).toBe(true);

    await expect(bang.getByTestId('remap-pending')).toHaveCount(0);
    await expect(bang.locator(`tr[data-row-id="${b!.sku}"]`)).toBeVisible();
  });
});
