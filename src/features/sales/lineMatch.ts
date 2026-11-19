import type { PackageSummary } from '@/types/fulfillment';
import type { OrderLine } from '@/types/sales';
import type { PendingMapping, RemoteSku } from '@/types/shop';

/** Ghi chú Cần xử lý BE đặt cho kiện đã đóng khi đổi ghép SKU (spec commerio-backend#237 §5.5, `REMAP_UNLOAD_NOTE`) */
export const REMAP_UNLOAD_NOTE = 'Đổi ghép SKU: dỡ kiện về kệ để áp ghép mới';

/** Dòng sàn chưa ghép (cờ Chưa ghép SKU): không biến thể, không "không quản tồn" (21 §19.1) */
export const isUnmappedLine = (l: Pick<OrderLine, 'externalSku' | 'variantId' | 'untracked'>) =>
  Boolean(l.externalSku) && !l.variantId && !l.untracked;

/** SKU trên sàn của dòng đơn: theo `sku_id` khi có, không thì theo SKU người bán */
export function remoteSkuOf(items: RemoteSku[] | undefined, l: Pick<OrderLine, 'externalSkuId' | 'externalSku'>) {
  if (!items) return undefined;
  return (
    (l.externalSkuId ? items.find((r) => r.externalSkuId === l.externalSkuId) : undefined) ??
    (l.externalSku ? items.find((r) => r.sellerSku === l.externalSku) : undefined)
  );
}

/** Kiện đã đóng phải dỡ về kệ để áp ghép mới: BE bật Cần xử lý kèm `REMAP_UNLOAD_NOTE` */
export const needsUnload = (p: Pick<PackageSummary, 'flags' | 'flagNote'>) =>
  p.flags.includes('needs_attention') && p.flagNote === REMAP_UNLOAD_NOTE;

/** Câu báo sau khi ghép từ dòng đơn; `pending` (202): chờ CEO duyệt, đơn giữ cờ */
export function lineMatchToast(label: string, variantSku: string | null, pending: boolean) {
  if (pending) return `Đã gửi CEO duyệt ghép SKU sàn ${label}. Đơn giữ cờ Chưa ghép SKU tới khi CEO duyệt.`;
  return variantSku
    ? `Đã ghép ${label} với ${variantSku}. Đơn đã nhận của SKU này trong gian hàng cũng được ghép.`
    : `Đã đặt SKU sàn ${label} là không quản tồn`;
}

/** Đích của ghép chờ: SKU biến thể (tra trong danh sách) hoặc "Không quản tồn" */
export const pendingTargetLabel = (p: PendingMapping, skuOf: (variantId: string) => string | undefined) =>
  p.variantId ? (skuOf(p.variantId) ?? 'biến thể khác') : 'Không quản tồn';
