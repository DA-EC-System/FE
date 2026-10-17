import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
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
    proxy: {
      '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
