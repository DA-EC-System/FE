import { codeMessage } from '@/api/problemMessages';
import type {
  ChannelListing,
  ListingRow,
  ListingStatus,
  OutsideChange,
  PendingRevision,
  PushResult,
  SyncError,
} from '@/types/shop';
import type { BlockerTarget } from '@/types/blocker';
import { formatDateTime } from '@/utils/format';
import { priceText } from '@/utils/price';

/** Còn dòng đang đẩy thì đọc lại mỗi 5 giây, tối đa 30 phút (§18.6.4) */
export const LISTING_POLL_MS = 5000;
export const LISTING_POLL_MAX_MS = 30 * 60 * 1000;

export const hasPushing = (items: ListingRow[] | undefined) =>
  Boolean(items?.some((r) => r.listing?.status === 'pushing'));

/** Khoảng đọc lại: false khi không còn dòng đang đẩy hoặc đã theo dõi quá 30 phút kể từ `startedAt` */
export function listingPollDelay(items: ListingRow[] | undefined, startedAt: number, now: number): number | false {
  if (!hasPushing(items)) return false;
  return now - startedAt < LISTING_POLL_MAX_MS ? LISTING_POLL_MS : false;
}

/** Listing đẩy lại được: lỗi đẩy, sàn từ chối, sàn khoá, hoặc đưa lại listing đã gỡ (§18.5, commerio-backend#219) */
export const REPUSH_STATUSES: ListingStatus[] = ['push_failed', 'rejected', 'platform_hold', 'delisted'];

/** Đã trên sàn: đẩy lại trả `already_listed`, giá và tồn cập nhật bằng Đồng bộ */
export const LISTED_STATUSES: ListingStatus[] = ['under_review', 'live', 'hidden'];

/**
 * Mã chặn đẩy sửa được ở trang Thông tin sàn của sản phẩm (trang 4 bước, commerio-backend#400): chưa chọn category,
 * thiếu attribute, gian hàng chưa có quyền category, TikTok báo sai luật đăng
 */
export const SPEC_FIX_CODES: ReadonlySet<string> = new Set([
  'category_unmapped',
  'spec_incomplete',
  'category_not_permitted',
  'listing_check_failed',
]);

/** Câu của dòng bị chặn khi đẩy, theo bảng "FE báo" của Documents/21 §18.5; `platform` là tên sàn */
export function pushBlockMessage(code: string, message: string | null, platform: string): string {
  switch (code) {
    case 'category_unmapped':
      return `Chưa chọn category ${platform} cho sản phẩm`;
    case 'spec_incomplete':
      return message ? `Thông tin ${platform} của sản phẩm còn thiếu: ${message}` : `Thông tin ${platform} của sản phẩm còn thiếu`;
    case 'below_floor':
      // Giá niêm yết người bán gõ khi đăng (Documents/21 §18.9 R1) thấp hơn giá thấp nhất; không dùng câu của listing đang bán
      return 'Giá niêm yết dưới giá thấp nhất, chưa đăng. Tăng giá hoặc sửa giá muốn thực nhận của SKU';
    case 'category_not_permitted':
      return 'Gian hàng chưa được bán category này. Xin quyền trên Seller Center hoặc đổi category';
    default:
      return message || codeMessage(code);
  }
}

/** Tách kết quả đẩy: dòng đã xếp việc và dòng bị chặn (có `code`) */
export function splitPushResults(results: PushResult[]) {
  const blocked = results.filter((r) => r.code !== null);
  return { queued: results.length - blocked.length, blocked };
}

