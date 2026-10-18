import type { Marketplace, ShopStatus } from '@/types/shop';

export const PLATFORM_LABELS: Record<Marketplace, string> = {
  tiktok: 'TikTok Shop',
  shopee: 'Shopee',
  lazada: 'Lazada',
  mock: 'Sàn giả lập (mock)',
};

export const STATUS_LABELS: Record<ShopStatus, string> = {
  connected: 'Đã kết nối',
  expiring: 'Sắp hết hạn',
  deauthorized: 'Mất uỷ quyền',
  disconnected: 'Đã ngắt',
};

export const STATUS_VARIANTS: Record<ShopStatus, 'success' | 'warning' | 'destructive' | 'outline'> = {
  connected: 'success',
  expiring: 'warning',
  deauthorized: 'destructive',
  disconnected: 'outline',
};

/** Token sàn còn dùng được: gọi được API sàn để đồng bộ, ghép, đẩy */
export const isUsable = (status: ShopStatus) => status === 'connected' || status === 'expiring';
