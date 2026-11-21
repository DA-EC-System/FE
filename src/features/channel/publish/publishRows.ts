/**
 * Hàm thuần của màn Đăng sản phẩm (Documents/29 bước 4, Documents/21 §18.9, Documents/25 §6.3): chọn gian hàng mặc định,
 * gộp số giá của dòng listing với kết quả tính thử, lý do một dòng chưa đăng được.
 */

import type { PriceQuoteRow, ProductListingRow, Shop, SpecStatus } from '@/types/shop';

/** Listing đang ở trên sàn hoặc đang đẩy: đăng lại không cần */
const ON_PLATFORM = new Set(['pushing', 'under_review', 'live', 'platform_hold', 'hidden']);

export const isOnPlatform = (row: Pick<ProductListingRow, 'listing'>): boolean =>
  Boolean(row.listing && ON_PLATFORM.has(row.listing.status));

/** Tóm tắt của một gian hàng ở bước chọn: bao nhiêu SKU đã ở trên sàn, thông tin sàn đủ chưa */
export interface ShopSummary {
  total: number;
  onPlatform: number;
  specStatus: SpecStatus | null;
}

export function shopSummary(rows: readonly ProductListingRow[], shopId: string): ShopSummary {
  const mine = rows.filter((r) => r.shopId === shopId);
  return {
    total: mine.length,
    onPlatform: mine.filter(isOnPlatform).length,
    specStatus: mine[0]?.specStatus ?? null,
  };
}

/**
 * Gian hàng chọn sẵn khi mở màn: `?shops=` nếu có; không thì `?platform=` (mọi gian hàng dùng được của sàn đó); không
 * nữa thì mọi gian hàng dùng được còn SKU chưa lên sàn
 */
export function initialSelection(
  usable: readonly Pick<Shop, 'id' | 'platform'>[],
  rows: readonly ProductListingRow[],
  params: { shops: string | null; platform: string | null },
): Set<string> {
  const ids = new Set(usable.map((s) => s.id));
  if (params.shops) {
    const picked = params.shops.split(',').filter((id) => ids.has(id));
    if (picked.length) return new Set(picked);
  }
  if (params.platform) {
    const picked = usable.filter((s) => s.platform === params.platform).map((s) => s.id);
    if (picked.length) return new Set(picked);
  }
  return new Set(
    usable
      .filter((s) => {
        const sum = shopSummary(rows, s.id);
        return sum.total === 0 || sum.onPlatform < sum.total;
      })
      .map((s) => s.id),
  );
}

/** Sàn của các gian hàng đã chọn, giữ thứ tự xuất hiện */
export function selectedPlatforms(shops: readonly Pick<Shop, 'id' | 'platform'>[], selected: ReadonlySet<string>): string[] {
  return [...new Set(shops.filter((s) => selected.has(s.id)).map((s) => s.platform))];
}

/** Số giá đang hiện của một dòng: kết quả tính thử nếu người bán đã gõ giá, không thì số BE tính sẵn ở `ListingRow` */
export interface PriceView {
  listPrice: number | null;
  netReceived: number | null;
  belowFloor: boolean | null;
  feeWarning: 'over_50' | null;
  marginPct: number | null;
  /** Mã chặn của tính thử (`fee_not_configured`, `price_missing`, `fee_config_invalid`) */
  blockedCode: string | null;
}

export function priceView(row: ProductListingRow, quote: PriceQuoteRow | undefined): PriceView {
  if (quote) {
    return {
      listPrice: quote.listPrice,
      netReceived: quote.netReceived,
      belowFloor: quote.belowFloor,
      feeWarning: quote.feeWarning,
      marginPct: quote.marginPct ?? null,
      blockedCode: quote.blocked?.code ?? null,
    };
  }
  return {
    listPrice: row.price,
    netReceived: row.netReceived,
    belowFloor: row.belowFloor,
    feeWarning: row.feeWarning,
    marginPct: null,
    // §18.6.7: gian hàng chưa có cấu hình phí thì ba số null
    blockedCode: row.price === null ? 'price_missing' : row.netReceived === null ? 'fee_not_configured' : null,
  };
}

/** Phí và thuế trên giá niêm yết (Documents/21 §18.9 R1: FE tự tính); null khi thiếu số */
export function feePct(view: Pick<PriceView, 'listPrice' | 'netReceived'>): number | null {
  if (!view.listPrice || view.netReceived === null) return null;
  return (view.listPrice - view.netReceived) / view.listPrice;
}

/** Lý do một dòng chưa đăng được ở bước xem trước; null là đăng được */
export function rowBlocker(view: PriceView, platformReady: boolean): string | null {
  if (!platformReady) return 'Còn thiếu thông tin của sàn';
  switch (view.blockedCode) {
    case 'price_missing':
      return 'Chưa có giá bán';
    case 'fee_not_configured':
      return 'Gian hàng chưa có cấu hình phí';
    case 'fee_config_invalid':
      return 'Cấu hình phí của gian hàng không hợp lệ';
    default:
      break;
  }
  if (view.listPrice === null) return 'Chưa có giá bán';
  if (view.belowFloor) return 'Dưới giá thấp nhất';
  return null;
}

/** Chữ của ô "Tồn sẽ đẩy" (Documents/21 §18.9 R3, cùng nghĩa với `match-preview`); không chặn đăng */
export function stockToPushText(row: Pick<ProductListingRow, 'stockToPush' | 'stockHeldReason'>): string {
  if (row.stockToPush !== null) return row.stockToPush.toLocaleString('vi-VN');
  if (row.stockHeldReason === 'shop_waiting_opening') return 'Chờ kiểm kê lần đầu';
  if (row.stockHeldReason === 'not_counted') return 'Chưa có số tồn';
  return '—';
}

/** Giá từ–đến của một sản phẩm trên một sàn, cho thẻ xem trước */
export function priceRange(prices: readonly (number | null)[]): { min: number; max: number } | null {
  const xs = prices.filter((p): p is number => p !== null);
  if (!xs.length) return null;
  return { min: Math.min(...xs), max: Math.max(...xs) };
}
