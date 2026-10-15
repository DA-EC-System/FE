/**
 * In-memory database cho MSW — dữ liệu mẫu để dev UI trước khi backend sẵn sàng.
 * Cấu trúc bám docs/19: account (staff.accounts), membership (staff.memberships),
 * vai trò và quyền (access.*), công ty (platform.companies), nhật ký nền tảng (audit, company_id null).
 */

import type { Company } from '@/types/company';
import type { Shop } from '@/types/shop';
import type { Account, MembershipStatus } from '@/types/auth';
import type { PlatformAuditLog } from '@/types/audit';
import type { PermissionDef } from '@/types/identity';
import type { AuditAction } from '@/types/companySettings';
import type { OptionalModuleKey } from '@/utils/modules';
import { PERMISSIONS as P } from '@/utils/permissions';

const now = () => new Date().toISOString();

const companies: Company[] = [
  {
    id: 'cmp-001',
    name: 'Công ty Cổ phần Thời trang ABC',
    taxCode: '0312456789',
    ceoName: 'Lê Hoàng Minh',
    ceoEmail: 'ceo@commerio.vn',
    optionalModules: ['channel', 'inbox', 'report'],
    status: 'active',
    createdAt: '2026-01-15T08:00:00.000Z',
  },
  {
    id: 'cmp-002',
    name: 'Công ty TNHH Mỹ phẩm XYZ',
    taxCode: '0298765431',
    ceoName: 'Phạm Thu Hà',
    ceoEmail: 'ha.pham@xyz-beauty.vn',
    optionalModules: ['channel', 'assistant'],
    status: 'active',
    createdAt: '2026-03-22T10:30:00.000Z',
  },
  {
    id: 'cmp-003',
    name: 'Công ty Thiết bị Gia dụng Minh Phát',
    taxCode: '0345678901',
    ceoName: 'Võ Minh Phát',
    ceoEmail: 'phat.vo@minhphat.vn',
    optionalModules: ['purchasing'],
    status: 'active',
    createdAt: '2026-09-25T09:00:00.000Z',
  },
  {
    id: 'cmp-004',
    name: 'Công ty Nông sản Sạch Tây Nguyên',
    taxCode: '0356789012',
    ceoName: 'Y Bình Niê',
    ceoEmail: 'binh@nongsantaynguyen.vn',
    optionalModules: ['channel', 'purchasing', 'report'],
    status: 'locked',
    lockReason: 'Vi phạm điều khoản sử dụng — chờ xác minh',
    lockedAt: '2026-08-20T03:00:00.000Z',
    createdAt: '2025-11-02T07:00:00.000Z',
  },
  {
    id: 'cmp-005',
    name: 'Công ty Đồ chơi Trẻ em An Toàn',
    taxCode: '0367890123',
    ceoName: 'Đặng Thị Lan',
    ceoEmail: 'lan.dang@antoantoys.vn',
    optionalModules: ['channel'],
    status: 'active',
    createdAt: '2026-10-05T11:00:00.000Z',
  },
];

