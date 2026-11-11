/**
 * Dữ liệu giả channel.* cho MSW: ghép SKU (channel.channel_listings) và SKU đang có trên sàn.
 * SKU trên sàn là dữ liệu của sàn, BE lấy qua API sàn; mock giữ theo gian hàng.
 */

import { products, swatch } from './catalogData';
import type { ListingStatus, QcAlert, RemoteSkuStatus, SyncError, SyncState } from '@/types/shop';

export interface MockListing {
  id: string;
  companyId: string;
  shopId: string;
  variantId: string;
  externalProductId: string;
  externalSkuId: string;
  /** Sơ đồ Listing C2 (FE#58) */
  status: ListingStatus;
  rejectReason: string | null;
  pushError: string | null;
  pushAttempts: number;
  hiddenBy: 'platform' | 'zero_stock' | null;
  /** Đồng bộ tồn lưu theo lần đẩy; đồng bộ giá tính khi trả về (giá hiện tại so với giá đã đẩy) */
  stockSync: SyncState;
  platformStock: number | null;
  /** Lỗi đẩy gần nhất của riêng SKU này (§18.4) */
  stockSyncError?: SyncError | null;
  priceSyncError?: SyncError | null;
  qcAlert?: QcAlert | null;
  /** Gỡ vì ngắt gian hàng (không phải người dùng gỡ): kết nối lại thì tạo lại */
  delistedByDisconnect?: boolean;
  lastPushedAt: string | null;
  lastPushedPrice: number | null;
  version: number;
}

export interface MockRemoteSku {
  externalProductId: string;
  externalSkuId: string;
  title: string;
  sellerSku: string;
  price: number;
  /** Số tồn đang hiện trên sàn (dùng ở bước kiểm kê đầu kỳ) */
  stock?: number;
  /** Ảnh đầu tiên trên sàn ở bước ghép; không có là null (§18.7.5) */
  imageUrl?: string | null;
  /** Trạng thái trên sàn ở bước ghép; không ghi là `live` */
  status?: RemoteSkuStatus;
}

/** Phiên OAuth đang chờ sàn gọi lại (state → ai bắt đầu, cho công ty nào) */
export interface MockOAuthState {
  companyId: string;
  accountId: string;
  platform: string;
  shopId: string | null;
}

const T0 = '2026-10-10T03:00:00.000Z';

const skuOf = (variantId: string) =>
  products.flatMap((p) => p.variants).find((v) => v.id === variantId)?.sku ?? variantId;

function remote(shopId: string, n: number, variantId: string | null, title: string, price: number, sellerSku?: string) {
  return {
    externalProductId: `${shopId}-p${Math.ceil(n / 4)}`,
    externalSkuId: `${shopId}-sku-${String(n).padStart(3, '0')}`,
    title,
    sellerSku: sellerSku ?? (variantId ? skuOf(variantId) : ''),
    price,
  };
}

export const remoteSkus: Record<string, MockRemoteSku[]> = {
  // Shopee: đã ghép 2 biến thể áo thun; còn 3 SKU cùng SKU người bán để thử gợi ý, 1 SKU cũ không khớp
  'shp-001': [
    remote('shp-001', 1, 'prd-001-v1', 'Áo thun basic cổ tròn - Đen, M', 165000),
    remote('shp-001', 2, 'prd-001-v2', 'Áo thun basic cổ tròn - Đen, L', 150000),
    remote('shp-001', 3, 'prd-001-v3', 'Áo thun basic cổ tròn - Trắng, M', 150000),
    remote('shp-001', 4, 'prd-001-v4', 'Áo thun basic cổ tròn - Trắng, L', 150000),
    remote('shp-001', 5, 'prd-002-v1', 'Quần kaki ống suông - M', 320000),
    remote('shp-001', 6, null, 'Áo thun oversize (hàng cũ)', 99000, 'OLD-TEE-01'),
  ],
  'shp-002': [remote('shp-002', 1, 'prd-001-v1', 'Áo thun cổ tròn Đen M', 155000)],
  // Lazada: một listing chờ duyệt, một bị từ chối, một lệch tồn sàn
  'shp-003': [
    remote('shp-003', 1, 'prd-002-v1', 'Quần kaki ống suông size M', 320000),
    remote('shp-003', 2, 'prd-002-v2', 'Quần kaki ống suông size L', 320000),
    remote('shp-003', 5, 'prd-003-v1', 'Thắt lưng da bò', 250000),
    remote('shp-003', 9, 'prd-001-v3', 'Áo thun basic cổ tròn - Trắng, M', 150000),
  ],
  'shp-008': [remote('shp-008', 1, 'prd-001-v1', 'Áo thun Outlet Đen M', 120000)],
  'shp-004': [remote('shp-004', 1, 'prd-101-v1', 'Gạo ST25 túi 5kg', 180000)],
};

