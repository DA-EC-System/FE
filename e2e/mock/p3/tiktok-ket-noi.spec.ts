// P3 · Kết nối và thiết lập gian hàng TikTok Shop (FE#198; commerio-backend#217; Documents/21 §18.4, §18.7)
// TikTok khác Lazada: tách kiện theo SKU, hết hạn trả khi đơn sàn hoàn tất (returnWindow = platform_status),
// từ chối uỷ quyền quay về callback với code=null&error=auth_denied, callback có thêm app_key, locale, shop_region.
import { type Page } from '@playwright/test';
import { dangNhap, duongDan, expect, menu, mockApi, test, thayChu, toast } from '../../fixtures';

const TIKTOK = 'TikTok Shop';

/** Mở hộp thêm gian hàng và chọn thẻ TikTok Shop */
const chonTikTok = async (page: Page) => {
  await page.getByRole('button', { name: 'Thêm gian hàng', exact: true }).click();
  const section = page.locator('[data-testid=connect-section]');
  await section.getByRole('button', { name: TIKTOK, exact: true }).click();
  return section;
};

const laCallback = (url: string) => /\/channel\/shops\/tiktok\/callback$/.test(new URL(url).pathname);

test.describe('P3 · Gian hàng TikTok Shop (FE#198)', () => {
  test.beforeEach(async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await menu(page, 'Kênh bán');
    await expect(page.locator('tbody tr[data-row-id]').first()).toBeAttached();
  });

  test('thẻ TikTok mở, có cả uỷ quyền và dán token theo methods', async ({ page }) => {
    const section = await chonTikTok(page);
    const the = section.locator('[data-platform=tiktok]');
    await expect(the).not.toHaveAttribute('aria-disabled', 'true');
    await expect(the).toContainText('Tách đơn theo SKU');
    await expect(the).toContainText('Hạn đổi trả do sàn báo');
    await expect(section.getByRole('radio')).toHaveCount(2);
    await expect(section.getByRole('radio', { name: /^Dán token/ })).toBeAttached();
  });

  test('uỷ quyền xong mở thiết lập; không hỏi số ngày đổi trả, gợi ý ghép có mã SKU sàn dạng số', async ({ page }) => {
    const section = await chonTikTok(page);
    await section.getByRole('button', { name: `Tiếp tục tới ${TIKTOK}`, exact: true }).click();
    await expect.poll(() => duongDan(page)).toBe('/mock-oauth/authorize');
    await thayChu(page, `${TIKTOK} · Uỷ quyền ứng dụng`);
    await page.getByLabel('Tên gian hàng', { exact: true }).fill('ABC TikTok Mới');
    await page.getByLabel('Mã gian hàng trên sàn', { exact: true }).fill('7495012345678901234');

    // Callback gửi đủ tham số sàn trả (kể cả tham số lạ của TikTok), trừ state
    const yeuCau = page.waitForRequest((r) => r.method() === 'POST' && laCallback(r.url()));
    await page.getByRole('button', { name: 'Đồng ý', exact: true }).click();
    const body = (await yeuCau).postDataJSON() as { state: string; params: Record<string, string> };
    expect(body.params).toMatchObject({ app_key: 'mock-tiktok-app-key', locale: 'vi-VN', shop_region: 'VN' });
    expect(body.params.code).toBeTruthy();
    expect(body.params).not.toHaveProperty('state');

    const ketQua = page.locator('[data-outcome=connected]');
    await expect(ketQua).toContainText('Đã nối ABC TikTok Mới');
    await ketQua.getByRole('button', { name: 'Thiết lập ngay', exact: true }).click();
    await expect.poll(() => duongDan(page)).toMatch(/\/channel\/shops\/[^/]+\/setup$/);

    // Bước 1: SKU trên TikTok có mã số dài; trùng SKU người bán thì có gợi ý
    const goiY = page.locator('[data-testid=setup-suggestions] [data-suggestion]');
    await expect(goiY).toHaveCount(4);
    for (const id of await goiY.evaluateAll((els) => els.map((e) => e.getAttribute('data-suggestion') ?? ''))) {
      expect(id).toMatch(/^\d{19}$/);
    }
    await expect(page.locator('[data-testid=setup-suggestions] [data-match=sku]')).toHaveCount(2);
    await page.getByRole('button', { name: 'Tiếp', exact: true }).click();
    await page.getByRole('button', { name: 'Tiếp', exact: true }).click();

    // Bước 3: TikTok tự khoá đổi trả khi đơn hoàn tất nên không có ô số ngày
    await expect(page.locator('[data-testid=proposed-cutoff]')).toContainText(/\d{2}\/\d{2}\/\d{4}/);
    await expect(page.getByRole('spinbutton', { name: /Số ngày đổi trả/ })).toHaveCount(0);
    await expect(page.locator('[data-testid=return-window-note]')).toHaveText(
      'TikTok Shop tự khoá đổi trả khi đơn hoàn tất, nên không cần đặt số ngày đổi trả.',
    );
    const luu = page.waitForRequest((r) => r.method() === 'POST' && /\/channel\/shops\/[^/]+\/setup$/.test(new URL(r.url()).pathname));
    await page.getByRole('button', { name: 'Hoàn tất thiết lập', exact: true }).click();
    expect((await luu).postDataJSON()).not.toHaveProperty('returnWindowDays');
    await toast(page, /ABC TikTok Mới đã sẵn sàng bán/);
  });

  test('từ chối uỷ quyền (code=null&error=auth_denied) thì báo rõ, không gọi BE, thử lại mở lại TikTok', async ({ page }) => {
    const goiCallback: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && laCallback(r.url())) goiCallback.push(r.url());
    });
    await mockApi(page, 'post', '/channel/shops/tiktok/callback', 500, { detail: 'Không được gọi callback' });

    const section = await chonTikTok(page);
    await section.getByRole('button', { name: `Tiếp tục tới ${TIKTOK}`, exact: true }).click();
    await page.getByRole('button', { name: 'Từ chối', exact: true }).click();
    const ketQua = page.locator('[data-outcome=declined]');
    await expect(ketQua).toContainText('Bạn đã từ chối uỷ quyền trên TikTok Shop');
    await expect(ketQua).not.toContainText('Không được gọi callback');
    const url = new URL(page.url());
    expect(url.searchParams.get('error')).toBe('auth_denied');
    expect(url.searchParams.get('code')).toBe('null');
    expect(goiCallback).toEqual([]);

    await ketQua.getByRole('button', { name: 'Thử lại', exact: true }).click();
    await expect.poll(() => duongDan(page)).toBe('/mock-oauth/authorize');
    await thayChu(page, `${TIKTOK} · Uỷ quyền ứng dụng`);
  });

  test('dán token TikTok trả shops[] và mở thiết lập', async ({ page }) => {
    const section = await chonTikTok(page);
    await section.getByRole('radio', { name: /^Dán token/ }).click();
    await section.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
    const form = page.locator('[data-testid=token-form]');
    await form.getByLabel('Access token', { exact: true }).fill('tt-token-abc123');
    await form.getByRole('button', { name: 'Kết nối', exact: true }).click();
    const ketQua = section.locator('[data-outcome=connected]');
    await ketQua.getByRole('button', { name: 'Thiết lập ngay', exact: true }).click();
    await expect.poll(() => duongDan(page)).toMatch(/\/channel\/shops\/[^/]+\/setup$/);
    await expect(page.locator('[data-testid=setup-suggestions] [data-suggestion]').first()).toHaveAttribute('data-suggestion', /^\d{19}$/);
  });
});