const shops: Shop[] = [
  // cmp-001 — ABC Fashion
  {
    id: 'shp-001',
    companyId: 'cmp-001',
    platform: 'shopee',
    externalShopId: 'shopee-abc-fashion',
    shopName: 'ABC Fashion Official',
    region: 'VN',
    status: 'connected',
    lastOrderSyncAt: '2026-10-14T08:30:00.000Z',
    createdAt: '2026-01-20T08:00:00.000Z',
    updatedAt: '2026-10-14T08:30:00.000Z',
  },
  {
    id: 'shp-002',
    companyId: 'cmp-001',
    platform: 'tiktok',
    externalShopId: 'tiktok-abc-fashion',
    shopName: 'ABC Fashion TikTok Shop',
    region: 'VN',
    status: 'expiring',
    lastOrderSyncAt: '2026-10-13T20:00:00.000Z',
    createdAt: '2026-04-15T10:00:00.000Z',
    updatedAt: '2026-10-13T20:00:00.000Z',
  },
  {
    id: 'shp-003',
    companyId: 'cmp-001',
    platform: 'lazada',
    externalShopId: 'lazada-abc-fashion',
    shopName: 'ABC Fashion LazMall',
    region: 'VN',
    status: 'connected',
    lastOrderSyncAt: '2026-10-14T07:45:00.000Z',
    createdAt: '2026-02-10T09:00:00.000Z',
    updatedAt: '2026-10-14T07:45:00.000Z',
  },
  // cmp-002 — XYZ Cosmetics
  {
    id: 'shp-004',
    companyId: 'cmp-002',
    platform: 'shopee',
    externalShopId: 'shopee-xyz-beauty',
    shopName: 'XYZ Beauty Shopee',
    region: 'VN',
    status: 'connected',
    lastOrderSyncAt: '2026-10-14T08:00:00.000Z',
    createdAt: '2026-03-25T08:00:00.000Z',
    updatedAt: '2026-10-14T08:00:00.000Z',
  },
  {
    id: 'shp-005',
    companyId: 'cmp-002',
    platform: 'mock',
    externalShopId: 'mock-xyz-internal',
    shopName: 'XYZ — sàn giả lập',
    region: 'VN',
    status: 'connected',
    lastOrderSyncAt: '2026-10-14T08:15:00.000Z',
    createdAt: '2026-05-01T10:00:00.000Z',
    updatedAt: '2026-10-14T08:15:00.000Z',
  },
  // cmp-005 — An Toàn Toys
  {
    id: 'shp-007',
    companyId: 'cmp-005',
    platform: 'shopee',
    externalShopId: 'shopee-antoan-toys',
    shopName: 'An Toàn Toys Shopee',
    region: 'VN',
    status: 'connected',
    lastOrderSyncAt: '2026-10-14T08:00:00.000Z',
    createdAt: '2026-10-06T10:00:00.000Z',
    updatedAt: '2026-10-14T08:00:00.000Z',
  },
];

/**
 * Danh mục quyền (access.permissions). docs/19 mới có ví dụ; danh sách này là bản nháp để dựng
 * màn hình, chốt với BE ở commerio-backend#8.
 */
export const permissionCatalog: PermissionDef[] = [
  { code: P.staffView, module: 'identity', label: 'Xem tài khoản nhân viên' },
  { code: P.staffManage, module: 'identity', label: 'Thêm nhân viên, gán vai trò, khoá tài khoản' },
  { code: P.roleView, module: 'identity', label: 'Xem vai trò' },
  { code: P.roleManage, module: 'identity', label: 'Tạo, sửa, xoá vai trò tuỳ biến' },
  { code: P.productView, module: 'catalog', label: 'Xem sản phẩm' },
  { code: P.productManage, module: 'catalog', label: 'Thêm, sửa sản phẩm và biến thể' },
  { code: P.catalogSetup, module: 'catalog', label: 'Quản lý danh mục, thuộc tính, quy tắc SKU' },
  { code: P.pricelistView, module: 'pricing', label: 'Xem bảng giá' },
  { code: P.pricelistManage, module: 'pricing', label: 'Tạo bảng giá, sửa giá' },
  { code: P.stockView, module: 'inventory', label: 'Xem tồn kho' },
  { code: P.stockDocManage, module: 'inventory', label: 'Lập, ghi sổ phiếu nhập, xuất kho' },
  { code: P.reorderManage, module: 'inventory', label: 'Đặt ngưỡng tồn' },
  { code: P.costView, module: 'inventory', label: 'Xem giá vốn, giá trị tồn' },
  { code: P.orderView, module: 'sales', label: 'Xem đơn hàng' },
  { code: 'sales.order.create', module: 'sales', label: 'Tạo đơn hàng' },
  { code: 'fulfillment.order.approve', module: 'fulfillment', label: 'Duyệt đơn, giao hàng' },
  { code: 'finance.invoice.view', module: 'finance', label: 'Xem hoá đơn, sổ quỹ' },
  { code: 'finance.voucher.create', module: 'finance', label: 'Lập phiếu thu, phiếu chi' },
  { code: 'payment.transaction.view', module: 'payment', label: 'Xem giao dịch thanh toán' },
  { code: 'purchasing.order.manage', module: 'purchasing', label: 'Quản lý đơn mua hàng' },
  { code: P.shopView, module: 'channel', label: 'Xem gian hàng' },
  { code: P.shopConnect, module: 'channel', label: 'Kết nối gian hàng' },
  { code: P.shopUpdate, module: 'channel', label: 'Sửa gian hàng' },
  { code: P.shopDisconnect, module: 'channel', label: 'Ngắt gian hàng' },
  { code: P.shopSync, module: 'channel', label: 'Đồng bộ gian hàng' },
  { code: 'inbox.conversation.reply', module: 'inbox', label: 'Trả lời tin nhắn' },
  { code: 'assistant.chat.use', module: 'assistant', label: 'Dùng Trợ lý AI' },
  { code: 'report.dashboard.view', module: 'report', label: 'Xem báo cáo' },
];

