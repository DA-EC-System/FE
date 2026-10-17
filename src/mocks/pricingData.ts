/**
 * Dữ liệu giả pricing.* theo ERD. Chỉ dùng cho MSW.
 * Giá lưu theo variantId; biến thể không có trong `prices` là chưa có giá.
 */

export interface MockPricelist {
  id: string;
  companyId: string;
  name: string;
  type: 'standard' | 'channel';
  shopId: string | null;
  /** pricing.pricelist_items: variantId → giá */
  prices: Record<string, number>;
  version: number;
  updatedAt: string;
}

const T0 = '2026-10-01T03:00:00.000Z';

export const pricelists: MockPricelist[] = [
  {
    id: 'pl-std-001',
    companyId: 'cmp-001',
    name: 'Bảng giá chuẩn',
    type: 'standard',
    shopId: null,
    prices: {
      'prd-001-v1': 150000,
      'prd-001-v2': 150000,
      'prd-001-v3': 150000,
      'prd-001-v4': 150000,
      'prd-002-v1': 320000,
      'prd-002-v2': 320000,
      'prd-004-v1': 250000,
    },
    version: 1,
    updatedAt: T0,
  },
  {
    // Gian hàng còn kết nối: bảng giá đang được dùng, không xoá được
    id: 'pl-shp-001',
    companyId: 'cmp-001',
    name: 'Giá Shopee',
    type: 'channel',
    shopId: 'shp-001',
    prices: { 'prd-001-v1': 165000, 'prd-001-v2': 165000 },
    version: 1,
    updatedAt: T0,
  },
  {
    // Gian hàng đã ngắt: bảng giá không còn dùng, xoá được
    id: 'pl-shp-008',
    companyId: 'cmp-001',
    name: 'Giá Outlet cũ',
    type: 'channel',
    shopId: 'shp-008',
    prices: { 'prd-001-v1': 120000 },
    version: 1,
    updatedAt: T0,
  },
  {
    id: 'pl-std-002',
    companyId: 'cmp-002',
    name: 'Bảng giá chuẩn',
    type: 'standard',
    shopId: null,
    prices: { 'prd-101-v1': 180000, 'prd-101-v2': 350000 },
    version: 1,
    updatedAt: T0,
  },
];
