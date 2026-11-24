import type { ProductListItem, ProductShopCoverage } from '@/types/catalog';
import { platformLabel } from '@/lib/platforms';

/**
 * Cột độ phủ sàn ở danh sách sản phẩm (FE#464, commerio-backend#591): "TikTok Shop ✓ · Lazada còn 4". Hàm thuần, không
 * gọi API.
 */
export interface CoveragePart {
  shopId: string;
  platform: string;
  /** Tên sàn; sàn có nhiều gian hàng thì dùng tên gian hàng cho khỏi nhầm */
  label: string;
  /** 0 là đủ ("✓") */
  missing: number;
}

/** Giữ thứ tự BE trả (gian hàng cũ trước). Rỗng khi BE chưa trả trường này, người xem không có quyền, chưa có gian hàng */
export function coverageParts(coverage: readonly ProductShopCoverage[] | undefined): CoveragePart[] {
  if (!coverage?.length) return [];
  const perPlatform = new Map<string, number>();
  for (const c of coverage) perPlatform.set(c.platform, (perPlatform.get(c.platform) ?? 0) + 1);
  return coverage.map((c) => ({
    shopId: c.shopId,
    platform: c.platform,
    label: (perPlatform.get(c.platform) ?? 0) > 1 ? c.shopName : platformLabel(c.platform),
    missing: c.missing,
  }));
}

/** Hiện cột khi ít nhất một dòng của trang có độ phủ (BE chưa deploy #591 hoặc người xem không có quyền thì ẩn cột) */
export const hasCoverageColumn = (items: readonly Pick<ProductListItem, 'channelCoverage'>[]) =>
  items.some((i) => Boolean(i.channelCoverage?.length));

/** Chữ của một phần: "Lazada ✓", "Lazada còn 4" */
export const coverageText = (p: CoveragePart) => (p.missing > 0 ? `${p.label} còn ${p.missing}` : `${p.label} ✓`);
