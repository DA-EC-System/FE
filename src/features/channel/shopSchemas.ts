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
  connecting: 'Chờ thiết lập',
  active: 'Đã kết nối',
  needs_reauth: 'Cần kết nối lại',
  disconnected: 'Đã ngắt kết nối',
};

export const STATUS_VARIANTS: Record<ShopStatus, 'success' | 'warning' | 'destructive' | 'outline' | 'info'> = {
  connecting: 'info',
  active: 'success',
  needs_reauth: 'destructive',
  disconnected: 'outline',
};

/** Nhãn, màu và câu giải thích của trạng thái gian hàng (sơ đồ C1), hiện khi rê chuột hay chạm vào nhãn */
export const STATUS_META: Record<ShopStatus, StatusMeta> = {
  connecting: { label: STATUS_LABELS.connecting, variant: STATUS_VARIANTS.connecting, hint: 'Đã uỷ quyền, chưa xong thiết lập lần đầu nên chưa đồng bộ đơn và chưa đồng bộ tồn.' },
  active: { label: STATUS_LABELS.active, variant: STATUS_VARIANTS.active, hint: 'Đang đồng bộ đơn về và đồng bộ tồn, giá lên sàn.' },
  needs_reauth: { label: STATUS_LABELS.needs_reauth, variant: STATUS_VARIANTS.needs_reauth, hint: 'Sàn đã thu hồi quyền hoặc token hết hạn. Việc cần gọi sàn được giữ lại, kết nối lại xong sẽ chạy tiếp.' },
  disconnected: { label: STATUS_LABELS.disconnected, variant: STATUS_VARIANTS.disconnected, hint: 'Đã ngắt kết nối. Đơn, đối soát và liên kết SKU cũ vẫn giữ để kết nối lại sau.' },
};

/** Tóm tắt khác biệt của sàn để chọn sàn khi thêm gian hàng; chỉ đọc capabilities, không xét mã sàn */
export function capabilitySummary(c: ShopCapabilities): string[] {
  return [
    c.listingReview ? 'Sàn duyệt sản phẩm trước khi bán' : 'Sản phẩm lên bán ngay',
    { unit: 'Tách đơn tới từng món', sku: 'Tách đơn theo SKU', none: 'Không tách đơn' }[c.splitLevel],
    c.returnWindow === 'days' ? 'Hạn trả hàng theo số ngày bạn đặt' : 'Hạn trả hàng do sàn báo',
  ];
}

/**
 * Câu thay cho ô hạn trả hàng ở thiết lập khi sàn tự báo hết hạn trả (returnWindow = platform_status).
 * Rẽ theo capabilities, không theo mã sàn; null khi người bán phải đặt số ngày.
 */
export function returnWindowNote(c: ShopCapabilities, platformName: string): string | null {
  if (c.returnWindow !== 'platform_status') return null;
  return `${platformName} tự đóng yêu cầu trả hàng khi đơn hoàn thành, nên không cần đặt hạn trả hàng.`;
}

/** Hạn trả hàng (ngày): số nguyên 1–60 (§18.6.2, §18.4) */
export function returnDaysError(value: string): string | null {
  if (!value.trim()) return 'Nhập hạn trả hàng';
  const n = Number(value);
  return /^\d+$/.test(value.trim()) && n >= 1 && n <= 60 ? null : 'Hạn trả hàng là số nguyên từ 1 đến 60 ngày';
}

/** Token sàn còn dùng được: gọi được API sàn để đồng bộ, ghép, đẩy */
export const isUsable = shopUsable;

/** Nhãn trạng thái SKU trên sàn ở bước liên kết; `live` không hiện nhãn (§18.7.5). Cùng chữ với LISTING_STATUS_LABELS */
export const REMOTE_SKU_STATUS_LABELS: Record<Exclude<RemoteSkuStatus, 'live'>, string> = {
  review: 'Chờ sàn duyệt',
  rejected: 'Bị từ chối',
  hold: 'Bị sàn khoá',
  inactive: 'Tạm ẩn',
};

/** Sơ đồ Listing (C2); chưa có listing là "Chưa lên sàn" */
export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  pushing: 'Đang đăng',
  under_review: 'Chờ sàn duyệt',
  live: 'Đang hoạt động',
  push_failed: 'Đăng lỗi',
  rejected: 'Bị từ chối',
  platform_hold: 'Bị sàn khoá',
  hidden: 'Tạm ẩn',
  delisted: 'Đã gỡ khỏi sàn',
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
  pending: 'Tồn chờ đồng bộ',
  error: 'Lệch tồn',
};

/** Trạng thái phiếu kiểm kho đầu kỳ, dùng trong câu "phiếu KK-… đã huỷ" (§18.6.2) */
export const STOCKTAKE_STATUS_TEXT: Record<ShopOpeningStocktake['status'], string> = {
  draft: 'đang nháp',
  pending: 'đang chờ duyệt',
  rejected: 'bị từ chối',
  cancelled: 'đã huỷ',
  posted: 'đã hoàn thành',
};

/** Phiếu bị từ chối hoặc đã huỷ không đi tiếp được, phải lập phiếu mới (§18.6.11) */
export const canRedoStocktake = (s: ShopOpeningStocktake['status']) => s === 'rejected' || s === 'cancelled';

/** Chữ phải gõ để xoá gian hàng (FE#297): khớp chính xác, chữ hoa, chỉ bỏ khoảng trắng hai đầu */
export const DELETE_CONFIRM_WORD = 'XOA';

export const deleteConfirmed = (typed: string) => typed.trim() === DELETE_CONFIRM_WORD;
