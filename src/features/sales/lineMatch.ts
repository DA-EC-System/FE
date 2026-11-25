import type { PackageLine, PackageSummary } from '@/types/fulfillment';
import type { Order, OrderLine } from '@/types/sales';
import { ROUTES } from '@/router/routes';
import type { PendingMapping, RemoteSku } from '@/types/shop';

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

/**
 * Kiện đã đóng phải dỡ để áp liên kết SKU mới: chờ mở và còn dòng `remapPending` (21 §19.2, commerio-backend#237 PR 2).
 * Không xét `openPurpose`: kiện chờ mở để huỷ, sửa, tách lại vẫn có thể mang dấu
 */
export const needsUnload = (p: Pick<PackageSummary, 'flags'> & { lines: readonly Pick<PackageLine, 'remapPending'>[] }) =>
  p.flags.includes('needs_open') && p.lines.some((l) => l.remapPending);

/** Câu báo sau khi ghép từ dòng đơn; `pending` (202): chờ CEO duyệt, đơn giữ cờ */
export function lineMatchToast(label: string, variantSku: string | null, pending: boolean) {
  if (pending) return `Đã gửi CEO duyệt liên kết SKU sàn ${label}. Đơn giữ cờ Chưa liên kết SKU đến khi CEO duyệt.`;
  return variantSku
    ? `Đã liên kết ${label} với ${variantSku}. Đơn đã nhận của SKU này trong gian hàng cũng được liên kết.`
    : `Đã đặt SKU sàn ${label} là không quản lý tồn`;
}

/** Đích của ghép chờ: SKU biến thể (tra trong danh sách) hoặc "Không quản tồn" */
export const pendingTargetLabel = (p: PendingMapping, skuOf: (variantId: string) => string | undefined) =>
  p.variantId ? (skuOf(p.variantId) ?? 'biến thể khác') : 'Không quản lý tồn';

/**
 * Link từ dòng Chưa ghép SKU tới trang gian hàng (FE#327): tab Chưa ghép, ô tìm có SellerSku, tự mở hộp ghép SKU sàn đó,
 * nhớ đơn để quay lại. Đơn tạo tay, không có gian hàng, gian hàng đã ngắt thì không có link
 */
export function lineShopHref(
  companyId: string,
  order: Pick<Order, 'id' | 'source' | 'shop' | 'flags'>,
  l: Pick<OrderLine, 'externalSku' | 'externalSkuId' | 'variantId' | 'untracked'>,
): string | null {
  if (order.source === 'manual' || !order.shop || order.flags.includes('shop_disconnected')) return null;
  if (!isUnmappedLine(l)) return null;
  const q = new URLSearchParams({ tab: 'unmatched', q: l.externalSku || l.externalSkuId || '' });
  if (l.externalSkuId) q.set('match', l.externalSkuId);
  q.set('from', order.id);
  return `${ROUTES.company.shop(companyId, order.shop.id)}?${q.toString()}`;
}
