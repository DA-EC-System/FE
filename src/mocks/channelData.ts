/**
 * Dữ liệu giả channel.* cho MSW: ghép SKU (channel.channel_listings) và SKU đang có trên sàn.
 * SKU trên sàn là dữ liệu của sàn, BE lấy qua API sàn; mock giữ theo gian hàng.
 */

import { products } from './catalogData';
import type { ListingStatus, QcAlert, SyncError, SyncState } from '@/types/shop';

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

/** Gian hàng mới kết nối qua sàn giả lập: sàn đã có sẵn vài SKU để thử bước ghép listing có sẵn */
export function seedRemoteForNewShop(shopId: string) {
  remoteSkus[shopId] = [
    { ...remote(shopId, 1, 'prd-001-v3', 'Áo thun basic cổ tròn - Trắng, M', 149000), stock: 30 },
    { ...remote(shopId, 2, 'prd-002-v1', 'Quần kaki ống suông - M', 319000), stock: 5 },
    { ...remote(shopId, 3, null, 'Mũ lưỡi trai (hàng cũ)', 59000, 'OLD-CAP-01'), stock: 2 },
  ];
}

export const oauthStates = new Map<string, MockOAuthState>();
