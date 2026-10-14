/**
 * Khởi tạo MSW service worker cho browser.
 * Import và gọi `worker.start()` trong main.tsx khi VITE_USE_MOCKS=true.
 */

import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);
