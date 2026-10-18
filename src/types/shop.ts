/**
 * Shop (Channel) types — khớp với channel.shops, channel.channel_listings trong DBML.
 * Mỗi shop là một gian hàng kết nối sàn thuộc về một company (UC-CH-01, UC-CH-02).
 * Hợp đồng API đề xuất ở FE#8, chờ commerio-backend#19 chốt.
 */

export type Marketplace = 'tiktok' | 'shopee' | 'lazada' | 'mock';

export type ShopStatus =
  | 'connected'
  | 'expiring'
  | 'deauthorized'
  | 'disconnected';

export interface Shop {
  id: string;
  companyId: string;
  platform: Marketplace;
  externalShopId: string;
  shopName: string;
  region: string;
  status: ShopStatus;
  /** Hạn của access token sàn; null khi đã ngắt */
  accessExpiresAt: string | null;
  lastOrderSyncAt?: string;
  /** Số biến thể đã ghép SKU sàn */
  listingCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Bắt đầu OAuth; shopId khi kết nối lại một gian hàng đã có */
export interface ShopConnectInput {
  platform: Marketplace;
  shopId?: string;
}

export interface ShopCallbackInput {
  code: string;
  state: string;
}

export interface ShopCallbackResult {
  shop: Shop;
  /** false: gian hàng đã có, chỉ cấp lại token */
  created: boolean;
}

/** channel.channel_listings: biến thể đã ghép với SKU trên sàn */
export interface ChannelListing {
  id: string;
  externalProductId: string;
  externalSkuId: string;
  /** SKU người bán đặt trên sàn */
  sellerSku: string;
  lastPushedAt: string | null;
  lastPushedPrice: number | null;
  version: number;
}

/** Một dòng màn hình ghép: biến thể đang bán kèm giá theo gian hàng và SKU sàn đã ghép */
export interface ListingRow {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  /** "Đen / M"; rỗng nếu sản phẩm không có thuộc tính */
  attributesLabel: string;
  thumbnailUrl: string | null;
  /** Giá sẽ đẩy: bảng giá gian hàng, thiếu thì lấy giá chuẩn (G5) */
  price: number | null;
  priceSource: 'shop' | 'standard' | null;
  listing: ChannelListing | null;
}

/** SKU đang có trên sàn, BE lấy từ API của sàn */
export interface RemoteSku {
  externalProductId: string;
  externalSkuId: string;
  title: string;
  sellerSku: string;
  price: number;
  /** Biến thể đã ghép với SKU này; null là chưa ghép */
  matchedVariantId: string | null;
}

export interface ListingMatchInput {
  externalSkuId: string;
  /** version của ghép hiện có; null khi ghép mới */
  version: number | null;
}

export interface PushResult {
  variantId: string;
  sku: string;
  outcome: 'updated' | 'created' | 'failed';
  externalSkuId?: string;
  code?: string;
  message?: string;
}
