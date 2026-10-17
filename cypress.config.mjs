import { defineConfig } from 'cypress';

// Dùng .mjs vì package "type": "module" làm ts-node của Cypress lỗi khi đọc file .ts
/**
 * E2E nghiệm thu theo phase (FE#18–22).
 * Mặc định chạy với Vite dev + MSW: `pnpm dev` rồi `pnpm e2e`.
* Đổi địa chỉ bằng biến CYPRESS_BASE_URL, vd chạy trên staging.
 */
export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    viewportWidth: 1366,
    viewportHeight: 800,
    defaultCommandTimeout: 8000,
    video: false,
  },
});