/** Giải thích trạng thái cho tooltip; trạng thái duyệt chỉ nói khi sàn có duyệt (`capabilities.listingReview`) */
export function listingStatusHint(l: ChannelListing, listingReview: boolean): string {
  switch (l.status) {
    case 'pushing':
      return l.pushAttempts > 0
        ? `Sàn lỗi tạm, Commerio đã thử ${l.pushAttempts} lần và sẽ thử lại tối đa 5 lần trong 30 phút.`
        : listingReview
          ? 'Commerio đang gửi lên sàn. Sàn nhận xong thì chuyển sang chờ sàn duyệt.'
          : 'Commerio đang gửi lên sàn. Sàn nhận xong là bán được.';
    case 'under_review':
      return 'Sàn đang duyệt sản phẩm. Duyệt xong thì chuyển sang Đang bán.';
    case 'live':
      return 'Đang bán trên sàn. Giá và tồn cập nhật bằng Đồng bộ.';
    case 'push_failed':
      return 'Sàn không nhận bản đăng. Sửa theo lỗi bên dưới rồi đăng lại.';
    case 'rejected':
      return 'Sàn từ chối sản phẩm. Sửa theo lý do bên dưới rồi đăng lại.';
    case 'platform_hold':
      return 'Sàn đang khoá sản phẩm. Sửa trên sàn rồi đăng lại.';
    case 'hidden':
      if (l.outsideChange) return outsideChangeHint(l.outsideChange);
      return l.hiddenBy === 'zero_stock'
        ? 'SKU tạm ngừng bán. Sàn không ẩn riêng phân loại nên Commerio đặt tồn 0. Bỏ tạm ngừng ở trang sản phẩm thì bán lại.'
        : 'SKU tạm ngừng bán nên đang ẩn trên sàn. Bỏ tạm ngừng ở trang sản phẩm thì tự hiện lại.';
    case 'delisted':
      return 'Đã gỡ khỏi sàn. Liên kết SKU vẫn giữ để đăng lại.';
  }
}

/** Nhãn khi sàn đổi listing ngoài app (§18.6.6, commerio-backend#360) */
export function outsideChangeLabel(oc: OutsideChange): string {
  return oc.kind === 'disabled'
    ? 'Bị tắt trên Seller Center · chờ CEO'
    : `Giá bị sửa trên Seller Center: ${priceText(oc.platformPrice)} · chờ CEO`;
}

/** Giải thích thay đổi ngoài app cho tooltip */
export function outsideChangeHint(oc: OutsideChange): string {
  return oc.kind === 'disabled'
    ? 'SKU bị tắt trên sàn, ngoài Commerio. Kiểm tra trên Seller Center của sàn. Commerio thôi đồng bộ tồn cho tới khi CEO bật lại hoặc gỡ khỏi sàn.'
    : 'Giá gốc trên sàn khác giá Commerio đồng bộ lần trước nên Commerio tạm ẩn SKU. CEO chọn dùng giá Commerio hoặc dùng giá trên sàn. Giá khuyến mãi của sàn không tính.';
}

/**
 * Sàn sửa được nội dung listing đang bán (§18.3, commerio-backend#293). BE mới làm TikTok, sàn khác trả 422
 * `marketplace_unsupported`; capabilities chưa có cờ riêng nên FE theo mã sàn
 */
// eslint-disable-next-line no-restricted-syntax -- chờ capability từ BE (audit nhieu-san bước 3), không thêm chỗ mới
const CONTENT_UPDATE_PLATFORMS = ['tiktok'];

/** Nút Sửa nội dung: listing đang bán của sàn có hỗ trợ; bản sửa đang duyệt hay bị từ chối vẫn gửi lại được */
export function canUpdateContent(platform: string | undefined, listing: ChannelListing | null): boolean {
  return Boolean(listing && platform && CONTENT_UPDATE_PLATFORMS.includes(platform) && listing.status === 'live');
}

export function pendingRevisionLabel(r: PendingRevision): string {
  return r.status === 'auditing' ? 'Chỉnh sửa chờ duyệt' : 'Chỉnh sửa bị từ chối';
}

