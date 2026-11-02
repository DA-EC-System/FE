// D4.2–D4.4: tạo công ty giả riêng qua API công khai, không cần seed SQL.
import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';

test('BE thật: cấu hình nháp → chạy thử → gửi → tự duyệt; danh sách tiền đúng hợp đồng', async ({ page, request }) => {
  const suffix = randomUUID().replaceAll('-', '');
  const taxDigits = suffix.split('').map((char) => Number.parseInt(char, 16) % 10).join('');
  const email = `finance-${suffix}@example.test`;
  const password = `Demo!${suffix}aA1`;
  const register = await request.post('/api/v1/identity/register', { data: {
    company: { name: `Công ty giả kiểm thử D4 ${suffix}`, taxCode: `${taxDigits.slice(0, 10)}-${taxDigits.slice(10, 13)}` },
    ceo: { fullName: 'CEO kiểm thử giả', email, password }, optionalModules: ['channel'], assistantDataConsent: false,
  } });
  expect(register.status(), await register.text()).toBe(201);
  const { companyId } = await register.json();
  await page.goto('/login');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/c/${companyId}`));
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

  const login = await request.post('/api/v1/identity/login', { data: { email, password } });
  const identity = await login.json();
  const selected = await request.post('/api/v1/identity/select-company', {
    headers: { Authorization: `Bearer ${identity.accessToken}` }, data: { companyId },
  });
  const { accessToken } = await selected.json();
  for (const path of ['payments', 'settlement-runs', 'bank-matching']) {
    const response = await request.get(`/api/v1/finance/${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  }
  await page.goto(`/c/${companyId}/finance/settlements`);
  await expect(page.getByText('Chưa có trạng thái tiền', { exact: true })).toBeVisible();
});
