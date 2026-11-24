// P3 với BE thật · Tên hiển thị gian hàng và lần đơn về gần nhất (FE#464, commerio-backend#565)
// Chỉ chạy trên BE local: gian hàng được chèn thẳng vào DB (máy local không có sàn để kết nối). Tự bỏ qua trừ khi đặt:
//   E2E_PG_CONTAINER   tên container Postgres của BE local, ví dụ commerio-postgres-1
//   E2E_PG_DB          tên DB mà BE local đang dùng
//   E2E_PG_USER        (tuỳ chọn) mặc định commerio
// KHÔNG đặt các biến này khi chạy với staging.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { type Page, expect, test } from '@playwright/test';
import { type CongTyGia, taoCongTyGia } from '../congTyGia';

const CONTAINER = process.env.E2E_PG_CONTAINER ?? '';
const DB = process.env.E2E_PG_DB ?? '';
const USER = process.env.E2E_PG_USER ?? 'commerio';

test.describe.configure({ mode: 'serial' });
test.skip(!CONTAINER || !DB, 'Cần E2E_PG_CONTAINER, E2E_PG_DB (BE local)');

const TEN_SAN = `SANDBOX_VN_${randomUUID().slice(0, 8).toUpperCase()}`;
const TEN_RIENG = 'Áo thun ABC (Lazada)';

let cty: CongTyGia;
let page: Page;
let shopId: string;

const sql = (q: string) =>
  execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', USER, '-d', DB, '-tAq', '-v', 'ON_ERROR_STOP=1'], {
    input: q,
    encoding: 'utf8',
  }).trim();

type ShopRes = { id: string; version: number; shopName: string; displayName: string | null };

test.beforeAll(async ({ browser }) => {
  cty = await taoCongTyGia(browser, {
    ten: 'tenshop',
    truocDangNhap: (companyId) => {
      // Gian hàng đã thiết lập xong; mới kéo đơn còn mở lúc thiết lập (open_orders_pulled_at), chưa có lượt kéo đơn định kỳ
      shopId = sql(`
        INSERT INTO channel.shops (company_id, platform, external_shop_id, shop_name, status, order_cutoff_at, open_orders_pulled_at)
        VALUES ('${companyId}', 'lazada', '${TEN_SAN}', '${TEN_SAN}', 'active', now() - interval '2 hours', now() - interval '1 hour')
        RETURNING id;`);
    },
  });
  page = cty.page;
  expect(shopId).toMatch(/^[0-9a-f-]{36}$/);
});

test.afterAll(async () => {
  if (shopId) sql(`DELETE FROM channel.shops WHERE id = '${shopId}';`);
  await cty?.dispose();
});

const doc = async () => {
  const res = await cty.api.get(`/api/v1/channel/shops/${shopId}`);
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as ShopRes;
};

test('lần đơn về gần nhất lấy cả lượt kéo đơn còn mở; đặt tên hiển thị rồi bỏ để dùng lại tên trên sàn', async () => {
  await page.goto(`/c/${cty.companyId}/channel/shops`);
  const dong = page.getByRole('row').filter({ hasText: TEN_SAN });
  await expect(dong.getByTestId('shop-display-name')).toHaveText(TEN_SAN);
  const keo = dong.getByTestId('shop-last-order-pull');
  await expect(keo).toContainText('Đơn còn mở lúc thiết lập');
  await expect(keo).not.toContainText('Chưa đồng bộ');

  // Đặt tên hiển thị
  await dong.getByRole('button', { name: `Thao tác khác với ${TEN_SAN}` }).click();
  await page.getByRole('menuitem', { name: 'Đổi tên hiển thị' }).click();
  const hop = page.getByRole('dialog', { name: 'Đổi tên hiển thị' });
  const o = hop.getByRole('textbox', { name: 'Tên hiển thị' });
  await expect(o).toHaveAccessibleDescription(/Tối đa 60 ký tự/);
  await o.fill('x'.repeat(61));
  await hop.getByRole('button', { name: 'Lưu' }).click();
  await expect(o).toHaveAttribute('aria-invalid', 'true');
  await expect(o).toHaveAccessibleDescription(/Tên hiển thị tối đa 60 ký tự/);
  await expect(hop.locator('[role="alert"]')).toHaveCount(0);
  expect((await doc()).displayName).toBeNull();

  await o.fill(`  ${TEN_RIENG}  `);
  await hop.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByText(`Đã đổi tên hiển thị thành ${TEN_RIENG}`)).toBeVisible();
  await expect(hop).toBeHidden();
  expect((await doc()).displayName).toBe(TEN_RIENG);

  const dongMoi = page.getByRole('row').filter({ hasText: TEN_RIENG });
  await expect(dongMoi.getByTestId('shop-display-name')).toHaveText(TEN_RIENG);
  // Dòng phụ vẫn giữ tên trên sàn để tra cứu; ô tìm kiếm khớp cả hai tên
  await expect(dongMoi).toContainText(TEN_SAN);
  const nut = dongMoi.getByRole('button', { name: `Thao tác khác với ${TEN_RIENG}` });
  await expect(nut).toBeVisible();

  // Để trống: bỏ tên riêng, hiện lại tên trên sàn
  await nut.click();
  await page.getByRole('menuitem', { name: 'Đổi tên hiển thị' }).click();
  await expect(o).toHaveValue(TEN_RIENG);
  await o.fill('');
  await hop.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByText(`Đã dùng lại tên trên sàn ${TEN_SAN}`)).toBeVisible();
  expect((await doc()).displayName).toBeNull();
  await expect(dong.getByTestId('shop-display-name')).toHaveText(TEN_SAN);
});
