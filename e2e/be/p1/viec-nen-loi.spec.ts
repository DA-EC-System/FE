// P1 với BE thật · Việc nền lỗi (FE#145; commerio-backend#102, Documents/21 §14.5)
// Không dùng mockApi. Tự đăng ký công ty mới nên chạy lại được; công ty mới chưa có việc lỗi nên chỉ đọc, không chạy lại.
import { duongDan, expect, menu, test } from '../../fixtures';

const RUN = Date.now().toString().slice(-7);
const MAT_KHAU = 'matkhau123';
const EMAIL = `ceo.job.${RUN}@commerio.test`;

test.describe('P1 · Việc nền lỗi (BE thật)', () => {
  test.beforeAll(async ({ playwright }) => {
    const api = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
    const res = await api.post('/api/v1/identity/register', {
      data: {
        company: { name: `Công ty Job ${RUN}`, taxCode: `04${RUN}1` },
        ceo: { fullName: 'CEO Việc nền', email: EMAIL, password: MAT_KHAU },
        optionalModules: [],
      },
    });
    expect(res.status()).toBe(201);
    await api.dispose();
  });

  test('CEO mở "Việc nền lỗi": GET /platform/jobs/dead trả 200, công ty mới thì báo rỗng', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name=email]').fill(EMAIL);
    await page.locator('input[name=password]').fill(MAT_KHAU);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page.getByTestId('nav-user')).toBeVisible();

    const ds = page.waitForResponse((r) => r.url().includes('/api/v1/platform/jobs/dead') && r.request().method() === 'GET');
    await menu(page, 'Việc nền lỗi');
    const res = await ds;
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ items: [], total: 0 });
    expect(duongDan(page)).toMatch(/\/admin\/dead-jobs$/);
    await expect(page.locator('tbody')).toContainText('Không có việc lỗi');
  });
});
