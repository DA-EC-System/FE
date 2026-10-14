/**
 * In-memory database cho MSW — dữ liệu mẫu để dev UI trước khi backend sẵn sàng.
 * Tất cả thay đổi (POST/PATCH/DELETE) sẽ mutate các mảng bên dưới.
 */

import type { Company } from '@/types/company';
import type { Shop } from '@/types/shop';
import type { User } from '@/types/auth';

const now = () => new Date().toISOString();

const companies: Company[] = [
  {
    id: 'cmp-001',
    name: 'Công ty Cổ phần Thời trang ABC',
    taxCode: '0312456789',
    status: 'active',
    createdAt: '2025-01-15T08:00:00.000Z',
    updatedAt: '2025-01-15T08:00:00.000Z',
  },
  {
    id: 'cmp-002',
    name: 'Công ty TNHH Mỹ phẩm XYZ',
    taxCode: '0298765431',
    status: 'active',
    createdAt: '2025-03-22T10:30:00.000Z',
    updatedAt: '2025-06-10T14:15:00.000Z',
  },
  {
    id: 'cmp-003',
    name: 'Công ty Thiết bị Gia dụng Minh Phát',
    taxCode: '0345678901',
    status: 'active',
    createdAt: '2025-05-08T09:00:00.000Z',
    updatedAt: '2025-05-08T09:00:00.000Z',
  },
  {
    id: 'cmp-004',
    name: 'Công ty Nông sản Sạch Tây Nguyên',
    taxCode: '0356789012',
    status: 'locked',
    lockReason: 'Vi phạm điều khoản sử dụng — chờ xác minh',
    lockedAt: '2025-08-20T03:00:00.000Z',
    createdAt: '2024-11-02T07:00:00.000Z',
    updatedAt: '2025-08-20T03:00:00.000Z',
  },
  {
    id: 'cmp-005',
    name: 'Công ty Đồ chơi Trẻ em An Toàn',
    taxCode: '0367890123',
    status: 'active',
    createdAt: '2025-09-01T11:00:00.000Z',
    updatedAt: '2025-09-01T11:00:00.000Z',
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
    lastOrderSyncAt: '2025-10-12T08:30:00.000Z',
    createdAt: '2025-01-20T08:00:00.000Z',
    updatedAt: '2025-10-12T08:30:00.000Z',
  },
  {
    id: 'shp-002',
    companyId: 'cmp-001',
    platform: 'tiktok',
    externalShopId: 'tiktok-abc-fashion',
    shopName: 'ABC Fashion TikTok Shop',
    region: 'VN',
    status: 'expiring',
    lastOrderSyncAt: '2025-10-11T20:00:00.000Z',
    createdAt: '2025-04-15T10:00:00.000Z',
    updatedAt: '2025-10-11T20:00:00.000Z',
  },
  {
    id: 'shp-003',
    companyId: 'cmp-001',
    platform: 'lazada',
    externalShopId: 'lazada-abc-fashion',
    shopName: 'ABC Fashion LazMall',
    region: 'VN',
    status: 'connected',
    lastOrderSyncAt: '2025-10-12T07:45:00.000Z',
    createdAt: '2025-02-10T09:00:00.000Z',
    updatedAt: '2025-10-12T07:45:00.000Z',
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
    lastOrderSyncAt: '2025-10-12T08:00:00.000Z',
    createdAt: '2025-03-25T08:00:00.000Z',
    updatedAt: '2025-10-12T08:00:00.000Z',
  },
  {
    id: 'shp-005',
    companyId: 'cmp-002',
    platform: 'mock',
    externalShopId: 'mock-xyz-internal',
    shopName: 'XYZ — đơn nội bộ (mock)',
    region: 'VN',
    status: 'connected',
    lastOrderSyncAt: '2025-10-12T08:15:00.000Z',
    createdAt: '2025-05-01T10:00:00.000Z',
    updatedAt: '2025-10-12T08:15:00.000Z',
  },
  // cmp-003 — Minh Phát
  {
    id: 'shp-006',
    companyId: 'cmp-003',
    platform: 'tiktok',
    externalShopId: 'tiktok-minhphat',
    shopName: 'Minh Phát Home TikTok',
    region: 'VN',
    status: 'deauthorized',
    lastOrderSyncAt: '2025-09-20T12:00:00.000Z',
    createdAt: '2025-05-15T09:00:00.000Z',
    updatedAt: '2025-09-21T03:00:00.000Z',
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
    lastOrderSyncAt: '2025-10-12T08:00:00.000Z',
    createdAt: '2025-09-05T10:00:00.000Z',
    updatedAt: '2025-10-12T08:00:00.000Z',
  },
];

const users: User[] = [
  {
    id: 'usr-001',
    email: 'admin@commerio.vn',
    fullName: 'Nguyễn Văn Quản (Platform Admin)',
    roles: ['admin'],
    permissions: [
      'company:create',
      'company:update',
      'company:delete',
      'shop:create',
      'shop:update',
      'shop:delete',
      'shop:sync',
    ],
    isPlatformAdmin: true,
  },
  {
    id: 'usr-002',
    email: 'sale@commerio.vn',
    fullName: 'Trần Thị Bán Hàng',
    roles: ['sale'],
    permissions: [],
    isPlatformAdmin: false,
  },
  {
    id: 'usr-003',
    email: 'ceo@commerio.vn',
    fullName: 'Lê Hoàng CEO',
    roles: ['ceo', 'admin'],
    permissions: ['company:view', 'shop:create', 'shop:update', 'shop:sync'],
    isPlatformAdmin: false,
  },
];

// Mật khẩu mock — production sẽ thay bằng bcrypt/Argon2 phía backend.
export const passwords: Record<string, string> = {
  'admin@commerio.vn': 'admin',
  'sale@commerio.vn': 'sale',
  'ceo@commerio.vn': 'ceo',
};

export const db = {
  companies,
  shops,
  users,
  now,
};
