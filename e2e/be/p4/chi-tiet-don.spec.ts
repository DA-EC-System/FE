// P4 với BE thật · Chi tiết đơn theo kiện (FE#282, commerio-backend#236; FE#252), chỉ đọc:
//   1. Đơn Đã huỷ có dòng "Người huỷ" (người, Sàn hoặc Hệ thống), không trống.
//   2. Đơn chưa hoàn tất có câu lý do đủ ý, không hiện mã thô của BE (vd return_window).
// Chạy: PW_BASE_URL=<địa chỉ FE trỏ BE thật> pnpm e2e:be
// Tự bỏ qua trừ khi đặt:
//   E2E_SAN_EMAIL, E2E_SAN_PASSWORD  tài khoản CEO của công ty thử
//   E2E_SAN_CONG_TY                  (tuỳ chọn) tên công ty, mặc định "Commerio Test Sàn"
import { type Page, type Response } from '@playwright/test';
import { chu, duongDan, expect, test } from '../../fixtures';

const EMAIL = process.env.E2E_SAN_EMAIL ?? '';
const MAT_KHAU = process.env.E2E_SAN_PASSWORD ?? '';
const CONG_TY = process.env.E2E_SAN_CONG_TY ?? 'Commerio Test Sàn';
const UUID = '[0-9a-f-]{36}';

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

const apiGet = (r: Response, suffix: string) =>
  r.request().method() === 'GET' && r.request().resourceType() !== 'document' && new URL(r.url()).pathname.endsWith(suffix);

async function layAuth(page: Page, companyId: string): Promise<string> {
  const list = page.waitForResponse((r) => apiGet(r, '/sales/orders'));
  await page.goto(`/c/${companyId}/sales/orders`);
  return (await (await list).request().headerValue('authorization')) ?? '';
}

async function donDau(page: Page, headers: Record<string, string>, params: Record<string, string | number>) {
  const res = await page.request.get('/api/v1/sales/orders', { params: { pageSize: 20, ...params }, headers });
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { items: { id: string; completionBlocker?: string | null }[] }).items;
}

test.describe('P4-BE · Chi tiết đơn theo kiện (FE#282, FE#252)', () => {
  test.skip(!EMAIL || !MAT_KHAU, 'Thiếu E2E_SAN_EMAIL, E2E_SAN_PASSWORD');

  test('đơn Đã huỷ có Người huỷ', async ({ page }) => {
    const companyId = await dangNhap(page);
    const headers = { Authorization: await layAuth(page, companyId) };
    const don = (await donDau(page, headers, { status: 'cancelled' }))[0];
    test.skip(!don, 'Công ty thử chưa có đơn Đã huỷ');
    await page.goto(`/c/${companyId}/sales/orders/${don!.id}`);
    await expect(page.getByTestId('cancel-initiators')).not.toBeEmpty();
  });

  test('đơn chưa hoàn tất có câu lý do, không có mã thô', async ({ page }) => {
    const companyId = await dangNhap(page);
    const headers = { Authorization: await layAuth(page, companyId) };
    const don = (await donDau(page, headers, { status: 'processing' })).find((o) => o.completionBlocker);
    test.skip(!don, 'Công ty thử chưa có đơn Đang xử lý còn việc chưa xong');
    await page.goto(`/c/${companyId}/sales/orders/${don!.id}`);
    const blocker = page.getByTestId('completion-blocker');
    await expect(blocker).toContainText('Chưa hoàn thành:');
    await expect(blocker).not.toContainText(/[a-z]+_[a-z]+/);
  });
});
