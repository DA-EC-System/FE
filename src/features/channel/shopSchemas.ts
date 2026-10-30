import type { ListingStatus, Marketplace, ShopStatus, SyncState } from '@/types/shop';
import { shopUsable } from '@/lib/machines/channel';

export const PLATFORM_LABELS: Record<Marketplace, string> = {
  tiktok: 'TikTok Shop',
  shopee: 'Shopee',
  lazada: 'Lazada',
  mock: 'Sàn giả lập (mock)',
};

export function platformLabel(code: string, name?: string): string {
  return name?.trim() || PLATFORM_LABELS[code] || code;
}

/** Chỉ chọn hạn để hiển thị; cảnh báo do BE quyết định. */
export function authorizationDeadline(shop: { authExpiresAt: string | null; refreshExpiresAt: string | null }): string | null {
  return [shop.authExpiresAt, shop.refreshExpiresAt].filter((x): x is string => Boolean(x))
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
}

export const STATUS_LABELS: Record<ShopStatus, string> = {
  connecting: 'Đang thiết lập',
  active: 'Đã kết nối',
  needs_reauth: 'Cần kết nối lại',
  disconnected: 'Đã ngắt',
};

export const STATUS_VARIANTS: Record<ShopStatus, 'success' | 'warning' | 'destructive' | 'outline' | 'info'> = {
  connecting: 'info',
  active: 'success',
  needs_reauth: 'destructive',
  disconnected: 'outline',
};

/** Token sàn còn dùng được: gọi được API sàn để đồng bộ, ghép, đẩy */
export const isUsable = shopUsable;

/** Sơ đồ Listing (C2); chưa có listing là "Chưa lên sàn" */
export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  pushing: 'Đang đẩy',
  under_review: 'Chờ sàn duyệt',
  live: 'Đang bán',
  push_failed: 'Lỗi đẩy',
  rejected: 'Sàn từ chối',
  platform_hold: 'Sàn khoá',
  hidden: 'Đang ẩn',
  delisted: 'Đã gỡ',
};

export const LISTING_STATUS_VARIANTS: Record<
  ListingStatus,
  'success' | 'warning' | 'destructive' | 'outline' | 'info' | 'secondary'
> = {
  pushing: 'info',
  under_review: 'warning',
  live: 'success',
  push_failed: 'destructive',
  rejected: 'destructive',
  platform_hold: 'destructive',
  hidden: 'secondary',
  delisted: 'outline',
};

export const STOCK_SYNC_LABELS: Record<SyncState, string> = {
  synced: 'Tồn đã đồng bộ',
  pending: 'Tồn chờ đẩy',
  error: 'Lệch tồn sàn',
};
