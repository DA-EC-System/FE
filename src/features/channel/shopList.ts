import type { Shop } from '@/types/shop';
import { platformLabel } from './shopSchemas';

export function shopPlatformOptions(shops: readonly Shop[]) {
  return [...new Set(shops.map((s) => s.platform))].map((value) => ({
    value, label: platformLabel(value, shops.find((shop) => shop.platform === value)?.platformName),
  }));
}

/** Con số phân trang chỉ thuộc UI, không phải response BE. Giữ thứ tự BE trả. */
export function shopPage(shops: readonly Shop[], filters: {
  search: string; platform: string; status: string; page: number; pageSize: number;
}) {
  const search = filters.search.trim().toLowerCase();
  const items = shops.filter((s) =>
    (!search || s.shopName.toLowerCase().includes(search) || s.externalShopId.toLowerCase().includes(search)) &&
    (!filters.platform || s.platform === filters.platform) && (!filters.status || s.status === filters.status),
  );
  const page = Math.min(filters.page, Math.max(1, Math.ceil(items.length / filters.pageSize)));
  return { items: items.slice((page - 1) * filters.pageSize, page * filters.pageSize), total: items.length, page };
}
