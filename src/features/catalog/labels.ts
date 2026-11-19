import type { ProductStatus } from '@/types/catalog';

export const PRODUCT_STATUS_LABELS: Record<
  ProductStatus,
  { label: string; variant: 'success' | 'secondary' }
> = {
  active: { label: 'Đang hoạt động', variant: 'success' },
  archived: { label: 'Đã lưu trữ', variant: 'secondary' },
};
