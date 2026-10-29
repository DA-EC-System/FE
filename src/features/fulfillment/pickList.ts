import type { FulfillmentLine, PickListLine } from '@/types/fulfillment';

/**
 * Gộp dòng hàng của các kiện cần nhặt theo biến thể, sắp theo SKU.
 * BE tự gộp; mock dùng chung hàm này để hai bên ra cùng kết quả.
 */
export function buildPickList(packages: { lines: FulfillmentLine[] }[]): PickListLine[] {
  const byVariant = new Map<string, PickListLine>();
  for (const pkg of packages) {
    const seen = new Set<string>();
    for (const line of pkg.lines) {
      const row = byVariant.get(line.variantId);
      if (row) {
        row.quantity += line.quantity;
        if (!seen.has(line.variantId)) row.packageCount += 1;
      } else {
        byVariant.set(line.variantId, { ...line, packageCount: 1 });
      }
      seen.add(line.variantId);
    }
  }
  return [...byVariant.values()].sort((a, b) => a.sku.localeCompare(b.sku));
}
