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
import { emitRealtime } from './realtime';

export interface MarketplaceEventContext {
  companyId: string;
  /** Có khi sự kiện cần gian hàng */
  shop: MockShop | null;
  params: Record<string, string>;
}

export interface MarketplaceEventDef extends MarketplaceEventType {
  /** Đổi dữ liệu mock; trả câu mô tả kết quả, hoặc ném Error với câu báo khi không phát được */
  run(ctx: MarketplaceEventContext): string;
  /**
   * Sự kiện realtime phát sau khi chạy xong (FE#81). Bỏ trống: suy theo tiền tố của `type`;
   * `null`: `run` tự phát vì cần payload riêng.
   */
  realtime?: string | null;
}

/** Tiền tố sự kiện sàn → sự kiện realtime BE phát khi xử lý xong (commerio-backend#134) */
const REALTIME_BY_PREFIX: [prefix: string, type: string][] = [
  ['shop.', 'channel.shop_status_changed'],
  ['listing.', 'channel.listing_sync_changed'],
  ['order.', 'sales.order_status_changed'],
  ['package.', 'fulfillment.package_status_changed'],
  ['return.', 'sales.return_status_changed'],
];

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
  const realtime =
    def.realtime === undefined ? REALTIME_BY_PREFIX.find(([prefix]) => type.startsWith(prefix))?.[1] : def.realtime;
  if (realtime) emitRealtime(ctx.companyId, realtime);
  return { ok: true, entry };
}
