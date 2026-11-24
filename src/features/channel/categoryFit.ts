/** Category có nhận đủ thuộc tính biến thể của sản phẩm không, để bộ chọn category làm mờ và đưa xuống cuối (FE#459) */
export interface CategoryFit {
  /** Không nhận đủ và không ghép được: làm mờ, xếp cuối (vẫn chọn được) */
  dim: boolean;
  note: string;
}

/**
 * Luật ở bộ chọn category (Documents/21 §18.10): `maxAxes` nhỏ hơn số thuộc tính biến thể của sản phẩm mà không ghép được
 * thì làm mờ, ghi "Chỉ nhận {maxAxes} thuộc tính biến thể"; ghép được thì không mờ, ghi Commerio ghép những thuộc tính
 * biến thể nào. `maxAxes` null (chưa lấy attribute của leaf, BE cũ) thì không ghi gì.
 */
export function categoryFit(
  category: { maxAxes?: number | null; combinable?: boolean | null },
  axisNames: readonly string[],
): CategoryFit | null {
  const max = category.maxAxes;
  if (max === null || max === undefined || axisNames.length <= max) return null;
  if (category.combinable) {
    return { dim: false, note: `Nhận ${max} thuộc tính biến thể, Commerio ghép ${axisNames.join(', ')}` };
  }
  return { dim: true, note: `Chỉ nhận ${max} thuộc tính biến thể` };
}

/** Đưa category bị làm mờ xuống cuối, giữ thứ tự còn lại */
export function sortByFit<T extends { maxAxes?: number | null; combinable?: boolean | null }>(items: readonly T[], axisNames: readonly string[]): T[] {
  const dim = (c: T) => Boolean(categoryFit(c, axisNames)?.dim);
  return [...items.filter((c) => !dim(c)), ...items.filter(dim)];
}
