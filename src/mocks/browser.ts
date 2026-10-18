/**
 * Khởi tạo MSW service worker cho browser.
 * Import và gọi `worker.start()` trong main.tsx khi VITE_USE_MOCKS=true.
 */

import { http, HttpResponse } from 'msw';
import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);

// E2E Cypress dùng để giả lập phản hồi khó tạo bằng dữ liệu (409, 422...), xem cypress/support/commands.ts
if (import.meta.env.DEV) {
  Object.assign(window, { __msw: { worker, http, HttpResponse } });
}
