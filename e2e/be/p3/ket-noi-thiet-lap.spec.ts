// P3 với BE thật · Kết nối gian hàng bằng token rồi thiết lập lần đầu (FE#163; Documents/21 §18.4, §18.6.2, §18.6.3, §18.7)
// Cần commerio-backend#200 và #198 đã merge. Chạy: PW_BASE_URL=<địa chỉ FE trỏ BE thật> pnpm e2e:be
//
// Spec tạo gian hàng thật trên công ty thử nên tự bỏ qua trừ khi đặt đủ:
//   E2E_SAN_EMAIL, E2E_SAN_PASSWORD  tài khoản có quyền kết nối gian hàng ở công ty thử
//   E2E_SAN_ACCESS_TOKEN             access token sàn chấp nhận (sàn giả lập của BE nhận token bất kỳ)
//   E2E_SAN_BE200=1                  xác nhận BE đang chạy đã có commerio-backend#200 và #198
//   E2E_SAN_BE187=1                  xác nhận BE trả đủ §18.7 (Documents#73): shops[].previousStatus, remoteSkuCount,
//                                    suggestions có match/score, nhận decisions, Shop.setup
//   PLATFORM hoặc E2E_SAN_PLATFORM   (tuỳ chọn) mã sàn, mặc định "mock". TikTok (FE#198, commerio-backend#217):
//                                    PLATFORM=tiktok; BE chưa công bố tiktok trong /channel/shops/platforms thì bỏ qua kèm lý do
//   E2E_SAN_CONG_TY                  (tuỳ chọn) tên công ty, mặc định "Commerio Test Sàn"
// Chạy xong gian hàng vẫn nối: ngắt tay ở trang Gian hàng nếu cần chạy lại từ đầu.
import { type Page } from '@playwright/test';
import { chu, duongDan, expect, test, thayChu } from '../../fixtures';

const EMAIL = process.env.E2E_SAN_EMAIL ?? '';
const MAT_KHAU = process.env.E2E_SAN_PASSWORD ?? '';
const TOKEN = process.env.E2E_SAN_ACCESS_TOKEN ?? '';
const PLATFORM = process.env.PLATFORM || process.env.E2E_SAN_PLATFORM || 'mock';
const CONG_TY = process.env.E2E_SAN_CONG_TY ?? 'Commerio Test Sàn';
const DA_CO_BE = process.env.E2E_SAN_BE200 === '1';
const DA_CO_187 = process.env.E2E_SAN_BE187 === '1';

const UUID = '[0-9a-f-]{36}';

interface KetQuaKetNoi {
  shop: { id: string; status: string; shopName: string };
  created: boolean;
  shops: { shop: { id: string; status: string }; created: boolean; previousStatus: string | null; remoteSkuCount: number | null }[];
}

interface San {
  platform: string;
  name: string;
  connectable: boolean;
  reason?: string | null;
  methods?: string[];
  capabilities: { returnWindow: 'days' | 'platform_status' };
}

/** Bỏ qua kèm lý do khi BE chưa công bố sàn hoặc sàn chưa nối được */
function canSan(items: San[]): San {
  const san = items.find((p) => p.platform === PLATFORM);
  test.skip(!san, `BE chưa công bố sàn ${PLATFORM} trong /channel/shops/platforms (TikTok: chờ commerio-backend#217 lên staging)`);
  test.skip(!san!.connectable, `Sàn ${PLATFORM} chưa nối được: ${san!.reason ?? 'BE không nêu lý do'}`);
  return san!;
}

