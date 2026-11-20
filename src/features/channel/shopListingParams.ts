import type { RemoteSku } from '@/types/shop';

/** Tab của trang gian hàng (Test_UI `v-listing`) */
export const LISTING_TAB_VALUES = ['all', 'unmatched', 'pending', 'not_listed', 'stale', 'failed', 'held', 'category'] as const;
export type ListingTab = (typeof LISTING_TAB_VALUES)[number];

export interface ShopListingParams {
  tab: ListingTab;
  /** Ô tìm */
  q: string;
  /** Mã SKU sàn cần mở hộp ghép ngay */
  match: string | null;
  /** Đơn dẫn tới trang (FE#327): có thì hiện link quay lại đơn */
  from: string | null;
}

const isTab = (v: string | null): v is ListingTab => LISTING_TAB_VALUES.includes(v as ListingTab);

/** Đọc tham số trang gian hàng (FE#327); tab lạ thì về "Tất cả" */
export function readShopListingParams(sp: URLSearchParams): ShopListingParams {
  const tab = sp.get('tab');
  return {
    tab: isTab(tab) ? tab : 'all',
    q: sp.get('q') ?? '',
    match: sp.get('match') || null,
    from: sp.get('from') || null,
  };
}

/** Ghi tab, ô tìm vào URL, giữ các tham số khác; tab "Tất cả" và ô tìm rỗng thì bỏ khỏi URL */
export function writeShopListingParams(sp: URLSearchParams, next: { tab?: ListingTab; q?: string }): URLSearchParams {
  const out = new URLSearchParams(sp);
  if (next.tab !== undefined) {
    if (next.tab === 'all') out.delete('tab');
    else out.set('tab', next.tab);
  }
  if (next.q !== undefined) {
    if (next.q) out.set('q', next.q);
    else out.delete('q');
  }
  return out;
}

/** Kết quả tra `match` trong bản sao SKU sàn */
export type MatchTarget =
  | { kind: 'open'; sku: RemoteSku }
  | { kind: 'matched'; sku: RemoteSku }
  | { kind: 'pending'; sku: RemoteSku }
  | { kind: 'missing' };

export function resolveMatchTarget(items: RemoteSku[], externalSkuId: string): MatchTarget {
  const sku = items.find((r) => r.externalSkuId === externalSkuId);
  if (!sku) return { kind: 'missing' };
  if (sku.pendingMapping) return { kind: 'pending', sku };
  if (sku.matchedVariantId || sku.mode) return { kind: 'matched', sku };
  return { kind: 'open', sku };
}
