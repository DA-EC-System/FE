// P3 với BE thật · Ngắt gian hàng còn đơn chưa xong (FE#158; Documents/21 §18.6.1, commerio-backend#207)
// Chạy trên staging, công ty thử "Commerio Test Sàn": PW_BASE_URL=https://116-118-6-7.sslip.io pnpm e2e:be
//
// CẢNH BÁO: BE chưa có commerio-backend#207 thì bấm ngắt sẽ NGẮT THẬT gian hàng dùng chung. Spec tự bỏ qua trừ khi đặt đủ:
//   E2E_SAN_EMAIL, E2E_SAN_PASSWORD  tài khoản có quyền ngắt gian hàng ở công ty thử
//   E2E_SAN_SHOP_ID                  gian hàng còn đơn chưa completed hoặc cancelled
//   E2E_SAN_BE207=1                  xác nhận BE đang chạy đã có commerio-backend#207 (trả 409 shop_has_open_orders)
//   E2E_SAN_CONG_TY                  (tuỳ chọn) tên công ty, mặc định "Commerio Test Sàn"
import { type Page } from '@playwright/test';
import { chu, duongDan, expect, test, thayChu } from '../../fixtures';

const EMAIL = process.env.E2E_SAN_EMAIL ?? '';
const MAT_KHAU = process.env.E2E_SAN_PASSWORD ?? '';
const SHOP_ID = process.env.E2E_SAN_SHOP_ID ?? '';
const CONG_TY = process.env.E2E_SAN_CONG_TY ?? 'Commerio Test Sàn';
const DA_CO_BE207 = process.env.E2E_SAN_BE207 === '1';

const UUID = '[0-9a-f-]{36}';

/** Đăng nhập, chọn công ty thử, trả companyId lấy từ URL */
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

/** Tổng số đơn của gian hàng ở một trạng thái, đọc từ GET /sales/orders mà trang Đơn bán gọi */
async function soDon(page: Page, companyId: string, status: 'unpaid' | 'processing'): Promise<number> {
  const res = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname.endsWith('/api/v1/sales/orders') &&
      new URL(r.url()).searchParams.get('shopId') === SHOP_ID &&
      new URL(r.url()).searchParams.get('status') === status,
  );
  await page.goto(`/c/${companyId}/sales/orders?shopId=${SHOP_ID}&status=${status}`);
  return ((await (await res).json()) as { total: number }).total;
}

test.describe('P3-BE · Ngắt gian hàng còn đơn chưa xong (§18.6.1)', () => {
  test.skip(!EMAIL || !MAT_KHAU || !SHOP_ID, 'Thiếu E2E_SAN_EMAIL, E2E_SAN_PASSWORD hoặc E2E_SAN_SHOP_ID');
  test.skip(!DA_CO_BE207, 'Chưa xác nhận BE có commerio-backend#207 (E2E_SAN_BE207=1): chạy sẽ ngắt thật gian hàng');

  test('ngắt gian hàng còn đơn thì báo "Còn N đơn chưa xong" kèm link danh sách đơn, gian hàng không bị ngắt', async ({ page }) => {
    const companyId = await dangNhap(page);

    // Chốt chặn thứ hai: gian hàng phải còn đơn chưa xong, không thì lần bấm ngắt sẽ thành công thật
    const conDon = (await soDon(page, companyId, 'unpaid')) + (await soDon(page, companyId, 'processing'));
    test.skip(conDon === 0, `Gian hàng ${SHOP_ID} không còn đơn chưa xong, bỏ qua để không ngắt thật`);

    await page.goto(`/c/${companyId}/channel/shops`);
    const dong = page.locator(`tbody tr[data-row-id="${SHOP_ID}"]`);
    const trangThai = dong.locator('[data-testid=shop-status]');
    const truoc = (await trangThai.textContent())?.trim();
    expect(truoc).not.toBe('Đã ngắt');

    const disconnect = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith(`/channel/shops/${SHOP_ID}/disconnect`),
    );
    // Ngắt từ menu "..." của dòng, gõ NGAT để xác nhận
    const moNgat = async () => {
      await dong.getByRole('button', { name: /^Thao tác khác với / }).click();
      await page.getByRole('menuitem', { name: 'Ngắt kết nối', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel(/để xác nhận/).fill('NGAT');
      await dialog.getByRole('button', { name: 'Ngắt kết nối', exact: true }).click();
    };
    await moNgat();
    const res = await disconnect;
    expect(res.status()).toBe(409);
    const body = (await res.json()) as {
      code?: string;
      openOrders?: number;
      orders?: { id: string; code: string; externalOrderId: string | null }[];
    };
    expect(body.code).toBe('shop_has_open_orders');
    expect(body.openOrders).toBeGreaterThanOrEqual(1);
    // §18.7: mỗi đơn có id, code, externalOrderId; dòng đầu mở đúng đơn
    const blockedRows = page.locator('[data-testid=disconnect-blocked] tbody tr[data-order-id]');
    if (body.orders?.length) {
      expect(Object.keys(body.orders[0]).sort()).toEqual(expect.arrayContaining(['code', 'externalOrderId', 'id']));
      await expect(blockedRows.first().getByRole('link', { name: body.orders[0].code, exact: true })).toHaveAttribute(
        'href',
        `/c/${companyId}/sales/orders/${body.orders[0].id}`,
      );
    }

    const blocked = page.locator('[data-testid=disconnect-blocked]');
    await thayChu(blocked, `Còn ${body.openOrders} đơn chưa xong. Đợi các đơn hoàn tất hoặc huỷ rồi ngắt.`);
    const link = blocked.getByRole('link', { name: 'Mở đơn bán', exact: true });
    await expect(link).toHaveAttribute('href', `/c/${companyId}/sales/orders?shopId=${SHOP_ID}`);
    await blocked.getByRole('button', { name: 'Đóng', exact: true }).first().click();
    await expect(trangThai).toHaveText(truoc ?? '');

    // Link mở trang Đơn bán lọc theo gian hàng
    await moNgat();
    await link.click();
    await expect.poll(() => new URL(page.url()).searchParams.get('shopId')).toBe(SHOP_ID);
    await expect(page.getByRole('combobox', { name: 'Gian hàng', exact: true })).toBeVisible();
  });
});
