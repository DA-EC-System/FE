import type { ChannelListing, ListingRow, ListingStatus, PushResult } from '@/types/shop';

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
 * Ảnh gửi kèm lần đầu đẩy (§18.5): sản phẩm chưa có SKU nào lên sàn ở gian hàng này thì gửi ảnh đại diện.
 * Đường dẫn ảnh đổi thành URL đầy đủ để sàn tải được.
 */
export function imageUrlsFor(targets: ListingRow[], items: ListingRow[], origin: string): Record<string, string[]> {
  const onPlatform = new Set(items.filter((r) => r.listing?.externalProductId).map((r) => r.productId));
  const out: Record<string, string[]> = {};
  for (const r of targets) {
    if (onPlatform.has(r.productId) || !r.thumbnailUrl || out[r.productId]) continue;
    out[r.productId] = [new URL(r.thumbnailUrl, origin).href];
  }
  return out;
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
      return 'Sàn không nhận bản đẩy. Sửa theo lỗi bên dưới rồi đẩy lại.';
    case 'rejected':
      return 'Sàn từ chối sản phẩm. Sửa theo lý do bên dưới rồi đẩy lại.';
    case 'platform_hold':
      return 'Sàn đang khoá sản phẩm. Sửa trên sàn rồi đẩy lại.';
    case 'hidden':
      return l.hiddenBy === 'zero_stock'
        ? 'SKU tạm ngừng bán. Sàn không ẩn riêng phân loại nên Commerio đẩy tồn 0.'
        : 'SKU tạm ngừng bán nên đang ẩn trên sàn.';
    case 'delisted':
      return 'Đã gỡ khỏi sàn. Ghép SKU vẫn giữ để đẩy lại.';
  }
}
