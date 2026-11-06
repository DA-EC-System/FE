// P3 với BE thật · Kết nối gian hàng bằng token rồi thiết lập lần đầu (FE#163; Documents/21 §18.4, §18.6.2, §18.6.3)
// Cần commerio-backend#200 và #198 đã merge. Chạy: PW_BASE_URL=<địa chỉ FE trỏ BE thật> pnpm e2e:be
//
// Spec tạo gian hàng thật trên công ty thử nên tự bỏ qua trừ khi đặt đủ:
//   E2E_SAN_EMAIL, E2E_SAN_PASSWORD  tài khoản có quyền kết nối gian hàng ở công ty thử
//   E2E_SAN_ACCESS_TOKEN             access token sàn chấp nhận (sàn giả lập của BE nhận token bất kỳ)
//   E2E_SAN_BE200=1                  xác nhận BE đang chạy đã có commerio-backend#200 và #198
//   E2E_SAN_PLATFORM                 (tuỳ chọn) mã sàn, mặc định "mock"
//   E2E_SAN_CONG_TY                  (tuỳ chọn) tên công ty, mặc định "Commerio Test Sàn"
// Chạy xong gian hàng vẫn nối: ngắt tay ở trang Gian hàng nếu cần chạy lại từ đầu.
import { type Page } from '@playwright/test';
import { chu, duongDan, expect, test, thayChu } from '../../fixtures';

const EMAIL = process.env.E2E_SAN_EMAIL ?? '';
const MAT_KHAU = process.env.E2E_SAN_PASSWORD ?? '';
const TOKEN = process.env.E2E_SAN_ACCESS_TOKEN ?? '';
const PLATFORM = process.env.E2E_SAN_PLATFORM ?? 'mock';
const CONG_TY = process.env.E2E_SAN_CONG_TY ?? 'Commerio Test Sàn';
const DA_CO_BE = process.env.E2E_SAN_BE200 === '1';

const UUID = '[0-9a-f-]{36}';

interface KetQuaKetNoi {
  shop: { id: string; status: string; shopName: string };
  created: boolean;
  shops: { shop: { id: string; status: string } }[];
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

  test('dán token: một gian hàng mới mở wizard; thiết lập gửi đúng body, mốc kéo đơn chỉ hiển thị', async ({ page }) => {
    const companyId = await dangNhap(page);
    await page.goto(`/c/${companyId}/channel/shops`);

    // Hộp thêm gian hàng chỉ hiện nút theo `methods` của sàn
    const platforms = page.waitForResponse(laApi('GET', /\/channel\/shops\/platforms$/));
    await page.getByRole('button', { name: 'Thêm gian hàng', exact: true }).click();
    const danhSachSan = (await (await platforms).json()) as { items: { platform: string; name: string; methods?: string[] }[] };
    const san = danhSachSan.items.find((p) => p.platform === PLATFORM);
    test.skip(!san?.methods?.includes('token'), `Sàn ${PLATFORM} không cho dán token`);

    await page.getByRole('button', { name: `Dán token ${san!.name}`, exact: true }).click();
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

    const motShopMoi = ketQua.shops.length === 1 && ketQua.shop.status === 'connecting';
    if (!motShopMoi) {
      // Nhiều gian hàng hoặc gian hàng đã có: ở lại danh sách
      await expect.poll(() => duongDan(page)).toBe(`/c/${companyId}/channel/shops`);
      test.skip(true, 'Token không ra đúng một gian hàng mới đang thiết lập; ngắt gian hàng cũ rồi chạy lại để thử wizard');
      return;
    }

    const preview = page.waitForResponse(laApi('GET', new RegExp(`/channel/shops/${ketQua.shop.id}/setup$`)));
    await expect.poll(() => duongDan(page)).toBe(`/c/${companyId}/channel/shops/${ketQua.shop.id}/setup`);
    const xemTruoc = (await (await preview).json()) as { proposedCutoffAt: string; firstShopOfCompany: boolean };
    expect(typeof xemTruoc.proposedCutoffAt).toBe('string');
    expect(typeof xemTruoc.firstShopOfCompany).toBe('boolean');

    // Bước 1: ghép listing gợi ý (giữ mặc định)
    await page.getByRole('button', { name: 'Tiếp', exact: true }).click();

    // Bước 2: gian hàng đầu tiên của công ty thì không chọn được đẩy số Commerio
    const day = page.getByRole('radio', { name: /Lấy số Commerio đẩy lên sàn/ });
    if (xemTruoc.firstShopOfCompany) await expect(day).toBeDisabled();
    await page.getByRole('radio', { name: /Kiểm kê lại trước/ }).click();
    await page.getByRole('button', { name: 'Tiếp', exact: true }).click();

    // Bước 3: mốc kéo đơn chỉ hiển thị; số ngày đổi trả chỉ hỏi khi capabilities.returnWindow = days
    await expect(page.locator('[data-testid=proposed-cutoff]')).toContainText(/\d{2}\/\d{2}\/\d{4}/);
    const soNgay = page.getByRole('spinbutton', { name: /Số ngày đổi trả/ });
    const hoiSoNgay = (await soNgay.count()) > 0;
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
    expect(body.openingStock).toBe('stocktake');
    if (hoiSoNgay) expect(body.returnWindowDays).toBe(7);
    else expect(body).not.toHaveProperty('returnWindowDays');
    expect(resLuu.status()).toBe(200);

    // Xong thiết lập: về trang gian hàng; còn phiếu kiểm kê đầu kỳ chưa ghi sổ thì có banner dẫn tới phiếu
    await expect.poll(() => duongDan(page)).toBe(`/c/${companyId}/channel/shops/${ketQua.shop.id}`);
    const ketQuaLuu = (await resLuu.json()) as { shop: { openingStocktake: { documentId: string } | null } };
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
