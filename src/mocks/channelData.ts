/**
 * Dữ liệu giả channel.* cho MSW: ghép SKU (channel.channel_listings) và SKU đang có trên sàn.
 * SKU trên sàn là dữ liệu của sàn, BE lấy qua API sàn; mock giữ theo gian hàng.
 */

import { products } from './catalogData';

export interface MockListing {
  id: string;
  companyId: string;
  shopId: string;
  variantId: string;
  externalProductId: string;
  externalSkuId: string;
  lastPushedAt: string | null;
  lastPushedPrice: number | null;
  /** Đang ẩn trên sàn vì SKU tạm ngừng (FE#57) */
  hidden: boolean;
  version: number;
}

export interface MockRemoteSku {
  externalProductId: string;
  externalSkuId: string;
  title: string;
  sellerSku: string;
  price: number;
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
  'shp-003': [
    remote('shp-003', 1, 'prd-002-v1', 'Quần kaki ống suông size M', 320000),
    remote('shp-003', 2, 'prd-002-v2', 'Quần kaki ống suông size L', 320000),
  ],
  'shp-008': [remote('shp-008', 1, 'prd-001-v1', 'Áo thun Outlet Đen M', 120000)],
  'shp-004': [remote('shp-004', 1, 'prd-101-v1', 'Gạo ST25 túi 5kg', 180000)],
};

function listing(
  shopId: string,
  companyId: string,
  variantId: string,
  n: number,
  pushed: number | null,
): MockListing {
  const r = remoteSkus[shopId][n - 1];
  return {
    id: `lst-${shopId}-${n}`,
    companyId,
    shopId,
    variantId,
    externalProductId: r.externalProductId,
    externalSkuId: r.externalSkuId,
    lastPushedAt: pushed === null ? null : T0,
    lastPushedPrice: pushed,
    hidden: false,
    version: 1,
  };
}

export const listings: MockListing[] = [
  // prd-001-v1 đã đẩy đúng giá Shopee; prd-001-v2 đẩy giá cũ nên "Giá đã đổi, chưa đẩy"
  listing('shp-001', 'cmp-001', 'prd-001-v1', 1, 165000),
  listing('shp-001', 'cmp-001', 'prd-001-v2', 2, 150000),
  listing('shp-002', 'cmp-001', 'prd-001-v1', 1, 150000),
  listing('shp-003', 'cmp-001', 'prd-002-v1', 1, null),
  listing('shp-008', 'cmp-001', 'prd-001-v1', 1, 120000),
  listing('shp-004', 'cmp-002', 'prd-101-v1', 1, 180000),
];

export const oauthStates = new Map<string, MockOAuthState>();
