import { defineConfig } from '@playwright/test';

/**
 * E2E nghiệm thu theo phase (FE#18–22, FE#69).
 * FE không còn mock (Thành chốt 20/11/2026), chỉ còn project `be`: gọi BE thật, dùng chung DB, test sau dựa vào trạng
 * thái test trước nên chạy lần lượt một worker. Mỗi file tự đăng ký công ty giả qua API công khai (`e2e/be/congTyGia.ts`).
 * Playwright tự bật Vite; trên máy, nếu cổng 5173 đã có server thì dùng luôn server đó. Đổi địa chỉ bằng PW_BASE_URL,
 * vd chạy trên staging; khi đó không bật Vite.
 */
const baseURL = process.env.PW_BASE_URL ?? 'http://127.0.0.1:5173';

export default defineConfig({
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  expect: { timeout: 8000, toPass: { timeout: 8000 } },
  use: {
    baseURL,
    viewport: { width: 1366, height: 800 },
    // PW_NO_TRACE=1 (job e2e-be): repo public, artifact ai cũng tải được; trace, ảnh chụp chứa mã thử đăng ký (e2e/be/dangKy.ts)
    trace: process.env.PW_NO_TRACE ? 'off' : 'retain-on-failure',
    screenshot: process.env.PW_NO_TRACE ? 'off' : 'only-on-failure',
    // Tắt tự hiện hướng dẫn lần đầu (FE#132) để pop-up không che spec cũ; spec hướng dẫn đặt lại storageState rỗng
    storageState: {
      cookies: [],
      origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: 'commerio.guides', value: 'off' }] }],
    },
  },
  webServer: process.env.PW_BASE_URL
    ? undefined
    : {
        command: 'pnpm exec vite --host 127.0.0.1 --port 5173 --strictPort',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        // Hiện log Vite trong CI: Vite tối ưu lại dependency thì nạp lại mọi trang đang mở, làm test đứt giữa chừng
        stdout: 'pipe',
        timeout: 120_000,
      },
  projects: [
    { name: 'be', testDir: 'e2e/be', fullyParallel: false, workers: 1, teardown: 'be-don' },
    // Dọn công ty thử còn trong sổ sau project `be` (e2e/be/soCongTyThu.ts, Documents/21 mục 2.2)
    { name: 'be-don', testDir: 'e2e/be', testMatch: /don-cuoi-luot\.teardown\.ts/ },
  ],
});
