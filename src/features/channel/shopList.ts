import type { Shop } from '@/types/shop';
import { platformLabel } from './shopSchemas';

export function shopPlatformOptions(shops: readonly Shop[]) {
  return [...new Set(shops.map((s) => s.platform))].map((value) => ({
    value, label: platformLabel(value, shops.find((shop) => shop.platform === value)?.platformName),
  }));
}

/** Nhóm của thanh chọn trên bảng: tất cả, cần xử lý, đã ngắt */
export type ShopSegment = 'all' | 'needs_action' | 'disconnected';

/** Cần người dùng làm gì đó: mất quyền, chưa thiết lập, hoặc uỷ quyền sắp hết hạn (nhãn, không phải trạng thái) */
export function needsAction(shop: Shop) {
  return shop.status === 'needs_reauth' || shop.status === 'connecting' || (shop.status === 'active' && shop.tokenExpiringSoon);
}

function inSegment(shop: Shop, segment: ShopSegment) {
  if (segment === 'needs_action') return needsAction(shop);
  if (segment === 'disconnected') return shop.status === 'disconnected';
  return true;
}

/** Con số phân trang chỉ thuộc UI, không phải response BE. Giữ thứ tự BE trả. */
export function shopPage(shops: readonly Shop[], filters: {
  search: string; platform: string; segment: ShopSegment; page: number; pageSize: number;
}) {
  const search = filters.search.trim().toLowerCase();
  const items = shops.filter((s) =>
    (!search || s.shopName.toLowerCase().includes(search) || s.externalShopId.toLowerCase().includes(search)) &&
    (!filters.platform || s.platform === filters.platform) && inSegment(s, filters.segment),
  );
  const page = Math.min(filters.page, Math.max(1, Math.ceil(items.length / filters.pageSize)));
  return { items: items.slice((page - 1) * filters.pageSize, page * filters.pageSize), total: items.length, page };
}