/**
 * Admin không có quyền kho, mua hàng, tài chính (UC-PI-05) trừ xem tồn và đặt ngưỡng (UC-IN-01, UC-IN-02);
 * CEO có mọi quyền.
 */
const ADMIN_PERMISSIONS = [
  P.auditView,
  P.staffView,
  P.staffManage,
  P.roleView,
  P.roleManage,
  P.productView,
  P.productManage,
  P.catalogSetup,
  P.pricelistView,
  P.pricelistManage,
  P.stockView,
  P.reorderManage,
  P.orderView,
  'sales.order.create',
  P.shopView,
  P.shopConnect,
  P.shopUpdate,
  P.shopDisconnect,
  P.shopSync,
  'inbox.conversation.reply',
  'report.dashboard.view',
];

export interface MockRole {
  id: string;
  /** null: vai trò có sẵn, dùng chung mọi công ty */
  companyId: string | null;
  name: string;
  permissions: string[];
  version: number;
  updatedAt: string;
}

export const CEO_ROLE_ID = 'role-ceo';

const roles: MockRole[] = [
  {
    id: CEO_ROLE_ID,
    companyId: null,
    name: 'CEO',
    // Hai quyền platform.* không nằm trong danh mục nên không cấp được cho vai trò tuỳ biến
    permissions: [...permissionCatalog.map((p) => p.code), P.moduleManage, P.auditView],
    version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'role-admin',
    companyId: null,
    name: 'Admin',
    permissions: ADMIN_PERMISSIONS,
    version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'role-sale',
    companyId: null,
    name: 'Sale',
    permissions: [P.shopView, P.productView, P.pricelistView, P.orderView, 'sales.order.create', 'inbox.conversation.reply'],
    version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  // Vai trò tuỳ biến (UC-PI-06): mỗi công ty có bản riêng
  ...['cmp-001', 'cmp-002', 'cmp-004'].map<MockRole>((companyId) => ({
    id: `role-kho-${companyId}`,
    companyId,
    name: 'Nhân viên kho',
    permissions: [P.productView, P.stockView, P.stockDocManage],
    version: 1,
    updatedAt: '2026-03-01T00:00:00.000Z',
  })),
  {
    id: 'role-cskh-cmp-001',
    companyId: 'cmp-001',
    name: 'Chăm sóc khách hàng',
    permissions: [P.orderView, 'inbox.conversation.reply'],
    version: 1,
    updatedAt: '2026-04-10T00:00:00.000Z',
  },
];

const accounts: Account[] = [
  {
    id: 'acc-000',
    email: 'platform@commerio.vn',
    fullName: 'Quản trị nền tảng',
    isPlatformAdmin: true,
    mustChangePassword: false,
  },
  {
    id: 'acc-001',
    email: 'ceo@commerio.vn',
    fullName: 'Lê Hoàng Minh',
    isPlatformAdmin: false,
    mustChangePassword: false,
  },
  {
    id: 'acc-002',
    email: 'sale@commerio.vn',
    fullName: 'Trần Thị Bán Hàng',
    isPlatformAdmin: false,
    mustChangePassword: false,
  },
  {
    id: 'acc-003',
    email: 'kho@commerio.vn',
    fullName: 'Ngô Văn Kho',
    isPlatformAdmin: false,
    mustChangePassword: false,
  },
  // Vừa được mời, còn dùng mật khẩu trong thư mời → bị bắt đổi mật khẩu (UC-PI-03 bước 7)
  {
    id: 'acc-004',
    email: 'moi@commerio.vn',
    fullName: 'Đỗ Mới Vào',
    isPlatformAdmin: false,
    mustChangePassword: true,
  },
  {
    id: 'acc-005',
    email: 'admin@commerio.vn',
    fullName: 'Vũ Quản Trị',
    isPlatformAdmin: false,
    mustChangePassword: false,
  },
  {
    id: 'acc-006',
    email: 'nghi@commerio.vn',
    fullName: 'Hồ Đã Nghỉ',
    isPlatformAdmin: false,
    mustChangePassword: false,
  },
];

export interface MockMembership {
  accountId: string;
  companyId: string;
  roleIds: string[];
  status: MembershipStatus;
  joinedAt: string;
  version: number;
}

const member = (
  accountId: string,
  companyId: string,
  roleIds: string[],
  status: MembershipStatus = 'active',
): MockMembership => ({
  accountId,
  companyId,
  roleIds,
  status,
  joinedAt: '2026-02-01T08:00:00.000Z',
  version: 1,
});

const memberships: MockMembership[] = [
  // CEO của ABC, đồng thời là Admin ở Minh Phát (không bật Channel) — demo chuyển công ty
  member('acc-001', 'cmp-001', [CEO_ROLE_ID]),
  member('acc-001', 'cmp-003', ['role-admin']),
  member('acc-002', 'cmp-001', ['role-sale']),
  // Nhân viên kho: một công ty bị khoá cả công ty, một công ty bị khoá tài khoản
  member('acc-003', 'cmp-001', ['role-kho-cmp-001']),
  member('acc-003', 'cmp-004', ['role-kho-cmp-004']),
  member('acc-003', 'cmp-002', ['role-kho-cmp-002'], 'locked'),
  member('acc-004', 'cmp-001', ['role-sale']),
  // Admin của ABC: không gán được vai trò Nhân viên kho (có quyền kho Admin không có)
  member('acc-005', 'cmp-001', ['role-admin']),
  member('acc-006', 'cmp-001', ['role-sale', 'role-cskh-cmp-001'], 'locked'),
];

const auditLogs: PlatformAuditLog[] = [
  ...companies.map<PlatformAuditLog>((c, i) => ({
    id: `pal-${String(i + 1).padStart(3, '0')}`,
    action: 'company.registered',
    targetCompanyId: c.id,
    targetCompanyName: c.name,
    actorEmail: c.ceoEmail,
    createdAt: c.createdAt,
  })),
  {
    id: 'pal-006',
    action: 'company.locked',
    targetCompanyId: 'cmp-004',
    targetCompanyName: 'Công ty Nông sản Sạch Tây Nguyên',
    actorEmail: 'platform@commerio.vn',
    reason: 'Vi phạm điều khoản sử dụng — chờ xác minh',
    createdAt: '2026-08-20T03:00:00.000Z',
  },
];

// Mật khẩu mock — production sẽ thay bằng bcrypt/Argon2 phía backend.
export const passwords: Record<string, string> = {
  'platform@commerio.vn': 'platform',
  'ceo@commerio.vn': 'ceo',
  'sale@commerio.vn': 'sale',
  'kho@commerio.vn': 'kho',
  'moi@commerio.vn': 'moi12345',
  'admin@commerio.vn': 'admin',
  'nghi@commerio.vn': 'nghi',
};

/** Nhật ký thao tác trong công ty: audit.audit_logs có company_id (UC-PI-07) */
export interface MockCompanyAuditLog {
  id: string;
  companyId: string;
  actorId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  entityLabel: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

const companyAuditLogs: MockCompanyAuditLog[] = [
  {
    id: 'cal-006',
    companyId: 'cmp-001',
    actorId: 'acc-001',
    action: 'update',
    entityType: 'platform.company_modules',
    entityId: 'report',
    entityLabel: 'Báo cáo',
    before: { enabled: false },
    after: { enabled: true },
    createdAt: '2026-09-02T02:15:00.000Z',
  },
  {
    id: 'cal-005',
    companyId: 'cmp-001',
    actorId: 'acc-005',
    action: 'update',
    entityType: 'staff.memberships',
    entityId: 'acc-006',
    entityLabel: 'nghi@commerio.vn',
    before: { status: 'active' },
    after: { status: 'locked' },
    createdAt: '2026-09-28T08:40:00.000Z',
  },
  {
    id: 'cal-004',
    companyId: 'cmp-001',
    actorId: 'acc-005',
    action: 'create',
    entityType: 'staff.memberships',
    entityId: 'acc-006',
    entityLabel: 'nghi@commerio.vn',
    before: null,
    after: {
      email: 'nghi@commerio.vn',
      fullName: 'Hồ Đã Nghỉ',
      roles: ['Sale', 'Chăm sóc khách hàng'],
      status: 'active',
    },
    createdAt: '2026-09-10T03:05:00.000Z',
  },
  {
    id: 'cal-003',
    companyId: 'cmp-001',
    actorId: 'acc-005',
    action: 'create',
    entityType: 'access.roles',
    entityId: 'role-cskh-cmp-001',
    entityLabel: 'Chăm sóc khách hàng',
    before: null,
    after: {
      name: 'Chăm sóc khách hàng',
      permissions: ['sales.order.view', 'inbox.conversation.reply'],
    },
    createdAt: '2026-09-09T09:20:00.000Z',
  },
  {
    id: 'cal-002',
    companyId: 'cmp-001',
    actorId: 'acc-001',
    action: 'create',
    entityType: 'access.roles',
    entityId: 'role-kho-cmp-001',
    entityLabel: 'Nhân viên kho',
    before: null,
    after: {
      name: 'Nhân viên kho',
      permissions: ['catalog.product.view', 'inventory.stock.view', 'inventory.receipt.create'],
    },
    createdAt: '2026-08-15T01:30:00.000Z',
  },
  {
    id: 'cal-001',
    companyId: 'cmp-001',
    actorId: 'acc-001',
    action: 'update',
    entityType: 'channel.shops',
    entityId: 'shp-001',
    entityLabel: 'ABC Fashion Official',
    before: { status: 'expiring' },
    after: { status: 'connected' },
    createdAt: '2026-08-01T04:00:00.000Z',
  },
];

/**
 * platform.company_modules: thông tin lần bật và đồng ý OpenAI (UC-PI-02).
 * Trạng thái bật/tắt lấy từ company.optionalModules; khoá là "<companyId>:<module>".
 */
export interface MockModuleState {
  enabledAt: string | null;
  enabledBy: string | null;
  aiConsentAt: string | null;
  aiConsentBy: string | null;
}

const moduleStates: Record<string, MockModuleState> = Object.fromEntries(
  companies.flatMap((c) =>
    c.optionalModules.map((code) => [
      `${c.id}:${code}`,
      {
        enabledAt: c.createdAt,
        enabledBy: null,
        aiConsentAt: code === 'assistant' ? c.createdAt : null,
        aiConsentBy: null,
      },
    ]),
  ),
);
moduleStates['cmp-001:report'] = {
  enabledAt: '2026-09-02T02:15:00.000Z',
  enabledBy: 'acc-001',
  aiConsentAt: null,
  aiConsentBy: null,
};

/**
 * Phân hệ đã có dữ liệu thì không tắt được. Kênh bán tính theo gian hàng;
 * các phân hệ chưa có màn hình thì đánh dấu sẵn ở đây.
 */
const moduleData: Partial<Record<OptionalModuleKey, string[]>> = {
  inbox: ['cmp-001'],
  purchasing: ['cmp-004'],
};

export const db = {
  companies,
  shops,
  accounts,
  memberships,
  roles,
  auditLogs,
  companyAuditLogs,
  moduleStates,
  moduleData,
  now,
};
