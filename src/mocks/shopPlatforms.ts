import type { ShopCapabilities } from '@/types/shop';

export const mockCapabilities: Record<string, ShopCapabilities> = {
  tiktok: { listingReview: true, hideBy: 'deactivate' },
  lazada: { listingReview: true, hideBy: 'deactivate' },
  shopee: { listingReview: false, hideBy: 'zero_stock' },
  mock: { listingReview: false, hideBy: 'deactivate' },
};
