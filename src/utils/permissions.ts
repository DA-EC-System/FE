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
  /** Xem yêu cầu trả hàng (sơ đồ D3) */
  returnView: 'sales.return.view',
  /** Chấp nhận, từ chối, hoàn tiền, ghi sàn xử, lập yêu cầu trả cho đơn tạo tay (sơ đồ D3) */
  returnProcess: 'sales.return.process',
  /** Đóng gói, báo sàn, bàn giao, mở kiện, chia kiện, quét nhận hàng hoàn (sơ đồ D2) */
  fulfillmentProcess: 'fulfillment.order.process',
  /** Tự giao, cập nhật giao kiện đơn tạo tay, hộp thư (sơ đồ D2) */
  deliveryUpdate: 'fulfillment.delivery.update',
  /** Đảo bàn giao: cộng lại tồn thực (sơ đồ D2, CEO) */
  handoverRevert: 'fulfillment.handover.revert',
  /** Tạo mã QR, link thanh toán cho đơn (UC-PF-01) */
  paymentLinkCreate: 'payment.link.create',
  /** Cấu hình khoá cổng thanh toán (UC-PF-11) */
  gatewayManage: 'payment.gateway.manage',
  /** Xem giao dịch cổng (UC-PF-03) */
  transactionView: 'payment.transaction.view',
  /** Xem hoá đơn, phiếu thu, phiếu chi, COD, hoàn tiền, khoản thu chưa khớp (UC-PF-04..07) */
  financeView: 'finance.invoice.view',
  configManage: 'finance.config.manage',
  configApprove: 'finance.config.approve',
  settlementResolve: 'finance.settlement.resolve',
  settlementApprove: 'finance.settlement.approve',
  /** Ghi tiền: xác nhận COD, hoàn tiền, lập/ghi sổ phiếu chi, gán và hoàn khoản thu */
  voucherCreate: 'finance.voucher.create',
  /** Xem sổ tiền, lãi theo đơn, cảnh báo mốc doanh thu (sơ đồ D4.1) */
  ledgerView: 'finance.ledger.view',
  /** Xuất chứng từ sổ tiền kiểu MISA */
  ledgerExport: 'finance.ledger.export',
  /** Xem báo cáo kinh doanh; cần thêm `finance.invoice.view` (UC-RP-01, D18) */
  reportView: 'report.dashboard.view',
  /** Xuất báo cáo ra CSV (UC-RP-02) */
  reportExport: 'report.dashboard.export',
  /** Duyệt, ghi sổ phiếu kho (kiểm kê, xuất huỷ, chờ xử lý, kiểm hàng về); người thứ hai (FE#55) */
  stockDocApprove: 'inventory.document.approve',
  /** Lập, gửi, rút đề nghị nhập; đặt NCC (sơ đồ A1) */
  purchaseRequestManage: 'purchasing.request.manage',
  /** Duyệt, trả về, từ chối đề nghị nhập (sơ đồ A1, CEO) */
  purchaseRequestApprove: 'purchasing.request.approve',
  /** Kiểm đếm, ghi sổ phiếu nhận (sơ đồ A2) */
  goodsReceiptManage: 'purchasing.receipt.manage',
  /** Lập, gửi phiếu trả NCC, ghi kết quả (sơ đồ B4) */
  supplierReturnManage: 'purchasing.return.manage',
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

/** Có ít nhất một quyền trong danh sách; trang Mua hàng mở cho mọi vai có một quyền mua hàng */
export function hasAnyPermission(context: CompanyContext | null, permissions: readonly string[]): boolean {
  return permissions.some((p) => hasPermission(context, p));
}

/** Mọi quyền của phân hệ Mua hàng (sơ đồ A1, A2, B4) */
export const PURCHASING_PERMISSIONS = [
  PERMISSIONS.purchaseRequestManage,
  PERMISSIONS.purchaseRequestApprove,
  PERMISSIONS.goodsReceiptManage,
  PERMISSIONS.supplierReturnManage,
] as const;

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

/** D4: xem được khi có ít nhất một quyền tài chính. */
export const FINANCE_PERMISSIONS = [PERMISSIONS.financeView, PERMISSIONS.configManage,
  PERMISSIONS.configApprove, PERMISSIONS.settlementResolve, PERMISSIONS.settlementApprove] as const;
