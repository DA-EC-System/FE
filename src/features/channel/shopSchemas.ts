import { z } from 'zod';

export const shopSchema = z.object({
  platform: z.enum(['tiktok', 'shopee', 'lazada', 'mock']),
  externalShopId: z
    .string()
    .min(2, 'Mã gian hàng trên sàn tối thiểu 2 ký tự')
    .max(100, 'Mã gian hàng tối đa 100 ký tự'),
  shopName: z
    .string()
    .min(2, 'Tên gian hàng tối thiểu 2 ký tự')
    .max(200, 'Tên gian hàng tối đa 200 ký tự'),
  region: z
    .string()
    .min(2, 'Vùng/miền tối thiểu 2 ký tự')
    .max(50, 'Vùng/miền tối đa 50 ký tự'),
  status: z.enum(['connected', 'expiring', 'deauthorized', 'disconnected']),
});

export type ShopFormValues = z.infer<typeof shopSchema>;

export const PLATFORM_LABELS: Record<ShopFormValues['platform'], string> = {
  tiktok: 'TikTok Shop',
  shopee: 'Shopee',
  lazada: 'Lazada',
  mock: 'Sàn giả lập (mock)',
};

export const STATUS_LABELS: Record<ShopFormValues['status'], string> = {
  connected: 'Đã kết nối',
  expiring: 'Sắp hết hạn',
  deauthorized: 'Mất uỷ quyền',
  disconnected: 'Đã ngắt',
};

export const STATUS_COLORS: Record<
  ShopFormValues['status'],
  'success' | 'warning' | 'error' | 'default'
> = {
  connected: 'success',
  expiring: 'warning',
  deauthorized: 'error',
  disconnected: 'default',
};
