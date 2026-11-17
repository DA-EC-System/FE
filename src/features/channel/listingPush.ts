import type { ChannelListing, ListingRow, ListingStatus, OutsideChange, PushResult } from '@/types/shop';
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
      return 'Sàn không nhận bản đẩy. Sửa theo lỗi bên dưới rồi đẩy lại.';
    case 'rejected':
      return 'Sàn từ chối sản phẩm. Sửa theo lý do bên dưới rồi đẩy lại.';
    case 'platform_hold':
      return 'Sàn đang khoá sản phẩm. Sửa trên sàn rồi đẩy lại.';
    case 'hidden':
      if (l.outsideChange) return outsideChangeHint(l.outsideChange);
      return l.hiddenBy === 'zero_stock'
        ? 'SKU tạm ngừng bán. Sàn không ẩn riêng phân loại nên Commerio đẩy tồn 0. Bỏ tạm ngừng ở trang sản phẩm thì bán lại.'
        : 'SKU tạm ngừng bán nên đang ẩn trên sàn. Bỏ tạm ngừng ở trang sản phẩm thì tự hiện lại.';
    case 'delisted':
      return 'Đã gỡ khỏi sàn. Ghép SKU vẫn giữ để đẩy lại.';
  }
}

/** Nhãn khi sàn đổi listing ngoài app (§18.6.6, commerio-backend#360) */
export function outsideChangeLabel(oc: OutsideChange): string {
  return oc.kind === 'disabled'
    ? 'Sàn tắt ngoài app (chờ CEO quyết)'
    : `Giá trên sàn bị sửa: ${priceText(oc.platformPrice)} (chờ CEO quyết)`;
}

/** Giải thích thay đổi ngoài app cho tooltip */
export function outsideChangeHint(oc: OutsideChange): string {
  return oc.kind === 'disabled'
    ? 'SKU bị tắt trên sàn, ngoài Commerio. Kiểm tra trên Seller Center của sàn. Commerio thôi đẩy tồn cho tới khi CEO bật lại hoặc gỡ khỏi sàn.'
    : 'Giá gốc trên sàn khác giá Commerio đẩy lần trước nên Commerio tạm ẩn SKU. CEO chọn đẩy lại giá Commerio hoặc nhận giá trên sàn. Giá khuyến mãi của sàn không tính.';
}
