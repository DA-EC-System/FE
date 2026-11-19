import type { ListingRow } from '@/types/shop';
import type { MatchOption } from './MatchDialog';

/** Mục "Không quản tồn" trong hộp ghép mở từ SKU sàn */
export const UNMANAGED = '__unmanaged__';

/** Biến thể có listing đã gỡ: gỡ là trạng thái cuối, ghép SKU sàn khác thì BE tạo listing mới (commerio-backend `variantSlot`) */
export const isDelisted = (r: ListingRow) => r.listing?.status === 'delisted';

/** Chữ thường, bỏ dấu, tách theo ký tự không phải chữ/số. Giữ từ một ký tự vì size (S, M, L) phân biệt biến thể */
function words(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Điểm khi SKU người bán trùng hẳn SKU biến thể */
export const EXACT_SKU_SCORE = 1000;
/** Số từ trùng tối thiểu để gắn "Gợi ý" khi không trùng SKU */
const MIN_WORDS_SUGGEST = 2;

/**
 * Độ giống giữa SKU sàn và một biến thể (FE#326): SKU người bán trùng SKU biến thể là cao nhất, sau đó là số từ trong tên
 * trên sàn có ở tên sản phẩm, thuộc tính hoặc SKU biến thể. 0 là không giống
 */
export function matchScore(
  remote: { title: string; sellerSku: string | null },
  variant: { name: string; sku: string },
): number {
  if (remote.sellerSku && remote.sellerSku.trim().toLowerCase() === variant.sku.trim().toLowerCase()) return EXACT_SKU_SCORE;
  const target = new Set([...words(variant.name), ...words(variant.sku)]);
  return [...new Set([...words(remote.title), ...words(remote.sellerSku ?? '')])].filter((w) => target.has(w)).length;
}

/**
 * Xếp theo điểm giảm dần, giữ thứ tự cũ khi bằng điểm. Xếp hạng tách khỏi gợi ý: hộp ghép chọn sẵn mục "Gợi ý" nên chỉ gắn
 * khi chắc, tức trùng hẳn SKU người bán, hoặc một mục duy nhất có điểm cao nhất và trùng ít nhất `MIN_WORDS_SUGGEST` từ.
 * Hoà điểm thì không gợi ý, để người dùng tự chọn (tránh chọn sẵn nhầm size)
 */
export function rankByScore<T>(list: T[], score: (x: T) => number): { item: T; suggested: boolean }[] {
  const scored = list.map((item, i) => ({ item, s: score(item), i })).sort((a, b) => b.s - a.s || a.i - b.i);
  const best = scored[0]?.s ?? 0;
  const unique = scored.filter((x) => x.s === best).length === 1;
  return scored.map(({ item, s }) => ({
    item,
    suggested: s === best && (best >= EXACT_SKU_SCORE || (unique && best >= MIN_WORDS_SUGGEST)),
  }));
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
    ...(current ? [{ id: current.variantId, title: `${name(current)} (đang liên kết)`, subtitle: current.sku, suggested: false }] : []),
    ...ranked.map(({ item: r, suggested }) => ({
      id: r.variantId,
      title: name(r),
      subtitle: isDelisted(r) ? `${r.sku} · Đã gỡ khỏi sàn` : r.sku,
      suggested,
    })),
  ];
  return [
    ...variants,
    {
      id: UNMANAGED,
      title: 'Không quản lý tồn',
      subtitle: isCeo
        ? 'Đơn của SKU sàn này không trừ tồn SKU kho nào. Áp ngay (ghi là tự duyệt)'
        : 'Đơn của SKU sàn này không trừ tồn SKU kho nào. Cần CEO duyệt',
      suggested: false,
    },
  ];
}
