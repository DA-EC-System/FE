import { renderSku, valueCode } from '@/utils/sku';
import type { Attribute, ProductAxis, ProductSettings } from '@/types/catalog';
import { cartesian } from './shared';

/**
 * Nhóm phân loại khi tạo sản phẩm kiểu seller center (FE#350 phần 3, Documents/21 §5.2 `POST /catalog/products`):
 * chọn thuộc tính có sẵn hoặc gõ tên mới, gõ giá trị rồi Enter. Luật theo Lazada: tối đa 2 nhóm, tên ≤ 15 ký tự, giá trị
 * ≤ 20 ký tự, ≤ 50 giá trị mỗi nhóm, không trùng (không phân biệt hoa thường).
 */
export const MAX_AXES = 2;
export const MAX_AXIS_NAME = 15;
export const MAX_AXIS_VALUE = 20;
export const MAX_AXIS_VALUES = 50;
export const MAX_VARIANTS = 100;

export interface AxisDraft {
  /** Khoá React, không gửi lên */
  key: string;
  /** Thuộc tính có sẵn đã chọn; null là tên tự đặt (tạo mới khi lưu) */
  attributeId: string | null;
  name: string;
  /** Chữ giá trị theo thứ tự người dùng thêm */
  values: string[];
}

export interface VariantDraft {
  axes: AxisDraft[];
  /** Tổ hợp bỏ tick, khoá `comboId` */
  excluded: string[];
}

export const emptyDraft: VariantDraft = { axes: [], excluded: [] };

const fold = (s: string) => s.trim().toLocaleLowerCase('vi');
export const sameText = (a: string, b: string) => fold(a) === fold(b);
export const comboId = (options: string[]) => options.map(fold).join('|');

/** Thuộc tính có sẵn của nhóm: theo `attributeId`, hoặc trùng tên với tên gõ tay */
export function axisAttribute(axis: AxisDraft, attributes: Attribute[]): Attribute | undefined {
  return axis.attributeId
    ? attributes.find((a) => a.id === axis.attributeId)
    : attributes.find((a) => sameText(a.name, axis.name));
}

/** Lỗi khi thêm một giá trị vào nhóm, null nếu thêm được */
export function valueError(axis: AxisDraft, text: string): string | null {
  const value = text.trim();
  if (!value) return 'Nhập giá trị';
  if (value.length > MAX_AXIS_VALUE) return `Mỗi giá trị tối đa ${MAX_AXIS_VALUE} ký tự`;
  if (axis.values.some((v) => sameText(v, value))) return `Đã có giá trị ${value}`;
  if (axis.values.length >= MAX_AXIS_VALUES) return `Mỗi nhóm tối đa ${MAX_AXIS_VALUES} giá trị`;
  return null;
}

/** Lỗi theo nhóm: `name`, `values` */
export function axisErrors(draft: VariantDraft): { name?: string; values?: string }[] {
  return draft.axes.map((axis, i) => {
    const errors: { name?: string; values?: string } = {};
    const name = axis.name.trim();
    if (!name) errors.name = 'Nhập tên nhóm phân loại';
    else if (name.length > MAX_AXIS_NAME) errors.name = `Tên nhóm phân loại tối đa ${MAX_AXIS_NAME} ký tự`;
    else if (draft.axes.some((other, j) => j !== i && sameText(other.name, name))) errors.name = 'Hai nhóm phân loại trùng tên';
    if (!axis.values.length) errors.values = 'Thêm ít nhất một giá trị';
    return errors;
  });
}

/** Các tổ hợp chữ giá trị theo thứ tự nhóm, kể cả tổ hợp bỏ tick; không có nhóm thì một tổ hợp rỗng */
export function draftCombos(draft: VariantDraft): string[][] {
  return cartesian(draft.axes.map((a) => a.values));
}

export const includedCombos = (draft: VariantDraft) =>
  draftCombos(draft).filter((c) => !draft.excluded.includes(comboId(c)));

/** Lỗi chung của form phân loại khi bấm Tạo, null nếu tạo được */
export function draftError(draft: VariantDraft): string | null {
  if (draft.axes.length > MAX_AXES) return `Tối đa ${MAX_AXES} nhóm phân loại`;
  if (axisErrors(draft).some((e) => e.name || e.values)) return 'Sửa lỗi ở nhóm phân loại';
  const count = includedCombos(draft).length;
  if (!count) return 'Cần ít nhất một variant';
  if (count > MAX_VARIANTS) return `Tối đa ${MAX_VARIANTS} variant mỗi lần tạo`;
  return null;
}

/**
 * Body `axes`, `variants` của `POST /catalog/products`: nhóm khớp thuộc tính có sẵn gửi `attributeId`, giá trị có sẵn
 * kèm `id`; còn lại gửi `name`, `value` để BE tạo cùng lúc với sản phẩm
 */
export function draftBody(draft: VariantDraft, attributes: Attribute[]): { axes: ProductAxis[]; variants: { options: string[] }[] } {
  const axes = draft.axes.map((axis): ProductAxis => {
    const attribute = axisAttribute(axis, attributes);
    const values = axis.values.map((v) => {
      const found = attribute?.values.find((x) => sameText(x.value, v));
      return found ? { id: found.id, value: found.value } : { value: v.trim() };
    });
    return attribute ? { attributeId: attribute.id, values } : { name: axis.name.trim(), values };
  });
  return { axes, variants: includedCombos(draft).map((options) => ({ options: options.map((o) => o.trim()) })) };
}

export interface DraftRow {
  id: string;
  options: string[];
  included: boolean;
  /** SKU dự kiến; null khi bỏ tick hoặc chưa tải mẫu */
  sku: string | null;
}

/**
 * Bảng tổ hợp kèm SKU dự kiến: số thứ tự chạy từ `skuNextSeq` theo tổ hợp được giữ; mã giá trị lấy `code` có sẵn,
 * giá trị mới dùng `valueCode` (BE thêm hậu tố số khi trùng mã nên bản xem trước có thể lệch)
 */
export function draftRows(draft: VariantDraft, attributes: Attribute[], settings: ProductSettings | undefined): DraftRow[] {
  const codeOf = draft.axes.map((axis) => {
    const attribute = axisAttribute(axis, attributes);
    return (v: string) => attribute?.values.find((x) => sameText(x.value, v))?.code ?? valueCode(v);
  });
  let seq = settings?.skuNextSeq ?? 1;
  return draftCombos(draft).map((options) => {
    const id = comboId(options);
    const included = !draft.excluded.includes(id);
    const codes = options.map((o, i) => codeOf[i]!(o));
    const sku = included && settings ? renderSku(settings.skuPattern, seq++, codes) : null;
    return { id, options, included, sku };
  });
}

/** Lỗi BE theo ô (`axes.0.name`, `axes.1.values.2.value`, `variants`…) → câu gắn vào nhóm, hoặc lỗi chung */
export function axisServerErrors(errors: Record<string, string>, axisCount: number) {
  const byAxis = Array.from({ length: axisCount }, (_, i) =>
    Object.entries(errors)
      .filter(([k]) => k === `axes.${i}` || k.startsWith(`axes.${i}.`))
      .map(([, m]) => m),
  );
  const general = Object.entries(errors)
    .filter(([k]) => k === 'axes' || k === 'variants' || k.startsWith('variants.'))
    .map(([, m]) => m);
  return { byAxis, general };
}
