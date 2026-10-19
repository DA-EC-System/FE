import type { FulfillmentLine, PickListLine } from '@/types/fulfillment';

/**
 * Gộp dòng hàng của các đơn trong lô theo biến thể, sắp theo SKU (AC-B4).
 * BE tự gộp; mock dùng chung hàm này để hai bên ra cùng kết quả.
 */
export function buildPickList(orders: { lines: FulfillmentLine[] }[]): PickListLine[] {
  const byVariant = new Map<string, PickListLine>();
  for (const order of orders) {
    const seen = new Set<string>();
    for (const line of order.lines) {
      const row = byVariant.get(line.variantId);
      if (row) {
        row.quantity += line.quantity;
        if (!seen.has(line.variantId)) row.orderCount += 1;
      } else {
        byVariant.set(line.variantId, { ...line, orderCount: 1 });
      }
      seen.add(line.variantId);
    }
  }
  return [...byVariant.values()].sort((a, b) => a.sku.localeCompare(b.sku));
}
