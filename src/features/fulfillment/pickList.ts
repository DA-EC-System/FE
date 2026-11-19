import type { FulfillmentLine, PickList, PickListLine } from '@/types/fulfillment';

/**
 * Gộp dòng hàng của các kiện cần nhặt theo biến thể; chưa ghép, "không quản tồn" gộp riêng theo SKU sàn; sắp theo SKU.
 * BE tự gộp; mock dùng chung hàm này để hai bên ra cùng kết quả.
 */
export function buildPickList(packages: { lines: FulfillmentLine[] }[], limit = packages.length): PickList {
  const byVariant = new Map<string, PickListLine>();
  for (const pkg of packages.slice(0, limit)) {
    const seen = new Set<string>();
    for (const line of pkg.lines) {
      const key = line.variantId ? `variant:${line.variantId}` : `${line.untracked ? 'untracked' : 'sku'}:${line.sku}`;
      const row = byVariant.get(key);
      if (row) {
        row.quantity += line.quantity;
        if (!seen.has(key)) row.packageCount += 1;
      } else {
        const { variantId, untracked, sku, productName, attributesLabel, quantity } = line;
        byVariant.set(key, { variantId, untracked, sku, productName, attributesLabel, quantity, packageCount: 1 });
      }
      seen.add(key);
    }
  }
  return {
    items: [...byVariant.values()].sort((a, b) => a.sku.localeCompare(b.sku)),
    packageCount: Math.min(packages.length, limit),
    truncated: packages.length > limit,
  };
}