/** Giải thích bản sửa nội dung cho tooltip */
export function pendingRevisionHint(r: PendingRevision): string {
  return r.status === 'auditing'
    ? `Gửi lúc ${formatDateTime(r.at)}. Sàn đang duyệt tên, mô tả, thuộc tính mới; listing vẫn bán bản cũ trong lúc duyệt.`
    : 'Listing vẫn bán bản cũ. Sửa sản phẩm theo lý do sàn nêu rồi bấm Cập nhật thông tin lên sàn để gửi lại.';
}

/** Mã lỗi đẩy mà bản ghi trước commerio-backend#567 để câu gốc của sàn trong `message` */
const LEGACY_PLATFORM_MESSAGE_CODES = new Set([
  'marketplace_rejected',
  'marketplace_unavailable',
  'shop_not_eligible',
  'listing_check_failed',
]);

/** Lỗi ghi sau commerio-backend#567, #571: `message` là câu tiếng Việt BE dựng, có thể có `target` */
const isTranslated = (e: SyncError) => e.kind != null || e.target != null || e.platformCode != null;

/** Lỗi cân nặng kiện hàng của Lazada ghi trước #567 (FE#326) */
const LEGACY_WEIGHT = /PACKAGE_WEIGHT[A-Z_]*INVALID/i;

/**
 * Câu hiện cho lỗi đẩy, lỗi đồng bộ tồn/giá của listing, và phần "Chi tiết từ sàn" (FE#462). Câu là `message` BE dựng
 * (commerio-backend#567), mã và câu gốc của sàn chỉ hiện trong "Chi tiết từ sàn". Lỗi ghi trước #567 mà `message` là câu gốc
 * của sàn thì hiện câu chung của mã, câu sàn vào "Chi tiết từ sàn"
 */
export function pushErrorText(e: SyncError): { text: string; platformMessage?: string } {
  if (isTranslated(e)) {
    const raw = [e.platformCode, e.platformMessage].filter(Boolean).join(': ');
    const detail = [raw, e.requestId ? `Mã yêu cầu: ${e.requestId}` : ''].filter(Boolean).join(' · ');
    return { text: e.message || codeMessage(e.code), ...(detail ? { platformMessage: detail } : {}) };
  }
  if (e.message && (LEGACY_PLATFORM_MESSAGE_CODES.has(e.code) || LEGACY_WEIGHT.test(e.message))) {
    return { text: codeMessage(e.code), platformMessage: e.message };
  }
  return { text: e.message || codeMessage(e.code) };
}

/**
 * Chỗ sửa của lỗi: `target` BE trả; lỗi ghi trước #567 thì suy từ mã như trước (ảnh, bảng kích cỡ, cân nặng). Mã thông tin
 * sàn của bản ghi cũ vẫn đi lối Sửa thông tin sàn (`SPEC_FIX_CODES`)
 */
export function pushErrorTarget(e: SyncError | null | undefined): BlockerTarget | null {
  if (!e) return null;
  if (isTranslated(e)) return e.target ?? null;
  if (e.message && LEGACY_WEIGHT.test(e.message)) return { kind: 'variant_field', field: 'weight' };
  if (e.code === 'images_missing') return { kind: 'product_field', field: 'images' };
  if (e.code === 'size_chart_missing') return { kind: 'product_field', field: 'sizeChart' };
  return null;
}

/** Một lý do chặn của dòng vừa bấm đăng: câu và chỗ sửa (null khi BE chưa trả `blockers`, bản trước commerio-backend#566) */
export interface PushBlockItem {
  code: string;
  label: string;
  target: BlockerTarget | null;
}

/** Lý do chặn của một kết quả đẩy: đọc `blockers` BE trả, không có thì dựng câu từ `code` như trước */
export function pushResultBlocks(r: PushResult, platform: string): PushBlockItem[] {
  if (r.blockers?.length) return r.blockers.map((b) => ({ code: b.code, label: b.label, target: b.target }));
  return r.code ? [{ code: r.code, label: pushBlockMessage(r.code, r.message, platform), target: null }] : [];
}
