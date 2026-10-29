import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  // Staging có bản mock ở /mock/ (Dockerfile, BASE_PATH); mặc định chạy ở gốc.
  base: process.env.BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    open: false,
    watch: {
      usePolling: true,
      interval: 300,
    },
    // Chạy với backend thật (VITE_USE_MOCKS=false): FE và API cùng origin như sau Caddy (V38),
    // để cookie refresh SameSite=Strict được gửi kèm. Khi bật mock, MSW chặn request trước proxy.
    // Stream SSE do tiến trình realtime phục vụ (Documents/21 §13.1): phải đứng trước dòng /api.
    proxy: {
      '/api/v1/notification/stream': process.env.REALTIME_PROXY_TARGET ?? 'http://localhost:3002',
      '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
    },
  },
  // Vitest chỉ chạy unit test trong src; e2e/ là spec Playwright (pnpm e2e)
  test: { exclude: [...configDefaults.exclude, 'e2e/**'] },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
