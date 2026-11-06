import type { ShopCapabilities, ShopPlatform } from '@/types/shop';

export const mockCapabilities: Record<string, ShopCapabilities> = {
  tiktok: { listingReview: true, hideBy: 'deactivate', splitLevel: 'sku', returnWindow: 'platform_status' },
  lazada: { listingReview: true, hideBy: 'deactivate', splitLevel: 'unit', returnWindow: 'days' },
  shopee: { listingReview: false, hideBy: 'zero_stock', splitLevel: 'none', returnWindow: 'platform_status' },
  mock: { listingReview: false, hideBy: 'deactivate', splitLevel: 'none', returnWindow: 'days' },
};

/** GET /channel/shops/platforms của mock (§18.7.3): sàn chưa kết nối được vẫn hiện, mờ kèm lý do */
export const mockPlatforms: ShopPlatform[] = [
  // FE#198, commerio-backend#217: TikTok nối bằng uỷ quyền; staging có thể phải dán token (H11)
  { platform: 'tiktok', capabilities: mockCapabilities.tiktok, name: 'TikTok Shop', connectable: true, reason: null, methods: ['oauth', 'token'] },
  {
    platform: 'shopee',
    capabilities: mockCapabilities.shopee,
    name: 'Shopee',
    connectable: false,
    reason: 'Shopee chưa cấp quyền API cho ứng dụng sinh viên',
    methods: [],
  },
  { platform: 'lazada', capabilities: mockCapabilities.lazada, name: 'Lazada', connectable: true, reason: null, methods: ['oauth', 'token'] },
  { platform: 'mock', capabilities: mockCapabilities.mock, name: 'Sàn giả lập (mock)', connectable: true, reason: null, methods: ['oauth', 'token'] },
];

/** Sàn cho phép cách nối này (theo `methods` của danh sách sàn, không theo mã sàn) */
export const mockAllowsMethod = (platform: string, method: 'oauth' | 'token') =>
  mockPlatforms.some((p) => p.platform === platform && p.connectable && p.methods?.includes(method));

/**
 * Tham số sàn thật gửi kèm khi quay về redirect_uri, để trang uỷ quyền giả lập đóng vai đúng sàn.
 * TikTok (tich-hop-san/tiktok.md): đồng ý thì kèm app_key, locale, shop_region; từ chối thì code=null&error=auth_denied.
 */
export const mockOAuthReturn: Record<string, { approve: Record<string, string>; deny: Record<string, string> }> = {
  tiktok: {
    approve: { app_key: 'mock-tiktok-app-key', locale: 'vi-VN', shop_region: 'VN' },
    deny: { code: 'null', error: 'auth_denied' },
  },
};

export const DEFAULT_OAUTH_DENY = { error: 'access_denied' };
