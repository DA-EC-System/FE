/**
 * Khởi tạo MSW service worker cho browser.
 * Import và gọi `worker.start()` trong main.tsx khi VITE_USE_MOCKS=true.
 */

import { http, HttpResponse } from 'msw';
import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
import { db } from './db';
import { fireMarketplaceEvent } from './engine/marketplace';

export const worker = setupWorker(...handlers);

// E2E Cypress dùng để giả lập phản hồi khó tạo bằng dữ liệu (409, 422...), xem cypress/support/commands.ts
// `fire` phát sự kiện sàn giả lập mà không qua trang sàn giả lập (trang đó tự làm mới mọi query),
// để kiểm màn hình tự cập nhật nhờ realtime (FE#81).
if (import.meta.env.DEV) {
  const fire = (companyId: string, type: string, shopId?: string, params: Record<string, string> = {}) =>
    fireMarketplaceEvent(type, {
      companyId,
      shop: db.shops.find((s) => s.id === shopId && s.companyId === companyId) ?? null,
      params,
    });
  Object.assign(window, { __msw: { worker, http, HttpResponse, fire } });
}
