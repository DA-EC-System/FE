import type { ListingRow } from '@/types/shop';
import type { MatchOption } from './MatchDialog';

/** Mục "Không quản tồn" trong hộp ghép mở từ SKU sàn */
export const UNMANAGED = '__unmanaged__';

/** Biến thể có listing đã gỡ: gỡ là trạng thái cuối, ghép SKU sàn khác thì BE tạo listing mới (commerio-backend `variantSlot`) */
export const isDelisted = (r: ListingRow) => r.listing?.status === 'delisted';

/** Chữ thường, bỏ dấu, tách theo ký tự không phải chữ/số */
function words(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1);
}

/**
 * Độ giống giữa SKU sàn và một biến thể (FE#326): SKU người bán trùng SKU biến thể là cao nhất, sau đó là số từ trong tên
 * trên sàn có ở tên sản phẩm, thuộc tính hoặc SKU biến thể. 0 là không giống
 */
export function matchScore(
  remote: { title: string; sellerSku: string | null },
  variant: { name: string; sku: string },
): number {
  if (remote.sellerSku && remote.sellerSku.trim().toLowerCase() === variant.sku.trim().toLowerCase()) return 1000;
  const target = new Set([...words(variant.name), ...words(variant.sku)]);
  return [...new Set([...words(remote.title), ...words(remote.sellerSku ?? '')])].filter((w) => target.has(w)).length;
}

/** Xếp theo điểm giảm dần, giữ thứ tự cũ khi bằng điểm; mục điểm cao nhất (lớn hơn 0) là gợi ý */
export function rankByScore<T>(list: T[], score: (x: T) => number): { item: T; suggested: boolean }[] {
  const scored = list.map((item, i) => ({ item, s: score(item), i })).sort((a, b) => b.s - a.s || a.i - b.i);
  const best = scored[0]?.s ?? 0;
  return scored.map(({ item, s }) => ({ item, suggested: best > 0 && s === best }));
}

/**
 * Lựa chọn khi ghép từ SKU sàn (FE#310): biến thể chưa có listing, biến thể có listing đã gỡ (kèm chữ "Đã gỡ"), biến thể
 * đang ghép với chính SKU này (đổi ghép), cuối cùng là "Không quản tồn". CEO áp ngay "Không quản tồn", vai trò khác chờ CEO.
 * Thứ tự (FE#326): biến thể đang ghép đứng đầu kèm "(đang ghép)", rồi theo độ giống tên/SKU với SKU sàn (`matchScore`).
 */
export function variantMatchOptions(
  items: ListingRow[],
  {
    title = '',
    sellerSku,
    currentVariantId,
    isCeo,
  }: { title?: string; sellerSku: string | null; currentVariantId?: string; isCeo: boolean },
): MatchOption[] {
  const name = (r: ListingRow) => [r.productName, r.attributesLabel].filter(Boolean).join(' · ');
  const candidates = items.filter((r) => (!r.listing || isDelisted(r)) && r.variantId !== currentVariantId);
  const current = items.find((r) => r.variantId === currentVariantId);
  const ranked = rankByScore(candidates, (r) => matchScore({ title, sellerSku }, { name: name(r), sku: r.sku }));
  const variants: MatchOption[] = [
    ...(current ? [{ id: current.variantId, title: `${name(current)} (đang ghép)`, subtitle: current.sku, suggested: false }] : []),
    ...ranked.map(({ item: r, suggested }) => ({
      id: r.variantId,
      title: name(r),
      subtitle: isDelisted(r) ? `${r.sku} · Đã gỡ` : r.sku,
      suggested,
    })),
  ];
  return [
    ...variants,
    {
      id: UNMANAGED,
      title: 'Không quản tồn',
      subtitle: isCeo
        ? 'Đơn của SKU sàn này không trừ tồn biến thể nào. Áp ngay (ghi là tự duyệt)'
        : 'Đơn của SKU sàn này không trừ tồn biến thể nào. Cần CEO duyệt',
      suggested: false,
    },
  ];
}
