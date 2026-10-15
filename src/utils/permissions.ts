import type { CompanyContext } from '@/types/auth';
import type { ModuleKey } from './modules';

/**
 * Mã quyền đang dùng ở FE. Dạng "<module>.<resource>.<action>".
 * Danh mục đầy đủ do BE cấp qua access.permissions; khi có OpenAPI sẽ sinh tự động.
 */
export const PERMISSIONS = {
  shopView: 'channel.shop.view',
  shopConnect: 'channel.shop.connect',
  shopUpdate: 'channel.shop.update',
  shopDisconnect: 'channel.shop.disconnect',
  shopSync: 'channel.shop.sync',
  productView: 'catalog.product.view',
  stockView: 'inventory.stock.view',
  orderView: 'sales.order.view',
} as const;

/**
 * Kiểm quyền trong công ty đang chọn. Quản trị nền tảng không có CompanyContext
 * nên luôn bị từ chối ở đây (QT-03: không xem dữ liệu kinh doanh).
 * FE chỉ dùng để ẩn giao diện; BE vẫn kiểm lại mọi yêu cầu.
 */
export function hasPermission(
  context: CompanyContext | null,
  permission: string,
): boolean {
  return Boolean(context?.permissions.includes(permission));
}

export function isModuleEnabled(
  context: CompanyContext | null,
  module: ModuleKey,
): boolean {
  return Boolean(context?.enabledModules.includes(module));
}
