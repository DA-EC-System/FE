import type { Shop } from '@/types/shop';
import { platformLabel } from './shopSchemas';

export function shopPlatformOptions(shops: readonly Shop[]) {
  return [...new Set(shops.map((s) => s.platform))].map((value) => ({
    value, label: platformLabel(value, shops.find((shop) => shop.platform === value)?.platformName),
  }));
}

/**
 * Tên gian hàng cho người đọc: tên người dùng đặt, không có thì tên trên sàn (commerio-backend#565, FE#464).
 * Tên trên sàn có khi chỉ là mã thô (TikTok sandbox `SANDBOX_VN…`), nên chỗ nào hiện gian hàng cũng đi qua đây
 */
export function shopDisplayName(shop: Pick<Shop, 'shopName' | 'displayName'>) {
  return shop.displayName?.trim() || shop.shopName;
}

/** Như `shopDisplayName`, cho gian hàng tìm theo id có thể không thấy */
export function maybeShopName(shop: Pick<Shop, 'shopName' | 'displayName'> | undefined) {
  return shop ? shopDisplayName(shop) : undefined;
}

/**
 * Lần đơn về gần nhất (FE#464): mốc muộn nhất trong lượt kéo định kỳ (`lastOrderSyncAt`), lượt lấy đơn chạy trọn
 * (`ordersPulledOkAt`) và lượt kéo đơn còn mở sau thiết lập (`openOrdersPulledAt`). Lượt đơn còn mở không tiến
 * `lastOrderSyncAt`, nên chỉ đọc cột đó thì gian hàng vừa thiết lập có "Đơn 7 ngày: 19" mà vẫn ghi "Chưa đồng bộ".
 * `openOrdersOnly`: mới có lượt đơn còn mở, chưa có lượt định kỳ nào
 */
export function lastOrderPull(shop: Pick<Shop, 'lastOrderSyncAt' | 'ordersPulledOkAt' | 'openOrdersPulledAt'>) {
  const times = [shop.lastOrderSyncAt, shop.ordersPulledOkAt, shop.openOrdersPulledAt].filter((t): t is string => Boolean(t));
  if (times.length === 0) return null;
  const at = times.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));
  return { at, openOrdersOnly: !shop.lastOrderSyncAt && !shop.ordersPulledOkAt };
}

/** Nhóm của thanh chọn trên bảng: tất cả, cần xử lý, đã ngắt */
export type ShopSegment = 'all' | 'needs_action' | 'disconnected';

/**
 * Gian hàng đang bán, sàn tính hạn trả theo số ngày mà chưa có số ngày: nối trước khi thiết lập bắt buộc
 * hạn trả (§18.7.2, FE#273). Rẽ theo capabilities, không theo mã sàn.
 */
export function missingReturnWindow(shop: Shop) {
  return shop.status === 'active' && shop.capabilities.returnWindow === 'days' && shop.returnWindowDays == null;
}

/** Có listing đổi category trên sàn lỗi hoặc lệch: điều kiện thứ sáu của Cần xử lý (§18.7.2, commerio-backend#467) */
export const hasCategoryChangeIssue = (shop: Shop) => (shop.categoryChangeIssues ?? 0) > 0;

/**
 * Cần người dùng làm gì đó: mất quyền, chưa thiết lập, uỷ quyền sắp hết hạn, hoặc chưa nhập số ngày hạn trả
 * (nhãn, không phải trạng thái; §18.7.2)
 */
export function needsAction(shop: Shop) {
  return (
    shop.status === 'needs_reauth' ||
    shop.status === 'connecting' ||
    (shop.status === 'active' && shop.tokenExpiringSoon) ||
    missingReturnWindow(shop) ||
    hasCategoryChangeIssue(shop)
  );
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
    (!search ||
      [s.displayName ?? '', s.shopName, s.externalShopId].some((v) => v.toLowerCase().includes(search))) &&
    (!filters.platform || s.platform === filters.platform) && inSegment(s, filters.segment),
  );
  const page = Math.min(filters.page, Math.max(1, Math.ceil(items.length / filters.pageSize)));
  return { items: items.slice((page - 1) * filters.pageSize, page * filters.pageSize), total: items.length, page };
}
