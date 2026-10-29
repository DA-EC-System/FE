/**
 * Gian hàng (sơ đồ C1) và listing (sơ đồ C2), FE#58. Mock kiểm bằng `check`, UI hiện thao tác bằng `available`.
 * Khác biệt theo sàn (duyệt listing, ẩn riêng phân loại) gom ở đây để mock và UI dùng chung.
 */
import { defineMachine } from '@/lib/stateMachine';
import { PERMISSIONS } from '@/utils/permissions';
import type { VariantPresence } from '@/types/catalog';
import type { ListingAction, ListingStatus, Marketplace, ShopAction, ShopStatus } from '@/types/shop';

export const shopMachine = defineMachine<ShopStatus, ShopAction>([
  { from: 'connecting', to: 'active', action: 'finish_setup', label: 'Hoàn tất thiết lập', permission: PERMISSIONS.shopConnect },
  { from: 'active', to: 'needs_reauth', action: 'lose_auth', label: 'Mất uỷ quyền', system: true },
  { from: ['needs_reauth', 'disconnected'], to: 'active', action: 'reconnect', label: 'Kết nối lại', permission: PERMISSIONS.shopConnect },
  {
    from: ['connecting', 'active', 'needs_reauth'],
    to: 'disconnected',
    action: 'disconnect',
    label: 'Ngắt kết nối',
    permission: PERMISSIONS.shopDisconnect,
  },
]);

/** Token còn gọi được API sàn: ghép, đẩy, đồng bộ */
export const shopUsable = (status: ShopStatus) => status === 'active' || status === 'connecting';

/**
 * Còn bao nhiêu ngày refresh token thì coi là sắp hết hạn (nhãn phụ, không phải trạng thái).
 * Access token BE tự làm mới, nên chỉ refresh token hết hạn mới buộc người dùng kết nối lại (§18.4).
 */
export const EXPIRING_DAYS = 3;

export function tokenExpiringSoon(status: ShopStatus, refreshExpiresAt: string | null, now = Date.now()) {
  if (status !== 'active' || !refreshExpiresAt) return false;
  return new Date(refreshExpiresAt).getTime() - now < EXPIRING_DAYS * 24 * 3600_000;
}

const manage = PERMISSIONS.listingManage;

export const listingMachine = defineMachine<ListingStatus, ListingAction>([
  // Đẩy lần đầu, đẩy lại sau lỗi hoặc bị từ chối, đẩy lại sau khi gỡ, đẩy nội dung mới cho listing đang bán
  {
    from: ['push_failed', 'rejected', 'delisted', 'live', 'under_review'],
    to: 'pushing',
    action: 'push',
    label: 'Đẩy lên sàn',
    permission: manage,
  },
  { from: 'pushing', to: 'live', action: 'go_live', label: 'Sàn nhận, bán ngay', system: true },
  { from: 'pushing', to: 'under_review', action: 'send_review', label: 'Sàn nhận, chờ duyệt', system: true },
  { from: 'pushing', to: 'push_failed', action: 'fail', label: 'Lỗi đẩy', system: true },
  { from: 'under_review', to: 'live', action: 'approve', label: 'Sàn duyệt', system: true },
  { from: 'under_review', to: 'rejected', action: 'reject', label: 'Sàn từ chối', system: true },
  { from: ['live', 'hidden'], to: 'platform_hold', action: 'hold', label: 'Sàn khoá', system: true },
  { from: 'platform_hold', to: 'live', action: 'release', label: 'Sàn gỡ khoá', system: true },
  { from: 'live', to: 'hidden', action: 'hide', label: 'Ẩn', system: true },
  { from: 'hidden', to: 'live', action: 'unhide', label: 'Hiện lại', system: true },
  {
    from: ['live', 'hidden', 'under_review', 'platform_hold', 'rejected', 'push_failed'],
    to: 'delisted',
    action: 'delist',
    label: 'Gỡ khỏi sàn',
    permission: manage,
  },
]);

/** Sàn duyệt listing trước khi bán (Lazada QC, TikTok); Shopee, sàn giả lập bán ngay */
export const reviewsListings = (platform: Marketplace) => platform === 'lazada' || platform === 'tiktok';

/** Sàn không ẩn riêng một phân loại (Shopee model, Shopify variant): đẩy tồn 0 thay cho ẩn */
export const hidesByZeroStock = (platform: Marketplace) => platform === 'shopee';

/** Listing còn hiện diện trên sàn (tính vào "Trên sàn" của SKU) */
export const onPlatform = (status: ListingStatus) => status !== 'delisted';

/** Hiện diện của SKU suy từ các listing (sơ đồ B1, lớp thứ ba) */
export function presenceFrom(statuses: ListingStatus[]): VariantPresence {
  const present = statuses.filter(onPlatform);
  if (!present.length) return 'not_listed';
  if (present.some((s) => s === 'push_failed' || s === 'rejected' || s === 'platform_hold')) return 'error';
  if (present.some((s) => s === 'live' || s === 'hidden')) return 'live';
  return 'pending';
}
