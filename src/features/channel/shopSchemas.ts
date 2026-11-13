import type {
  ListingStatus,
  Marketplace,
  RemoteSkuStatus,
  ShopCapabilities,
  ShopOpeningStocktake,
  ShopStatus,
  SyncState,
} from '@/types/shop';
import type { StatusMeta } from '@/components/common/StatusBadge';
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
export function authorizationDeadline(shop: { authExpiresAt?: string | null; refreshExpiresAt: string | null }): string | null {
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

/** Nhãn, màu và câu giải thích của trạng thái gian hàng (sơ đồ C1), hiện khi rê chuột hay chạm vào nhãn */
export const STATUS_META: Record<ShopStatus, StatusMeta> = {
  connecting: { label: STATUS_LABELS.connecting, variant: STATUS_VARIANTS.connecting, hint: 'Đã uỷ quyền, chưa xong thiết lập lần đầu nên chưa kéo đơn và chưa đẩy tồn.' },
  active: { label: STATUS_LABELS.active, variant: STATUS_VARIANTS.active, hint: 'Đang kéo đơn và đẩy tồn, giá lên sàn.' },
  needs_reauth: { label: STATUS_LABELS.needs_reauth, variant: STATUS_VARIANTS.needs_reauth, hint: 'Sàn đã thu hồi quyền hoặc token hết hạn. Việc cần gọi sàn được giữ lại, kết nối lại xong sẽ chạy tiếp.' },
  disconnected: { label: STATUS_LABELS.disconnected, variant: STATUS_VARIANTS.disconnected, hint: 'Đã ngắt. Đơn, đối soát và ghép SKU cũ vẫn giữ để kết nối lại sau.' },
};

/** Tóm tắt khác biệt của sàn để chọn sàn khi thêm gian hàng; chỉ đọc capabilities, không xét mã sàn */
export function capabilitySummary(c: ShopCapabilities): string[] {
  return [
    c.listingReview ? 'Sàn duyệt sản phẩm trước khi bán' : 'Sản phẩm lên bán ngay',
    { unit: 'Tách đơn tới từng món', sku: 'Tách đơn theo SKU', none: 'Không tách đơn' }[c.splitLevel],
    c.returnWindow === 'days' ? 'Hạn đổi trả theo số ngày bạn đặt' : 'Hạn đổi trả do sàn báo',
  ];
}

/**
 * Câu thay cho ô số ngày đổi trả ở thiết lập khi sàn tự báo hết hạn trả (returnWindow = platform_status).
 * Rẽ theo capabilities, không theo mã sàn; null khi người bán phải đặt số ngày.
 */
export function returnWindowNote(c: ShopCapabilities, platformName: string): string | null {
  if (c.returnWindow !== 'platform_status') return null;
  return `${platformName} tự khoá đổi trả khi đơn hoàn tất, nên không cần đặt số ngày đổi trả.`;
}

/** Token sàn còn dùng được: gọi được API sàn để đồng bộ, ghép, đẩy */
export const isUsable = shopUsable;

/** Nhãn trạng thái SKU trên sàn ở bước ghép; `live` không hiện nhãn (§18.7.5) */
export const REMOTE_SKU_STATUS_LABELS: Record<Exclude<RemoteSkuStatus, 'live'>, string> = {
  review: 'Chờ sàn duyệt',
  rejected: 'Sàn từ chối',
  hold: 'Sàn đang khoá',
  inactive: 'Đang tắt trên sàn',
};

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

/** Trạng thái phiếu kiểm kê đầu kỳ, dùng trong câu "phiếu KK-… đã huỷ" (§18.6.2) */
export const STOCKTAKE_STATUS_TEXT: Record<ShopOpeningStocktake['status'], string> = {
  draft: 'đang nháp',
  pending: 'đang chờ duyệt',
  rejected: 'bị từ chối',
  cancelled: 'đã huỷ',
  posted: 'đã ghi sổ',
};

/** Phiếu bị từ chối hoặc đã huỷ không đi tiếp được, phải lập phiếu mới (§18.6.11) */
export const canRedoStocktake = (s: ShopOpeningStocktake['status']) => s === 'rejected' || s === 'cancelled';