function listing(
  shopId: string,
  companyId: string,
  variantId: string,
  externalSkuId: string,
  pushed: number | null,
  over: Partial<MockListing> = {},
): MockListing {
  const r = remoteSkus[shopId].find((x) => x.externalSkuId === externalSkuId)!;
  return {
    id: `lst-${shopId}-${externalSkuId.split('-').pop()}`,
    companyId,
    shopId,
    variantId,
    externalProductId: r.externalProductId,
    externalSkuId: r.externalSkuId,
    status: 'live',
    rejectReason: null,
    pushError: null,
    pushAttempts: 0,
    hiddenBy: null,
    stockSync: 'synced',
    platformStock: null,
    lastPushedAt: pushed === null ? null : T0,
    lastPushedPrice: pushed,
    version: 1,
    ...over,
  };
}

export const listings: MockListing[] = [
  // prd-001-v1 đã đẩy đúng giá Shopee; prd-001-v2 đẩy giá cũ nên "Giá đã đổi, chưa đẩy"
  listing('shp-001', 'cmp-001', 'prd-001-v1', 'shp-001-sku-001', 165000),
  listing('shp-001', 'cmp-001', 'prd-001-v2', 'shp-001-sku-002', 150000),
  // TikTok cần kết nối lại: tồn chờ đẩy trong hàng chờ
  listing('shp-002', 'cmp-001', 'prd-001-v1', 'shp-002-sku-001', 150000, { stockSync: 'pending' }),
  // Ghép listing có sẵn: bán ngay, chưa đẩy giá lần nào
  listing('shp-003', 'cmp-001', 'prd-002-v1', 'shp-003-sku-001', null, {
    qcAlert: { reason: 'Mô tả thiếu thông tin chất liệu', at: '2026-10-14T07:30:00.000Z' },
  }),
  listing('shp-003', 'cmp-001', 'prd-002-v2', 'shp-003-sku-002', 320000, { status: 'under_review' }),
  listing('shp-003', 'cmp-001', 'prd-003-v1', 'shp-003-sku-005', 250000, {
    stockSync: 'error',
    platformStock: 12,
    stockSyncError: { code: 'E0506', message: 'SellerSku is locked by campaign', at: '2026-10-14T07:45:00.000Z' },
  }),
  listing('shp-003', 'cmp-001', 'prd-001-v3', 'shp-003-sku-009', 150000, {
    status: 'rejected',
    rejectReason: 'Ảnh chính có chữ và logo, vi phạm chính sách hình ảnh',
  }),
  // Gian hàng đã ngắt: listing đã gỡ, giữ để xem lại và tạo lại khi kết nối lại
  listing('shp-008', 'cmp-001', 'prd-001-v1', 'shp-008-sku-001', 120000, { status: 'delisted', platformStock: 0, delistedByDisconnect: true }),
  listing('shp-004', 'cmp-002', 'prd-101-v1', 'shp-004-sku-001', 180000),
];

