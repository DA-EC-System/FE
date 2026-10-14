/**
 * Shop (Channel) types — khớp với channel.shops trong DBML.
 * Mỗi shop là một gian hàng kết nối sàn thuộc về một company.
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
  lastOrderSyncAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShopCreateInput {
  companyId: string;
  platform: Marketplace;
  externalShopId: string;
  shopName: string;
  region: string;
  status: ShopStatus;
}

export type ShopUpdateInput = Partial<Omit<ShopCreateInput, 'companyId'>>;
