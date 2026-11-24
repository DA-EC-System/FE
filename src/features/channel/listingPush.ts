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
    text: () => 'Sàn yêu cầu tên sản phẩm dài 25–255 ký tự. Sửa tên ở trang sản phẩm rồi bấm Đăng lại.',
  },
  {
    pattern: /size_chart(_image)?`? is required/i,
    text: () => 'Category này trên sàn bắt buộc ảnh bảng kích cỡ. Thêm ảnh bảng kích cỡ ở trang sản phẩm rồi đăng lại.',
  },
  {
    pattern: /^12052104:/,
    text: () => 'Category của sàn bắt buộc một attribute còn thiếu. Bổ sung ở Thông tin sàn của sản phẩm rồi đăng lại.',
  },
  {
    // Lazada, staging 18/11/2026: "BIZ_CHECK_PACKAGE_WEIGHT_BY_KG_INVALID:Khối lượng kiện hàng nên nằm trong khoảng 0.001 và 300.0"
    // Số lấy theo cụm "khoảng A và B" / "between A and B", không bắt số lạ đứng sau mã (vd SellerSku ABC-12)
    pattern:
      /PACKAGE_WEIGHT[A-Z_]*INVALID\b(?:[^;]*?(?:khoảng|between|range)\s*(\d+(?:\.\d+)?)\s*(?:và|and|đến|to|-|~)\s*(\d+(?:\.\d+)?))?/i,
    text: (m) =>
      m[1] && m[2]
        ? `Cân nặng kiện hàng phải từ ${kgText(m[1])} đến ${kgText(m[2])} kg theo sàn. Sửa ô Khối lượng của SKU ở trang sản phẩm rồi bấm Đăng lại.`
        : 'Cân nặng kiện hàng nằm ngoài khoảng sàn cho phép. Sửa ô Khối lượng của SKU ở trang sản phẩm rồi bấm Đăng lại.',
  },
  {
    pattern: /Category attribute "([^"]+)" is mandatory/i,
    text: (m) => `Category trên sàn bắt buộc attribute "${m[1]}". Bổ sung ở Thông tin sàn của sản phẩm rồi đăng lại.`,
  },
];

/** Số kg của sàn ("300.0", "0.001") theo cách viết Việt Nam: "300", "0,001" */
const kgText = (raw: string) => Number(raw).toLocaleString('vi-VN', { maximumFractionDigits: 3 });

/** Lỗi đẩy vì cân nặng kiện hàng: hiện nút Sửa cân nặng mở ô Khối lượng của SKU ở trang sản phẩm (FE#326, FE#475) */
export const isWeightError = (e: { message?: string } | null | undefined) =>
  Boolean(e?.message && /PACKAGE_WEIGHT[A-Z_]*INVALID/i.test(e.message));

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
  // Lỗi cân nặng dịch dù BE gắn mã nào (FE#326); có thể đi cùng lỗi khác nên tách "; " và dịch từng phần như mã kiểm trước
  const weight = isWeightError(e);
  if (!weight && (!PLATFORM_MESSAGE_CODES.has(e.code) || !e.message)) {
    return { text: e.message || codeMessage(e.code) };
  }
  const precheck = weight || PRECHECK_CODES.has(e.code);
  const parts = precheck ? e.message.split('; ') : [e.message];
  const translated = parts.map(translatePart);
  const texts = [...new Set(translated.filter((t): t is string => t !== null))];
  if (translated.some((t) => t === null)) {
    if (!precheck && texts.length === 0) return { text: e.message };
    texts.push(codeMessage(e.code));
  }
  return { text: texts.join(' '), platformMessage: e.message };
}