/** Mã số dài 19 chữ số như product_id, sku_id của TikTok Shop; cố định theo gian hàng */
export function tiktokNumericId(shopId: string, n: number): string {
  let h = 2166136261;
  for (const ch of shopId) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return `17${String(h).padStart(10, '0')}${String(n).padStart(7, '0')}`;
}

/** Gian hàng mới kết nối qua sàn giả lập: sàn đã có sẵn vài SKU để thử bước ghép listing có sẵn */
export function seedRemoteForNewShop(shopId: string, platform?: string) {
  // Ảnh và trạng thái (§18.7.5): hai SKU có ảnh, hai SKU không (TikTok: sản phẩm thứ 51 trở đi, FREEZE, không có ảnh);
  // một SKU người bán đã tắt, một SKU chờ sàn duyệt
  const items: MockRemoteSku[] = [
    { ...remote(shopId, 1, 'prd-001-v3', 'Áo thun basic cổ tròn - Trắng, M', 149000), stock: 30, imageUrl: swatch('#64748b', 'Áo thun') },
    { ...remote(shopId, 2, 'prd-002-v1', 'Quần kaki ống suông - M', 319000), stock: 5, imageUrl: swatch('#a16207', 'Kaki') },
    { ...remote(shopId, 3, null, 'Mũ lưỡi trai (hàng cũ)', 59000, 'OLD-CAP-01'), stock: 2, imageUrl: null, status: 'inactive' },
    // SKU người bán khác SKU Commerio nhưng tên gần giống: gợi ý theo tên (§18.7.5)
    { ...remote(shopId, 4, null, 'Áo khoác gió Navy L', 289000, 'KHOAC-CU-L'), stock: 4, imageUrl: null, status: 'review' },
  ];
  // TikTok: product_id, sku_id là số dài; mỗi SKU một sản phẩm khác nhau
  remoteSkus[shopId] = platform === 'tiktok'
    ? items.map((r, i) => ({
        ...r,
        externalProductId: tiktokNumericId(shopId, 1000 + i),
        externalSkuId: tiktokNumericId(shopId, i + 1),
      }))
    : items;
}

export const oauthStates = new Map<string, MockOAuthState>();

// ---------- Danh mục sàn và ghép danh mục (FE#146, Documents/21 §18.5) ----------

/** Danh mục lá của sàn (mẫu theo cây Lazada VN); `name` là cả đường dẫn */
export interface MockMarketCategory {
  externalId: string;
  name: string;
  /** Thuộc tính bắt buộc cấp sản phẩm; `options` rỗng là nhập tự do */
  attributes: { name: string; label: string; options: string[] }[];
}

const brand = { name: 'brand', label: 'Thương hiệu', options: [] as string[] };
const material = (options: string[]) => ({ name: 'material', label: 'Chất liệu', options });
const FABRIC = ['Cotton', 'Polyester', 'Linen', 'Kaki', 'Jean', 'Len', 'Khác'];

