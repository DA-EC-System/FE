import type { CompanyContext } from '@/types/auth';
import type { ModuleKey } from './modules';

/**
 * Mã quyền đang dùng ở FE. Dạng "<module>.<resource>.<action>".
 * Danh mục đầy đủ do BE cấp qua access.permissions; khi có OpenAPI sẽ sinh tự động.
 */
export const PERMISSIONS = {
  staffView: 'identity.account.view',
  staffManage: 'identity.account.manage',
  roleView: 'identity.role.view',
  roleManage: 'identity.role.manage',
  /** Chỉ vai trò CEO có, không cấp cho vai trò tuỳ biến (UC-PI-02) */
  moduleManage: 'platform.module.manage',
  /** Vai trò CEO và Admin có, không cấp cho vai trò tuỳ biến (UC-PI-07) */
  auditView: 'platform.audit.view',
  shopView: 'channel.shop.view',
  shopConnect: 'channel.shop.connect',
  shopUpdate: 'channel.shop.update',
  shopDisconnect: 'channel.shop.disconnect',
  shopSync: 'channel.shop.sync',
  productView: 'catalog.product.view',
  productManage: 'catalog.product.manage',
  /** Danh mục, thuộc tính, quy tắc SKU (UC-CP-01) */
  catalogSetup: 'catalog.category.manage',
  pricelistView: 'pricing.pricelist.view',
  /** Tạo, đổi tên, xoá bảng giá và sửa giá (UC-CP-03) */
  pricelistManage: 'pricing.pricelist.manage',
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

/**
 * Chỉ cấp được quyền mình đang có (UC-PI-05 bước 4, UC-PI-06 bước 6):
 * trả về các quyền trong danh sách mà người đang đăng nhập không có.
 * Quyền của phân hệ công ty chưa bật không tính, giống BE.
 */
export function missingPermissions(
  context: CompanyContext | null,
  permissions: readonly string[],
): string[] {
  const held = new Set(context?.permissions ?? []);
  const enabled = new Set<string>(context?.enabledModules ?? []);
  return permissions.filter((p) => enabled.has(p.split('.')[0]) && !held.has(p));
}
