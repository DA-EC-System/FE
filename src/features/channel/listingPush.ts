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

/**
 * Sàn sửa được nội dung listing đang bán (§18.3, commerio-backend#293). BE mới làm TikTok, sàn khác trả 422
 * `marketplace_unsupported`; capabilities chưa có cờ riêng nên FE theo mã sàn
 */
const CONTENT_UPDATE_PLATFORMS = ['tiktok'];

/** Nút Sửa nội dung: listing đang bán của sàn có hỗ trợ; bản sửa đang duyệt hay bị từ chối vẫn gửi lại được */
export function canUpdateContent(platform: string | undefined, listing: ChannelListing | null): boolean {
  return Boolean(listing && platform && CONTENT_UPDATE_PLATFORMS.includes(platform) && listing.status === 'live');
}

export function pendingRevisionLabel(r: PendingRevision): string {
  return r.status === 'auditing' ? 'Bản sửa đang duyệt' : 'Bản sửa bị từ chối';
}

/** Giải thích bản sửa nội dung cho tooltip */
export function pendingRevisionHint(r: PendingRevision): string {
  return r.status === 'auditing'
    ? `Gửi lúc ${formatDateTime(r.at)}. Sàn đang duyệt tên, mô tả, thuộc tính mới; listing vẫn bán bản cũ trong lúc duyệt.`
    : 'Listing vẫn bán bản cũ. Sửa sản phẩm theo lý do sàn nêu rồi bấm Sửa nội dung để gửi lại.';
}

/** Mã lỗi đẩy BE ghi riêng, `message` là câu gốc của sàn (§18.6.4, commerio-backend#305) */
const PRECHECK_CODES = new Set(['shop_not_eligible', 'listing_check_failed']);

/** Mã lỗi đẩy mà `message` là câu của sàn, dịch được theo bảng dưới */
const PLATFORM_MESSAGE_CODES = new Set(['marketplace_rejected', 'marketplace_unavailable', ...PRECHECK_CODES]);

/**
 * Câu sàn hay gặp khi đẩy (FE#250, TT-U03). `pushError` không có mã sàn nên khớp theo câu; nguồn câu thật: test và gọi
 * thật của commerio-backend (#305, #347), staging 17/11/2026
 */
const PUSH_ERROR_TRANSLATIONS: { pattern: RegExp; text: (m: RegExpMatchArray) => string }[] = [
  {
    pattern: /12052051|product (name|title)`?[^.;]*(\b25\b[^;]*\b255\b|must be within 25\b)/i,
    text: () => 'Tên sản phẩm phải dài 25–255 ký tự trên TikTok. Sửa tên ở trang sản phẩm rồi bấm Đẩy lại.',
  },
  {
    pattern: /size_chart(_image)?`? is required/i,
    text: () => 'Danh mục TikTok này bắt buộc ảnh bảng kích cỡ. Thêm ảnh bảng kích cỡ ở trang sản phẩm rồi đẩy lại.',
  },
  {
    pattern: /^12052104:/,
    text: () => 'Danh mục sàn bắt buộc một thuộc tính còn thiếu. Bổ sung ở trang sản phẩm rồi đẩy lại.',
  },
  {
    pattern: /Category attribute "([^"]+)" is mandatory/i,
    text: (m) => `Danh mục Lazada bắt buộc thuộc tính "${m[1]}". Bổ sung ở trang sản phẩm rồi đẩy lại.`,
  },
];

function translatePart(part: string): string | null {
  for (const t of PUSH_ERROR_TRANSLATIONS) {
    const m = part.match(t.pattern);
    if (m) return t.text(m);
  }
  return null;
}

/**
 * Câu hiện cho lỗi đẩy của listing và câu gốc của sàn (hiện trong "Chi tiết từ sàn"). Câu sàn hay gặp dịch theo bảng;
 * `listing_check_failed` có nhiều lỗi nối bằng "; " thì dịch từng phần. Mã kiểm trước khi tạo sản phẩm của TikTok không
 * dịch được thì dùng câu chung của mã; mã khác không khớp thì giữ `message` BE trả
 */
export function pushErrorText(e: SyncError): { text: string; platformMessage?: string } {
  if (!PLATFORM_MESSAGE_CODES.has(e.code) || !e.message) {
    return { text: e.message || codeMessage(e.code) };
  }
  const precheck = PRECHECK_CODES.has(e.code);
  const parts = precheck ? e.message.split('; ') : [e.message];
  const translated = parts.map(translatePart);
  const texts = [...new Set(translated.filter((t): t is string => t !== null))];
  if (translated.some((t) => t === null)) {
    if (!precheck && texts.length === 0) return { text: e.message };
    texts.push(codeMessage(e.code));
  }
  return { text: texts.join(' '), platformMessage: e.message };
}
