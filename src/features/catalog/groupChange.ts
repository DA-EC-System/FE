import type { AllowedAttribute, ProductDetail } from '@/types/catalog';
import { isEmptySpec, type SpecDrafts } from './specs/specValues';
import { productAxes } from './valueImages';

export interface GroupChangeNotice {
  /** Tên thuộc tính biến thể đang có mà danh mục mới không gợi ý */
  axes: string[];
  /** Tên thuộc tính sản phẩm đang điền sẽ sang mục "Thuộc tính khác" */
  moving: string[];
}

const same = (a: string, b: string) => a.trim().toLocaleLowerCase('vi') === b.trim().toLocaleLowerCase('vi');

/**
 * Báo trước khi lưu đổi danh mục ở trang Sửa sản phẩm (FE#474). Trục của sản phẩm không đổi theo danh mục (BE không có
 * route đổi trục); danh sách thuộc tính biến thể rỗng hoặc chưa có là danh mục chưa giới hạn, không báo
 */
export function groupChangeNotice(
  axes: readonly { attributeId: string | null; name: string }[],
  allowed: readonly AllowedAttribute[] | undefined,
  moving: readonly string[],
): GroupChangeNotice {
  const outside = allowed?.length
    ? axes
        .filter((a) => a.name.trim())
        .filter((a) => !allowed.some((x) => (a.attributeId ? x.attributeId === a.attributeId : same(x.name, a.name))))
        .map((a) => a.name.trim())
    : [];
  return { axes: outside, moving: [...moving] };
}

/** Câu báo trục; null khi không có trục nào ngoài danh sách */
export function axesNoticeText(names: readonly string[]): string | null {
  return names.length ? `Thuộc tính biến thể ${names.join(', ')} không có trong danh mục mới. Sản phẩm giữ nguyên.` : null;
}

/** Câu báo thuộc tính sản phẩm chuyển mục; null khi không có */
export function movingNoticeText(names: readonly string[]): string | null {
  return names.length ? `${names.length} thuộc tính sẽ chuyển sang Thuộc tính khác: ${names.join(', ')}.` : null;
}

/** Trục của sản phẩm tính theo biến thể chưa lưu trữ; biến thể đã lưu trữ không còn bán nên không báo */
export function liveAxes(p: Pick<ProductDetail, 'variants'>) {
  return productAxes({ variants: p.variants.filter((v) => v.businessStatus !== 'archived') });
}

/**
 * Thuộc tính đang có giá trị trong form sẽ sang "Thuộc tính khác": gồm thuộc tính của danh mục cũ và thuộc tính vừa điền
 * ở danh mục chọn tạm. Bỏ thuộc tính vốn đã nằm ở "Thuộc tính khác" lúc lưu, vì chúng không chuyển mục
 */
export function movingSpecNames(
  others: readonly { fieldId: string; name: string }[],
  drafts: SpecDrafts,
  saved: readonly { fieldId: string; inTemplate: boolean }[],
): string[] {
  return others
    .filter((v) => !isEmptySpec(drafts[v.fieldId]))
    .filter((v) => !saved.some((s) => s.fieldId === v.fieldId && !s.inTemplate))
    .map((v) => v.name);
}
