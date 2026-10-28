/**
 * MSW handlers — mock toàn bộ API cho giai đoạn phát triển UI.
 * Tắt bằng VITE_USE_MOCKS=false khi backend thật sẵn sàng.
 *
 * Token mock dạng `mock.<accountId>.<companyId | ->.<ts>`: sau khi chọn công ty,
 * token gắn với công ty đó; các API của công ty đọc companyId từ token (như RLS ở BE).
 * Access token sống 15 phút (docs/21 A2). Refresh token nằm trong cookie `commerio_refresh`.
 * Mock ghi cookie bằng `document.cookie` vì: JS không đặt được cookie HttpOnly, còn header
 * Set-Cookie của MSW bị MSW lưu vào localStorage. BE thật đặt cookie HttpOnly bằng Set-Cookie.
 */

import { authHandlers } from './auth';
import { platformHandlers } from './platform';
import { identityHandlers } from './identity';
import { companySettingsHandlers } from './companySettings';
import { catalogHandlers } from './catalog';
import { pricingHandlers } from './pricing';
import { inventoryHandlers } from './inventory';
import { purchasingHandlers } from './purchasing';
import { shopHandlers } from './channel';
import { salesHandlers } from './sales';
import { paymentHandlers } from './payment';
import { fulfillmentHandlers } from './fulfillment';
import { financeHandlers } from './finance';
import { reportHandlers } from './report';
import { settlementHandlers } from './settlement';
import { devMarketplaceHandlers } from './devMarketplace';
import { taskHandlers } from './tasks';
import { notificationHandlers } from './notification';

export const handlers = [
  ...authHandlers,
  ...platformHandlers,
  ...identityHandlers,
  ...companySettingsHandlers,
  ...catalogHandlers,
  ...pricingHandlers,
  ...inventoryHandlers,
  ...purchasingHandlers,
  ...shopHandlers,
  ...salesHandlers,
  ...paymentHandlers,
  ...fulfillmentHandlers,
  ...financeHandlers,
  ...reportHandlers,
  ...settlementHandlers,
  ...devMarketplaceHandlers,
  ...taskHandlers,
  ...notificationHandlers,
];
