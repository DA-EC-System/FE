import type { Marketplace } from '@/types/shop';

/**
 * Bảng sàn duy nhất của FE: tên hiển thị và chữ riêng của từng sàn (CLAUDE.md "Thiết kế cho nhiều sàn"). Tên sàn chỉ được
 * gõ ở file này; ESLint chặn chữ "Lazada", "TikTok", "Shopee" trong chuỗi ở file khác. Thêm sàn = thêm một dòng ở đây,
 * mọi câu ghép từ bảng (landing, bước bắt đầu, phí trên bảng kê) tự đúng.
 */
export interface PlatformInfo {
  code: Marketplace;
  label: string;
  /** Commerio bán được trên sàn này: hiện ở landing, câu "Nối gian hàng …" */
  supported: boolean;
  /** Dòng gợi ý dưới nút chọn sàn khi kết nối gian hàng */
  connectHint?: string;
  /** Nơi lấy token dán tay (cách nối bằng token) */
  tokenSource?: string;
  /** Trang của sàn mà người dùng hay nhầm là nơi bấm uỷ quyền */
  authorizePortal?: string;
  /** Trang người bán của sàn (link mở từ app) */
  sellerCenterUrl?: string;
  /** Tên khoản phí trên bảng kê của sàn, cho câu giải thích ô phí */
  feeNames?: { fixedPct: string; transactionPct: string };
}

export const PLATFORMS: readonly PlatformInfo[] = [
  {
    code: 'lazada',
    label: 'Lazada',
    supported: true,
    connectHint: 'Đăng nhập Lazada Seller Center để uỷ quyền.',
    tokenSource: 'Lazada Open Platform → Testing Tools → API Explorer',
    sellerCenterUrl: 'https://sellercenter.lazada.vn/',
    feeNames: { fixedPct: 'Phí cố định', transactionPct: 'Phí thanh toán' },
  },
  {
    code: 'tiktok',
    label: 'TikTok Shop',
    supported: true,
    connectHint: 'Đăng nhập TikTok Shop Seller Center để uỷ quyền.',
    tokenSource: 'TikTok Shop Partner Center → API Testing Tool',
    authorizePortal: 'Partner Center',
    sellerCenterUrl: 'https://seller-vn.tiktok.com/',
    feeNames: { fixedPct: 'Phí hoa hồng nền tảng', transactionPct: 'Phí giao dịch' },
  },
  { code: 'shopee', label: 'Shopee', supported: false, connectHint: 'Đăng nhập Shopee Open Platform để uỷ quyền.' },
  {
    code: 'mock',
    label: 'Sàn giả lập (mock)',
    supported: false,
    connectHint: 'Sàn mô phỏng để thử luồng kết nối, không cần tài khoản sàn.',
  },
];

export const SUPPORTED_PLATFORMS: readonly PlatformInfo[] = PLATFORMS.filter((p) => p.supported);

export function platformInfo(code: string): PlatformInfo | undefined {
  return PLATFORMS.find((p) => p.code === code);
}

/** Tên sàn: tên BE trả (GET /channel/shops/platforms) nếu có, rồi tới bảng này, cuối cùng là mã sàn */
export function platformLabel(code: string, name?: string): string {
  return name?.trim() || platformInfo(code)?.label || code;
}

/** "A", "A và B", "A, B và C" */
export function joinNames(names: readonly string[], conjunction: 'và' | 'hoặc'): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} ${conjunction} ${names[names.length - 1]}`;
}

/** Tên các sàn Commerio đang bán được, ghép thành câu: "Lazada và TikTok Shop" */
export function supportedPlatformNames(conjunction: 'và' | 'hoặc' = 'và'): string {
  return joinNames(
    SUPPORTED_PLATFORMS.map((p) => p.label),
    conjunction,
  );
}

/** "Trên bảng kê, Lazada ghi Phí cố định, TikTok Shop ghi … ." (rỗng khi chưa sàn nào khai tên phí), để ghép trước câu hạch toán */
export function feeNamesText(key: 'fixedPct' | 'transactionPct'): string {
  const parts = SUPPORTED_PLATFORMS.flatMap((p) => (p.feeNames ? [`${p.label} ghi ${p.feeNames[key]}`] : []));
  return parts.length ? `Trên bảng kê, ${parts.join(', ')}. ` : '';
}
