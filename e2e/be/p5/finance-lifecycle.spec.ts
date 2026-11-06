// D4.2–D4.4: tạo công ty giả riêng qua API công khai (e2e/be/congTyGia.ts), không cần seed SQL. Một register, một login.
import { expect, test } from '@playwright/test';
import { taoCongTyGia } from '../congTyGia';

test('BE thật: cấu hình nháp → chạy thử → gửi → tự duyệt; danh sách tiền đúng hợp đồng', async ({ browser }) => {
  const { page, api, companyId, dispose } = await taoCongTyGia(browser, { ten: 'finance', optionalModules: ['channel'] });
  await page.goto(`/c/${companyId}/finance/configs`);
  await page.getByRole('button', { name: 'Soạn phiên bản', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Loại cấu hình', { exact: true }).selectOption('min_margin');
  await dialog.getByLabel('Biên tối thiểu (%)', { exact: true }).fill('10');
  await dialog.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
  await page.getByRole('button', { name: 'Chạy thử', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Kết quả chạy thử', exact: true })).toBeVisible();
  for (const name of ['Gửi duyệt', 'Duyệt']) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name, exact: true }).click();
  }
  await expect(page.locator('[data-status=active]').first()).toBeVisible();
  await expect(page.getByText('Tự duyệt', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-status=active]').first()).toBeVisible();

  for (const path of ['payments', 'settlement-runs', 'bank-matching']) {
    const response = await api.get(`/api/v1/finance/${path}`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  }
  await page.goto(`/c/${companyId}/finance/settlements`);
  await expect(page.getByText('Chưa có trạng thái tiền', { exact: true })).toBeVisible();
  await dispose();
});
