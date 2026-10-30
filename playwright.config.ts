import { defineConfig } from '@playwright/test';

/**
 * E2E nghiệm thu theo phase (FE#18–22, FE#69).
 * - `mock`: Vite dev + MSW, dữ liệu trong bộ nhớ trang nên mỗi test có bộ dữ liệu riêng, chạy song song.
 * - `be`: gọi BE thật (Vite với VITE_USE_MOCKS=false), dùng chung DB, test sau dựa vào trạng thái test trước:
 *   chạy lần lượt một worker. Dựng dữ liệu trước bằng `e2e/be/seed/`.
 * Playwright tự bật Vite; trên máy, nếu cổng 5173 đã có server thì dùng luôn server đó (nhóm `mock` cần server
 * bật mock). Đổi địa chỉ bằng PW_BASE_URL, vd chạy trên staging; khi đó không bật Vite.
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
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.PW_BASE_URL
    ? undefined
    : {
        command: 'pnpm exec vite --host 127.0.0.1 --port 5173 --strictPort',
        url: baseURL,
        // Biến môi trường thắng `.env.local`: máy dev hay đặt VITE_USE_MOCKS=false để gọi BE thật.
        // Chạy nhóm `be` thì đặt VITE_USE_MOCKS=false trước lệnh.
        env: { VITE_USE_MOCKS: process.env.VITE_USE_MOCKS ?? 'true' },
        reuseExistingServer: !process.env.CI,
        // Hiện log Vite trong CI: Vite tối ưu lại dependency thì nạp lại mọi trang đang mở, làm test đứt giữa chừng
        stdout: 'pipe',
        timeout: 120_000,
      },
  projects: [
    { name: 'mock', testDir: 'e2e/mock', fullyParallel: true },
    { name: 'be', testDir: 'e2e/be', testIgnore: 'seed/**', fullyParallel: false, workers: 1 },
  ],
});
