import type { ProductDetail } from '@/types/catalog';

export interface ProductAxisView {
  attributeId: string;
  name: string;
  /** Giá trị mà ít nhất một SKU (kể cả đã lưu trữ) đang mang, theo thứ tự gặp */
  values: { id: string; value: string }[];
}

/** Trục phân loại của sản phẩm suy từ thuộc tính của các SKU (ảnh phân loại chỉ gắn được vào giá trị có SKU dùng, §17.2) */
export function productAxes(p: Pick<ProductDetail, 'variants'>): ProductAxisView[] {
  const axes = new Map<string, ProductAxisView>();
  for (const v of p.variants) {
    for (const a of v.attributes) {
      const axis = axes.get(a.attributeId) ?? { attributeId: a.attributeId, name: a.attributeName, values: [] };
      if (!axis.values.some((x) => x.id === a.valueId)) axis.values.push({ id: a.valueId, value: a.value });
      axes.set(a.attributeId, axis);
    }
  }
  return [...axes.values()];
}
