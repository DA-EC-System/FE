/**
 * Bảng giá của công ty đang chọn (UC-CP-03, QT-12; commerio-backend#15).
 * ERD pricing.*: mỗi công ty một bảng giá chuẩn; bảng giá theo kênh gắn với một gian hàng (D15).
 * Giá là số nguyên đồng, không âm.
 */

import type { Marketplace } from './shop';

export type PricelistType = 'standard' | 'channel';

export interface PricelistShop {
  id: string;
  shopName: string;
  platform: Marketplace;
}

export interface Pricelist {
  id: string;
  name: string;
  type: PricelistType;
  /** Chỉ bảng giá theo kênh có */
  shop: PricelistShop | null;
  /** Số biến thể đang bán đã có giá trong bảng này */
  pricedCount: number;
  /** Số biến thể đang bán của công ty */
  variantCount: number;
  version: number;
  updatedAt: string;
}

/** Một dòng trên lưới giá: biến thể đang bán của sản phẩm đang bán */
export interface PricelistItem {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  /** "Đen / M"; rỗng nếu sản phẩm không có thuộc tính */
  attributesLabel: string;
  categoryId: string;
  thumbnailUrl: string | null;
  /** null: chưa có giá trong bảng này */
  price: number | null;
  /** Giá trong bảng giá chuẩn, để so khi sửa bảng giá theo kênh */
  standardPrice: number | null;
}

export interface PricelistCreateInput {
  name: string;
  shopId: string;
  /** Chép giá của bảng giá chuẩn sang bảng mới */
  copyFromStandard: boolean;
}

export interface PricelistUpdateInput {
  name: string;
  version: number;
}

/** Lưu nhiều giá một lần; price null là bỏ giá của biến thể trong bảng này */
export interface PricelistItemsInput {
  version: number;
  items: { variantId: string; price: number | null }[];
}
