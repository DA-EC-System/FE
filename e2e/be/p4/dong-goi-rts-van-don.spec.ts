import { expect, test } from '@playwright/test';

// Kiểu tối thiểu của phản hồi BE (Documents/21 §19.2). Không import `src/types`: tsconfig.e2e.json không có alias `@/`.
interface PickList {
  items: { variantId: string | null; sku: string; quantity: number }[];
  packageCount: number;
  truncated: boolean;
}
interface Package {
  status: string;
  platformPackageCode: string | null;
}

// P4 với BE cục bộ trỏ sàn giả lập Lazada (commerio-backend scripts/lazada-mock, kịch bản giao-thanh-cong). Đơn chỉ vào
// từ sàn đã kết nối nên công ty giả của e2e/be/congTyGia.ts không có kiện; cần chuẩn bị tay một kiện `reserved` của đơn
// sàn giả lập rồi đặt E2E_PACKING_EMAIL, E2E_PACKING_PASSWORD, E2E_PACKING_COMPANY_ID, E2E_PACKING_CODE. Thiếu thì bỏ qua.
const email = process.env.E2E_PACKING_EMAIL ?? '';
const password = process.env.E2E_PACKING_PASSWORD ?? '';
const companyId = process.env.E2E_PACKING_COMPANY_ID ?? '';
const packageCode = process.env.E2E_PACKING_CODE ?? '';

test('P4-BE · nhặt hàng, quét đóng gói, báo sẵn sàng và in vận đơn Lazada', async ({ page, baseURL }) => {
  test.skip(!email || !password || !companyId || !packageCode, 'Cần tài khoản và kiện thử của Lazada giả lập');
  test.skip(!baseURL || new URL(baseURL).hostname !== '127.0.0.1', 'Luồng ghi này chạy trên BE cục bộ');
  await page.goto('/login');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/c/${companyId}(?:/|$)`));

  await page.goto(`/c/${companyId}/fulfillment/packages`);
  await page.getByRole('checkbox', { name: `Chọn ${packageCode}`, exact: true }).click();
  const pickResponse = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/fulfillment/pick-list'));
  await page.getByRole('button', { name: 'Danh sách nhặt (1 kiện)', exact: true }).click();
  const picked = await pickResponse;
  expect(picked.status()).toBe(200);
  const list: PickList = await picked.json();
  expect(list).toMatchObject({ packageCount: 1, truncated: false });
  expect(list.items.length).toBeGreaterThan(0);
  const pickTable = page.getByTestId('pick-list');
  await expect(pickTable.locator('tbody tr')).toHaveCount(list.items.length);

  await page.locator('tbody tr[data-row-id]').filter({ hasText: packageCode }).click();
  await page.getByTestId('package-actions').getByRole('button', { name: 'Đóng gói', exact: true }).click();
  const input = page.getByLabel('Quét SKU');
  for (const line of list.items.filter((line) => line.variantId)) {
    for (let i = 0; i < line.quantity; i++) {
      await input.fill(line.sku);
      await input.press('Enter');
    }
  }
  const packResponse = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/pack'));
  await page.getByRole('button', { name: 'Đóng gói', exact: true }).click();
  const pack = await packResponse;
  expect(pack.status()).toBe(200);
  const pkg: Package = await pack.json();
  expect(pkg).toMatchObject({ status: 'packed', platformPackageCode: 'FP600000000000001' });

  const readyResponse = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/ready'));
  await page.getByTestId('package-actions').getByRole('button', { name: 'Báo sàn sẵn sàng', exact: true }).click();
  const ready = await readyResponse;
  expect(ready.status()).toBe(200);
  expect(await ready.json()).toMatchObject({ status: 'awaiting_pickup' });

  await page.goto(`/c/${companyId}/fulfillment/packages?tab=awaiting_pickup`);
  await page.getByRole('checkbox', { name: `Chọn ${packageCode}`, exact: true }).click();
  await page.evaluate(() => { window.open = () => null; });
  const pdfResponse = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/fulfillment/packages/documents'));
  await page.getByRole('button', { name: 'In vận đơn (1)', exact: true }).click();
  const pdf = await pdfResponse;
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
});
