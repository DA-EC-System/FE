import type { ListingRow } from '@/types/shop';
import type { MatchOption } from './MatchDialog';

/** Mục "Không quản tồn" trong hộp ghép mở từ SKU sàn */
export const UNMANAGED = '__unmanaged__';

/** Biến thể có listing đã gỡ: gỡ là trạng thái cuối, ghép SKU sàn khác thì BE tạo listing mới (commerio-backend `variantSlot`) */
export const isDelisted = (r: ListingRow) => r.listing?.status === 'delisted';

/**
 * Lựa chọn khi ghép từ SKU sàn (FE#310): biến thể chưa có listing, biến thể có listing đã gỡ (kèm chữ "Đã gỡ"), biến thể
 * đang ghép với chính SKU này (đổi ghép), cuối cùng là "Không quản tồn". CEO áp ngay "Không quản tồn", vai trò khác chờ CEO.
 */
export function variantMatchOptions(
  items: ListingRow[],
  { sellerSku, currentVariantId, isCeo }: { sellerSku: string | null; currentVariantId?: string; isCeo: boolean },
): MatchOption[] {
  const variants = items
    .filter((r) => !r.listing || isDelisted(r) || r.variantId === currentVariantId)
    .map((r) => ({
      id: r.variantId,
      title: [r.productName, r.attributesLabel].filter(Boolean).join(' · '),
      subtitle: isDelisted(r) && r.variantId !== currentVariantId ? `${r.sku} · Đã gỡ` : r.sku,
      suggested: Boolean(sellerSku) && sellerSku === r.sku,
    }));
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
