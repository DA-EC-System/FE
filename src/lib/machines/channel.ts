/**
 * Gian hàng (sơ đồ C1) và listing (sơ đồ C2), FE#58. Mock kiểm bằng `check`, UI hiện thao tác bằng `available`.
 * Năng lực theo sàn do BE trả trong capabilities.
 */
import { defineMachine } from '@/lib/stateMachine';
import { PERMISSIONS } from '@/utils/permissions';
import type { VariantPresence } from '@/types/catalog';
import type { ListingAction, ListingStatus, ShopAction, ShopStatus } from '@/types/shop';

export const shopMachine = defineMachine<ShopStatus, ShopAction>([
  { from: 'connecting', to: 'active', action: 'finish_setup', label: 'Hoàn tất thiết lập', permission: PERMISSIONS.shopConnect },
  { from: ['connecting', 'active'], to: 'needs_reauth', action: 'lose_auth', label: 'Mất uỷ quyền', system: true },
  { from: ['needs_reauth', 'disconnected'], to: 'active', action: 'reconnect', label: 'Kết nối lại', permission: PERMISSIONS.shopConnect },
  {
    from: ['connecting', 'active', 'needs_reauth'],
    to: 'disconnected',
    action: 'disconnect',
    label: 'Ngắt kết nối',
    permission: PERMISSIONS.shopDisconnect,
  },
  // Ngắt hoặc mất uỷ quyền khi chưa thiết lập xong (chưa có mốc kéo đơn): chạy lại thiết lập (25 §6.1).
  // Đã thiết lập xong thì dùng `reconnect`; BE chọn bước theo mốc kéo đơn (`reconnectAction`).
  {
    from: ['needs_reauth', 'disconnected'],
    to: 'connecting',
    action: 'resume_setup',
    label: 'Tiếp tục thiết lập',
    permission: PERMISSIONS.shopConnect,
  },
]);

/** Token còn gọi được API sàn: ghép, đẩy, đồng bộ */
export const shopUsable = (status: ShopStatus) => status === 'active' || status === 'connecting';

const manage = PERMISSIONS.listingManage;

/** Trạng thái trên máy: thêm `not_listed` (chưa có bản ghi listing) để vẽ đủ sơ đồ 25 §6.4 */
export type ListingMachineStatus = ListingStatus | 'not_listed';

export const listingMachine = defineMachine<ListingMachineStatus, ListingAction>([
  // Đẩy lần đầu, đẩy lại sau lỗi, bị từ chối hoặc sàn khoá (25 §6.4). `delisted` là kết thúc:
  // đưa SKU lên lại thì tạo listing mới ở `not_listed`, listing cũ giữ `delisted`.
  {
    from: ['not_listed', 'push_failed', 'rejected', 'platform_hold'],
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
  // Mọi trạng thái trừ pushing
  {
    // `not_listed` chưa có bản ghi listing nên không gỡ (25 §6.4); trùng `domain/listing.ts` của backend.
    from: ['live', 'hidden', 'under_review', 'platform_hold', 'rejected', 'push_failed'],
    to: 'delisted',
    action: 'delist',
    label: 'Gỡ khỏi sàn',
    permission: manage,
  },
  // Sửa nội dung mà sàn đòi duyệt lại và ngừng bán bản cũ. Sàn vẫn bán bản cũ (TikTok) thì giữ `live`, ghi
  // `pendingRevision` (21 §18.3, commerio-backend#293). Đổi tồn hoặc giá không đổi trạng thái.
  { from: 'live', to: 'under_review', action: 'request_review', label: 'Sàn duyệt lại nội dung', system: true },
]);

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
