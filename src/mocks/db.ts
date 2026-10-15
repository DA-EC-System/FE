/**
 * In-memory database cho MSW — dữ liệu mẫu để dev UI trước khi backend sẵn sàng.
 * Cấu trúc bám docs/19: account (staff.accounts), membership (staff.memberships),
 * vai trò và quyền (access.*), công ty (platform.companies), nhật ký nền tảng (audit, company_id null).
 */

import type { Company } from '@/types/company';
import type { Shop } from '@/types/shop';
import type { Account, MembershipStatus } from '@/types/auth';
import type { PlatformAuditLog } from '@/types/audit';
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

/** Vai trò và quyền mẫu. CEO kế thừa Admin và giữ quyền tài chính; Admin không có quyền kho, tài chính. */
const ADMIN_PERMISSIONS = [
  P.shopView,
  P.shopConnect,
  P.shopUpdate,
  P.shopDisconnect,
  P.shopSync,
  P.productView,
  P.orderView,
];

export const roles: Record<string, { name: string; permissions: string[] }> = {
  ceo: {
    name: 'CEO',
    permissions: [...ADMIN_PERMISSIONS, P.stockView, 'finance.invoice.view'],
  },
  admin: { name: 'Admin', permissions: ADMIN_PERMISSIONS },
  sale: {
    name: 'Sale',
    permissions: [P.shopView, P.productView, P.orderView, 'sales.order.create'],
  },
  // Vai trò tuỳ biến (UC-PI-06)
  warehouse: {
    name: 'Nhân viên kho',
    permissions: [P.productView, P.stockView, 'inventory.receipt.create'],
  },
};

const accounts: Account[] = [
  {
    id: 'acc-000',
    email: 'platform@commerio.vn',
    fullName: 'Quản trị nền tảng',
    isPlatformAdmin: true,
  },
  {
    id: 'acc-001',
    email: 'ceo@commerio.vn',
    fullName: 'Lê Hoàng Minh',
    isPlatformAdmin: false,
  },
  {
    id: 'acc-002',
    email: 'sale@commerio.vn',
    fullName: 'Trần Thị Bán Hàng',
    isPlatformAdmin: false,
  },
  {
    id: 'acc-003',
    email: 'kho@commerio.vn',
    fullName: 'Ngô Văn Kho',
    isPlatformAdmin: false,
  },
];

export interface MockMembership {
  accountId: string;
  companyId: string;
  roleKeys: string[];
  status: MembershipStatus;
}

const memberships: MockMembership[] = [
  // CEO của ABC, đồng thời là Admin ở Minh Phát (không bật Channel) — demo chuyển công ty
  { accountId: 'acc-001', companyId: 'cmp-001', roleKeys: ['ceo'], status: 'active' },
  { accountId: 'acc-001', companyId: 'cmp-003', roleKeys: ['admin'], status: 'active' },
  { accountId: 'acc-002', companyId: 'cmp-001', roleKeys: ['sale'], status: 'active' },
  // Nhân viên kho: một công ty bị khoá cả công ty, một công ty bị khoá tài khoản
  { accountId: 'acc-003', companyId: 'cmp-001', roleKeys: ['warehouse'], status: 'active' },
  { accountId: 'acc-003', companyId: 'cmp-004', roleKeys: ['warehouse'], status: 'active' },
  { accountId: 'acc-003', companyId: 'cmp-002', roleKeys: ['warehouse'], status: 'locked' },
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
};

export const db = {
  companies,
  shops,
  accounts,
  memberships,
  auditLogs,
  now,
};