const leaves: [string, MockMarketCategory['attributes']][] = [
  ['Thời trang nam > Áo > Áo thun', [brand, material(FABRIC), { name: 'collar_type', label: 'Kiểu cổ áo', options: ['Cổ tròn', 'Cổ tim', 'Cổ bẻ (polo)'] }]],
  ['Thời trang nam > Áo > Áo sơ mi', [brand, material(FABRIC), { name: 'sleeve_length', label: 'Độ dài tay áo', options: ['Ngắn tay', 'Dài tay'] }]],
  ['Thời trang nam > Áo > Áo polo', [brand, material(FABRIC)]],
  ['Thời trang nam > Áo khoác > Áo khoác gió', [brand, material(FABRIC)]],
  ['Thời trang nam > Quần > Quần kaki', [brand, material(FABRIC), { name: 'fit_type', label: 'Dáng quần', options: ['Ống suông', 'Ống côn', 'Slim fit'] }]],
  ['Thời trang nam > Quần > Quần jean', [brand, material(FABRIC)]],
  ['Thời trang nam > Quần > Quần short', [brand]],
  ['Thời trang nam > Đồ lót & Vớ > Vớ', [brand, { name: 'pack_size', label: 'Số đôi mỗi gói', options: [] }]],
  ['Thời trang nam > Phụ kiện > Mũ', [brand]],
  ['Thời trang nam > Phụ kiện > Thắt lưng', [brand, material(['Da thật', 'Da tổng hợp', 'Vải'])]],
  ['Thời trang nam > Phụ kiện > Ví', []],
  ['Thời trang nữ > Áo > Áo thun', [brand, material(FABRIC)]],
  ['Thời trang nữ > Áo > Áo sơ mi', [brand, material(FABRIC)]],
  ['Thời trang nữ > Váy > Váy liền', [brand, material(FABRIC)]],
  ['Thời trang nữ > Váy > Chân váy', [brand]],
  ['Thời trang nữ > Quần > Quần jean', [brand, material(FABRIC)]],
  ['Thời trang nữ > Đồ lót & Vớ > Vớ', [brand]],
  ['Túi xách & Vali > Túi nữ > Túi đeo vai', [brand, material(['Da thật', 'Da tổng hợp', 'Vải canvas'])]],
  ['Túi xách & Vali > Balo > Balo thời trang', [brand]],
  ['Giày dép nam > Giày thể thao', [brand, { name: 'shoe_size_system', label: 'Hệ size', options: ['EU', 'US', 'UK'] }]],
  ['Bách hoá online > Thực phẩm khô > Gạo', [brand, { name: 'net_weight', label: 'Khối lượng tịnh', options: [] }]],
  ['Bách hoá online > Thực phẩm khô > Mì, bún, phở ăn liền', [brand]],
  ['Sức khoẻ & Làm đẹp > Trang điểm > Môi > Son thỏi', [brand, { name: 'skin_type', label: 'Loại da phù hợp', options: ['Mọi loại da', 'Da khô', 'Da dầu'] }]],
  ['Sức khoẻ & Làm đẹp > Chăm sóc da > Sữa rửa mặt', [brand]],
  ['Đồ chơi > Đồ chơi giáo dục > Xếp hình', [brand, { name: 'age_group', label: 'Độ tuổi', options: ['0–3 tuổi', '3–6 tuổi', 'Trên 6 tuổi'] }]],
];

/** Hơn 50 danh mục để thấy BE chỉ trả 50 khi chưa gõ tìm */
export const marketCategories: MockMarketCategory[] = [
  ...leaves.map(([name, attributes], i) => ({ externalId: String(10000 + i * 7), name, attributes })),
  ...Array.from({ length: 40 }, (_, i) => ({
    externalId: String(20000 + i),
    name: `Nhà cửa & Đời sống > Đồ dùng nhà bếp > Dụng cụ ${i + 1}`,
    attributes: [brand],
  })),
];

export interface MockCategoryMap {
  companyId: string;
  shopId: string;
  categoryId: string;
  platform: string;
  externalCategoryId: string;
  attributes: Record<string, string>;
  version: number;
  updatedAt: string;
}

/** LazMall của ABC đã ghép Áo và Quần; Phụ kiện, Vớ, Sơ mi chưa ghép nên đẩy sẽ báo `category_unmapped` */
export const categoryMaps: MockCategoryMap[] = [
  {
    companyId: 'cmp-001',
    shopId: 'shp-003',
    categoryId: 'cat-ao',
    platform: 'lazada',
    externalCategoryId: '10000',
    attributes: { brand: 'ABC Fashion', material: 'Cotton', collar_type: 'Cổ tròn' },
    version: 1,
    updatedAt: '2026-10-28T03:00:00.000Z',
  },
  {
    companyId: 'cmp-001',
    shopId: 'shp-003',
    categoryId: 'cat-quan',
    platform: 'lazada',
    externalCategoryId: '10028',
    attributes: { brand: 'ABC Fashion', material: 'Kaki', fit_type: 'Ống suông' },
    version: 2,
    updatedAt: '2026-10-30T08:15:00.000Z',
  },
];
