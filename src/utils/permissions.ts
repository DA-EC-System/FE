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
  /** Ghép SKU, đẩy sản phẩm và giá lên sàn (UC-CH-02) */
  listingManage: 'channel.listing.manage',
  productView: 'catalog.product.view',
  productManage: 'catalog.product.manage',
  /** Danh mục, thuộc tính, quy tắc SKU (UC-CP-01) */
  catalogSetup: 'catalog.category.manage',
  pricelistView: 'pricing.pricelist.view',
  /** Tạo, đổi tên, xoá bảng giá và sửa giá (UC-CP-03) */
  pricelistManage: 'pricing.pricelist.manage',
  stockView: 'inventory.stock.view',
  /** Lập, sửa, ghi sổ, huỷ phiếu nhập/xuất; lập phiếu nhập hoàn (UC-IN-03) */
  stockDocManage: 'inventory.receipt.create',
  /** Đặt ngưỡng tồn (UC-IN-02) */
  reorderManage: 'inventory.reorder.manage',
  /** Giá vốn, giá trị tồn (UC-IN-01: chỉ CEO) */
  costView: 'inventory.cost.view',
  orderView: 'sales.order.view',
  /** Tạo đơn tay, xác nhận đơn (UC-SF-01, UC-SF-04) */
  orderCreate: 'sales.order.create',
  customerView: 'sales.customer.view',
  /** Huỷ đơn tạo tay, hộp thư (UC-SF-06) */
  orderCancel: 'sales.order.cancel',
  /** Tạo lô nhặt, nhặt xong, xuất kho đơn (UC-SF-07, UC-SF-08) */
  fulfillmentProcess: 'fulfillment.order.process',
  /** Cập nhật giao đơn tạo tay, hộp thư (UC-SF-09) */
  deliveryUpdate: 'fulfillment.delivery.update',
  /** Tạo mã QR, link thanh toán cho đơn (UC-PF-01) */
  paymentLinkCreate: 'payment.link.create',
  /** Cấu hình khoá cổng thanh toán (UC-PF-11) */
  gatewayManage: 'payment.gateway.manage',
  /** Xem giao dịch cổng (UC-PF-03) */
  transactionView: 'payment.transaction.view',
  /** Xem hoá đơn, phiếu thu, phiếu chi, COD, hoàn tiền, khoản thu chưa khớp (UC-PF-04..07) */
  financeView: 'finance.invoice.view',
  /** Ghi tiền: xác nhận COD, hoàn tiền, lập/ghi sổ phiếu chi, gán và hoàn khoản thu */
  voucherCreate: 'finance.voucher.create',
  /** Xem báo cáo kinh doanh; cần thêm `finance.invoice.view` (UC-RP-01, D18) */
  reportView: 'report.dashboard.view',
  /** Xuất báo cáo ra CSV (UC-RP-02) */
  reportExport: 'report.dashboard.export',
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

/** Có đủ mọi quyền trong danh sách; báo cáo cần cả `report.dashboard.view` và `finance.invoice.view` (D18) */
export function hasAllPermissions(context: CompanyContext | null, permission: string | readonly string[]): boolean {
  return (typeof permission === 'string' ? [permission] : permission).every((p) => hasPermission(context, p));
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