interface GoiY {
  externalSkuId: string;
  match: 'sku' | 'name' | 'none';
  score: number | null;
  variantId: string | null;
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

const laApi = (method: string, path: RegExp) => (r: { request: () => { method: () => string }; url: () => string }) =>
  r.request().method() === method && path.test(new URL(r.url()).pathname);

test.describe('P3-BE · Kết nối gian hàng bằng token và thiết lập lần đầu', () => {
  test.skip(!EMAIL || !MAT_KHAU || !TOKEN, 'Thiếu E2E_SAN_EMAIL, E2E_SAN_PASSWORD hoặc E2E_SAN_ACCESS_TOKEN');
  test.skip(!DA_CO_BE, 'Chưa xác nhận BE có commerio-backend#200 và #198 (E2E_SAN_BE200=1)');
  test.skip(!DA_CO_187, 'Chưa xác nhận BE trả đủ §18.7 theo Documents#73 (E2E_SAN_BE187=1)');

  test('dán token: một gian hàng mới mở wizard; thiết lập gửi đúng body, mốc kéo đơn chỉ hiển thị', async ({ page }) => {
    const companyId = await dangNhap(page);
    await page.goto(`/c/${companyId}/channel/shops`);

    // Hộp thêm gian hàng chỉ hiện nút theo `methods` của sàn
    const platforms = page.waitForResponse(laApi('GET', /\/channel\/shops\/platforms$/));
    await page.getByRole('button', { name: 'Thêm gian hàng', exact: true }).click();
    const danhSachSan = (await (await platforms).json()) as { items: San[] };
    const san = canSan(danhSachSan.items);
    test.skip(!san.methods?.includes('token'), `Sàn ${PLATFORM} không cho dán token`);

    const section = page.locator('[data-testid=connect-section]');
    await section.getByRole('button', { name: san.name, exact: true }).click();
    // Sàn có cả uỷ quyền thì chọn cách dán token; chỉ token thì không có lựa chọn
    const radioToken = section.getByRole('radio', { name: /^Dán token/ });
    if ((await radioToken.count()) > 0) await radioToken.click();
    await section.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
    const form = page.locator('[data-testid=token-form]');
    await form.getByLabel('Access token', { exact: true }).fill(TOKEN);
    const ketNoi = page.waitForResponse(laApi('POST', new RegExp(`/channel/shops/${PLATFORM}/token$`)));
    await form.getByRole('button', { name: 'Kết nối', exact: true }).click();
    const res = await ketNoi;
    expect([200, 201]).toContain(res.status());
    // Dán token trả cùng dạng với callback OAuth (§18.4)
    const ketQua = (await res.json()) as KetQuaKetNoi;
    expect(Array.isArray(ketQua.shops)).toBe(true);
    expect(ketQua.shops.length).toBeGreaterThanOrEqual(1);
    // previousStatus, remoteSkuCount nằm trong từng phần tử shops[] (§18.7.4)
    for (const item of ketQua.shops) {
      expect(item).toHaveProperty('previousStatus');
      // null khi BE chưa đọc được SKU trên sàn (lỗi sàn, quá 10 giây), không phải 0 (§18.7.4)
      expect(item.remoteSkuCount === null || typeof item.remoteSkuCount === 'number').toBe(true);
    }

    const motShopMoi = ketQua.shops.length === 1 && ketQua.shop.status === 'connecting';
    if (!motShopMoi) {
      // Nhiều gian hàng hoặc gian hàng đã có: màn kết quả trong hộp, ở lại danh sách
      await expect(section.locator('[data-outcome]')).toBeVisible();
      await expect.poll(() => duongDan(page)).toBe(`/c/${companyId}/channel/shops`);
      test.skip(true, 'Token không ra đúng một gian hàng mới đang thiết lập; ngắt gian hàng cũ rồi chạy lại để thử wizard');
      return;
    }

    const preview = page.waitForResponse(laApi('GET', new RegExp(`/channel/shops/${ketQua.shop.id}/setup$`)));
    await section.locator('[data-outcome=connected]').getByRole('button', { name: 'Thiết lập ngay', exact: true }).click();
    await expect.poll(() => duongDan(page)).toBe(`/c/${companyId}/channel/shops/${ketQua.shop.id}/setup`);
    const xemTruoc = (await (await preview).json()) as {
      proposedCutoffAt: string;
      firstShopOfCompany: boolean;
      suggestions: GoiY[];
    };
    expect(typeof xemTruoc.proposedCutoffAt).toBe('string');
    expect(typeof xemTruoc.firstShopOfCompany).toBe('boolean');
    for (const g of xemTruoc.suggestions) expect(['sku', 'name', 'none']).toContain(g.match);

    // Bước 1: mỗi SKU sàn một dòng; giữ gợi ý chọn sẵn (chỉ dòng có variantId, mỗi biến thể một dòng)
    await expect(page.locator('[data-testid=setup-suggestions] [data-suggestion]')).toHaveCount(xemTruoc.suggestions.length);
    await page.getByRole('button', { name: 'Tiếp', exact: true }).click();

    // Bước 2: gian hàng đầu tiên của công ty thì không chọn được đẩy số Commerio
    const day = page.getByRole('radio', { name: /Lấy số Commerio đẩy lên sàn/ });
    if (xemTruoc.firstShopOfCompany) await expect(day).toBeDisabled();
    await page.getByRole('radio', { name: /Kiểm kê lại trước/ }).click();
    await page.getByRole('button', { name: 'Tiếp', exact: true }).click();

    // Bước 3: mốc kéo đơn chỉ hiển thị; số ngày đổi trả chỉ hỏi khi capabilities.returnWindow = days
    await expect(page.locator('[data-testid=proposed-cutoff]')).toContainText(/\d{2}\/\d{2}\/\d{4}/);
    const soNgay = page.getByRole('spinbutton', { name: /Số ngày đổi trả/ });
    const hoiSoNgay = san.capabilities.returnWindow === 'days';
    // Sàn tự khoá đổi trả (TikTok: đơn sàn sang COMPLETED) thì không có ô, chỉ có câu giải thích
    await expect(soNgay).toHaveCount(hoiSoNgay ? 1 : 0);
    await expect(page.locator('[data-testid=return-window-note]')).toHaveCount(hoiSoNgay ? 0 : 1);
    if (hoiSoNgay) {
      await soNgay.fill('61');
      await page.getByRole('button', { name: 'Hoàn tất thiết lập', exact: true }).click();
      await thayChu(page, 'Số ngày đổi trả là số nguyên từ 1 đến 60');
      await soNgay.fill('7');
    }

    const luu = page.waitForResponse(laApi('POST', new RegExp(`/channel/shops/${ketQua.shop.id}/setup$`)));
    await page.getByRole('button', { name: 'Hoàn tất thiết lập', exact: true }).click();
    const resLuu = await luu;
    const body = resLuu.request().postDataJSON() as Record<string, unknown>;
    expect(body).not.toHaveProperty('orderCutoffAt');
    // §18.7.5: một quyết định cho mọi SKU trong suggestions, không gửi externalSkuIds
    expect(body).not.toHaveProperty('externalSkuIds');
    const seen = new Set<string>();
    const mongDoi = xemTruoc.suggestions.map((g) => {
      const variantId = g.variantId && !seen.has(g.variantId) ? g.variantId : null;
      if (variantId) seen.add(variantId);
      return { externalSkuId: g.externalSkuId, variantId };
    });
    expect(body.decisions).toEqual(mongDoi);
    expect(body.openingStock).toBe('stocktake');
    if (hoiSoNgay) expect(body.returnWindowDays).toBe(7);
    else expect(body).not.toHaveProperty('returnWindowDays');
    expect(resLuu.status()).toBe(200);

    // Xong thiết lập: ở lại bước "Bắt đầu chạy", đọc Shop.setup (§18.7.7) rồi mở gian hàng
    await expect.poll(() => duongDan(page)).toBe(`/c/${companyId}/channel/shops/${ketQua.shop.id}/setup`);
    const ketQuaLuu = (await resLuu.json()) as {
      shop: { openingStocktake: { documentId: string } | null; setup: { steps: { key: string }[] } | null };
    };
    if (ketQuaLuu.shop.setup) {
      await expect(page.locator('[data-testid=setup-progress] [data-step]')).toHaveCount(ketQuaLuu.shop.setup.steps.length);
    }
    await page.getByRole('link', { name: 'Mở gian hàng', exact: true }).click();
    await expect.poll(() => duongDan(page)).toBe(`/c/${companyId}/channel/shops/${ketQua.shop.id}`);
    // Còn phiếu kiểm kê đầu kỳ chưa ghi sổ thì có banner dẫn tới phiếu
    const banner = page.locator('[data-testid=opening-stocktake-banner]');
    if (ketQuaLuu.shop.openingStocktake) {
      await expect(banner.getByRole('link')).toHaveAttribute(
        'href',
        `/c/${companyId}/inventory/documents/${ketQuaLuu.shop.openingStocktake.documentId}`,
      );
    } else {
      await expect(banner).toHaveCount(0);
    }
  });
});

// Từ chối uỷ quyền không cần gian hàng thật: chỉ cần đăng nhập, không gọi callback của BE
test.describe('P3-BE · Từ chối uỷ quyền trên sàn', () => {
  test.skip(!EMAIL || !MAT_KHAU, 'Thiếu E2E_SAN_EMAIL hoặc E2E_SAN_PASSWORD');

  test('callback có error (TikTok code=null&error=auth_denied) thì báo từ chối, không gọi BE', async ({ page }) => {
    const companyId = await dangNhap(page);
    const platforms = page.waitForResponse(laApi('GET', /\/channel\/shops\/platforms$/));
    await page.goto(`/c/${companyId}/channel/shops`);
    await page.getByRole('button', { name: 'Thêm gian hàng', exact: true }).click();
    const san = canSan(((await (await platforms).json()) as { items: San[] }).items);

    const goiCallback: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && new RegExp(`/channel/shops/${PLATFORM}/callback$`).test(new URL(r.url()).pathname)) {
        goiCallback.push(r.url());
      }
    });
    await page.goto(
      `/channel/${PLATFORM}/callback?code=null&error=auth_denied&state=st-e2e&app_key=k&locale=vi-VN&shop_region=VN`,
    );
    const ketQua = page.locator('[data-outcome=declined]');
    await expect(ketQua).toContainText(`Bạn đã từ chối uỷ quyền trên ${san.name}`);
    await expect(ketQua.getByRole('button', { name: 'Thử lại', exact: true })).toBeVisible();
    expect(goiCallback).toEqual([]);
  });
});
