import type { ShopCapabilities } from '@/types/shop';

export const mockCapabilities: Record<string, ShopCapabilities> = {
  tiktok: { listingReview: true, hideBy: 'deactivate', splitLevel: 'sku', returnWindow: 'platform_status' },
  lazada: { listingReview: true, hideBy: 'deactivate', splitLevel: 'unit', returnWindow: 'days' },
  shopee: { listingReview: false, hideBy: 'zero_stock', splitLevel: 'none', returnWindow: 'platform_status' },
  mock: { listingReview: false, hideBy: 'deactivate', splitLevel: 'none', returnWindow: 'days' },
};
