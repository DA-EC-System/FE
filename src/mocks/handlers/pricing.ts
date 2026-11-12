import { db } from '../db';
import * as pricing from '../pricingData';
import type { MockPricelist } from '../pricingData';
import { companyProducts, rid } from './catalog';

// ---------- Giá trong mock ----------
// Trang và API bảng giá đã bỏ (D9, FE#154). Giá chuẩn của biến thể vẫn nằm trong `pricingData`
// vì đơn hàng, kênh bán, kho đọc giá từ đó.

/** Mỗi công ty luôn có một bảng giá chuẩn (tạo cùng công ty) */
export function ensureStandard(companyId: string): MockPricelist {
  let standard = pricing.pricelists.find((p) => p.companyId === companyId && p.type === 'standard');
  if (!standard) {
    standard = {
      id: rid('pl'),
      companyId,
      name: 'Bảng giá chuẩn',
      type: 'standard',
      shopId: null,
      prices: {},
      version: 1,
      updatedAt: db.now(),
    };
    pricing.pricelists.unshift(standard);
  }
  return standard;
}

/** Biến thể đang bán của sản phẩm đang bán */
export function sellableVariants(companyId: string) {
  return companyProducts(companyId)
    .filter((p) => !p.archivedAt)
    .flatMap((p) => p.variants.filter((v) => !v.archivedAt).map((v) => ({ product: p, variant: v })));
}

export function skuOf(companyId: string, variantId: string) {
  for (const p of companyProducts(companyId)) {
    const v = p.variants.find((x) => x.id === variantId);
    if (v) return v.sku;
  }
  return variantId;
}
