// P1 · BE chưa có route (404 "Không có đường dẫn ..."): báo "chưa mở", không hiện 0 hay bảng trống (FE#248)
import { type Page } from '@playwright/test';
import { dangNhap, duongDan, expect, test } from '../../fixtures';

/**
 * Cho các đường dẫn (khớp đuôi) trả 404 như BE khi chưa có route, ngay từ lần tải đầu.
 * Gắn handler đúng lúc `window.__msw` được gán, trước khi trang gọi API; giữ qua mọi lần gọi.
 */
async function routeChuaCo(page: Page, paths: string[]) {
  await page.addInitScript((list: string[]) => {
    let bridge: unknown;
    Object.defineProperty(window, '__msw', {
      configurable: true,
      get: () => bridge,
      set(value) {
        bridge = value;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { worker, http, HttpResponse } = value as any;
        for (const path of list) {
          worker.use(
            http.get(`*/api/v1${path}`, ({ request }: { request: Request }) =>
              HttpResponse.json(
                {
                  type: 'about:blank',
                  title: 'Not Found',
                  status: 404,
                  code: 'not_found',
                  detail: `Không có đường dẫn GET ${new URL(request.url).pathname}`,
                },
                { status: 404 },
              ),
            ),
          );
        }
      },
    });
  }, paths);
}

test.describe('P1 · Route chưa mở trên máy chủ', () => {
  test('/tasks chưa có: Tổng quan, danh sách việc và chuông không hiện 0', async ({ page }) => {
    await routeChuaCo(page, ['/tasks']);
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await expect(page.getByRole('heading', { level: 1, name: 'Tổng quan' })).toBeVisible();

    for (const key of ['overdue', 'due-soon']) {
      const the = page.locator(`[data-kpi="${key}"]`);
      await expect(the).toContainText('Chưa tải được việc cần làm');
      await expect(the).toContainText('—');
      await expect(the).not.toContainText(/\b0\b/);
    }

    await expect(page.getByTestId('task-list-error')).toContainText('Chưa tải được việc cần làm');
    await expect(page.getByTestId('task-list-error')).toContainText('Chức năng này chưa mở trên máy chủ');
    await expect(page.getByText('Không có việc nào tới hạn.')).toHaveCount(0);

    const chuong = page.getByTestId('task-bell');
    await expect(chuong).toHaveAttribute('aria-label', 'Việc cần làm: chưa tải được');
    await chuong.click();
    await expect(page.getByTestId('task-bell-error')).toContainText('Chưa tải được việc cần làm');
    await expect(page.getByTestId('task-bell-error')).toContainText('Chức năng này chưa mở trên máy chủ');
  });

  test('giá mới chờ duyệt chưa có: báo chưa mở, không hiện bảng trống', async ({ page }) => {
    await routeChuaCo(page, ['/channel/listings/pending-prices']);
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await page.goto(`${duongDan(page).match(/^\/c\/[^/]+/)![0]}/channel/pending-prices`);
    await expect(page.getByRole('heading', { level: 1, name: 'Giá mới chờ duyệt' })).toBeVisible();
    await expect(page.getByTestId('route-missing')).toContainText(
      'Tính năng duyệt giá mới chưa mở trên máy chủ',
    );
    await expect(page.locator('table')).toHaveCount(0);
    await expect(page.getByText('Không có giá mới chờ duyệt')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Thử lại' })).toHaveCount(0);
  });
});
