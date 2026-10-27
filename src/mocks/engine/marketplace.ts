/**
 * Sàn giả lập: phát sự kiện mà sàn thật đẩy về (webhook Shopee/Lazada/Shopify, push TikTok)
 * để trình bày các luồng do sàn khởi phát khi chưa nối sàn thật. Chỉ chạy với mock.
 *
 * Mỗi phân hệ tự đăng ký sự kiện của mình bằng `registerMarketplaceEvent` trong file handler;
 * trang dev /c/:companyId/dev/marketplace liệt kê và bấm phát.
 */

import type { MockShop } from '../db';
import type { Marketplace } from '@/types/shop';
import type { MarketplaceEventLog, MarketplaceEventType } from '@/types/devMarketplace';

export interface MarketplaceEventContext {
  companyId: string;
  /** Có khi sự kiện cần gian hàng */
  shop: MockShop | null;
  params: Record<string, string>;
}

export interface MarketplaceEventDef extends MarketplaceEventType {
  /** Đổi dữ liệu mock; trả câu mô tả kết quả, hoặc ném Error với câu báo khi không phát được */
  run(ctx: MarketplaceEventContext): string;
}

const registry = new Map<string, MarketplaceEventDef>();
const log: MarketplaceEventLog[] = [];
let seq = 0;

export function registerMarketplaceEvent(def: MarketplaceEventDef) {
  registry.set(def.type, def);
}

export function marketplaceEventTypes(): MarketplaceEventType[] {
  return [...registry.values()].map(({ run: _run, ...type }) => type);
}

export function marketplaceEventLog(companyId: string) {
  return log.filter((e) => e.companyId === companyId);
}

export function fireMarketplaceEvent(
  type: string,
  ctx: MarketplaceEventContext,
): { ok: true; entry: MarketplaceEventLog } | { ok: false; message: string } {
  const def = registry.get(type);
  if (!def) return { ok: false, message: 'Không có loại sự kiện này' };
  if (def.needsShop && !ctx.shop) return { ok: false, message: 'Chọn gian hàng' };
  if (ctx.shop && def.platforms && !def.platforms.includes(ctx.shop.platform as Marketplace)) {
    return { ok: false, message: 'Sàn của gian hàng không có sự kiện này' };
  }
  let message: string;
  try {
    message = def.run(ctx);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
  const entry: MarketplaceEventLog = {
    id: `mev-${++seq}`,
    at: new Date().toISOString(),
    companyId: ctx.companyId,
    type,
    label: def.label,
    shopId: ctx.shop?.id ?? null,
    message,
  };
  log.unshift(entry);
  return { ok: true, entry };
}
