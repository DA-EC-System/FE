import type { ShopReadiness } from '@/types/blocker';
import { platformLabel } from './shopSchemas';

/** Trạng thái một gian hàng trên rail: đăng được, đã đăng mọi SKU, hay còn mục chặn */
export type ShopState = 'ready' | 'listed' | 'blocked';

export function shopState(s: ShopReadiness): ShopState {
  if (s.status === 'ready') return 'ready';
  if (s.counts.ready === 0 && s.counts.blocked === 0 && s.counts.listed > 0) return 'listed';
  return 'blocked';
}

/** Số mục còn thiếu của một gian hàng: mỗi phần tử `blockers` một mục (21 §18.10), đăng được thì 0 */
export const shopMissing = (s: ShopReadiness) => (shopState(s) === 'blocked' ? s.blockers.length : 0);

/**
 * Số mục của một sàn cho nhãn tab và bước 1: gian hàng ít mục nhất của sàn (một gian hàng thì đúng số trên rail).
 * null khi sàn không có gian hàng nào trong readiness.
 */
export function platformMissing(items: readonly ShopReadiness[] | undefined, platform: string): number | null {
  const shops = (items ?? []).filter((s) => s.platform === platform);
  if (!shops.length) return null;
  return Math.min(...shops.map(shopMissing));
}

/** Gian hàng đầu của sàn có ít mục nhất: mục chặn của gian hàng này hiện ở tab sàn */
export function platformShop(items: readonly ShopReadiness[] | undefined, platform: string): ShopReadiness | null {
  const shops = (items ?? []).filter((s) => s.platform === platform);
  if (!shops.length) return null;
  return shops.reduce((a, b) => (shopMissing(b) < shopMissing(a) ? b : a));
}

/** Tên gian hàng kèm sàn, vd "Đùi Gà Store (Lazada)" */
export const shopTitle = (s: Pick<ShopReadiness, 'shopName' | 'platform'>) => `${s.shopName} (${platformLabel(s.platform)})`;

/**
 * Lý do khoá "Đăng sản phẩm" theo readiness: null khi có gian hàng đăng được, hoặc chưa có gian hàng nào (trang đăng tự
 * hướng dẫn kết nối), hoặc mọi gian hàng đã đăng đủ.
 */
export function readinessBlocker(items: readonly ShopReadiness[] | undefined): string | null {
  if (!items?.length) return null;
  const states = items.map(shopState);
  if (states.includes('ready') || states.every((s) => s === 'listed')) return null;
  const parts = items.filter((s) => shopState(s) === 'blocked').map((s) => `${shopTitle(s)} còn ${s.blockers.length} mục`);
  return `Chưa gian hàng nào đăng được: ${parts.join(', ')}`;
}
