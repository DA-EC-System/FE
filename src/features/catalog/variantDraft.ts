import { renderSku, valueCode } from '@/utils/sku';
import type { Attribute, ProductAxis, ProductSettings, VariantFacts } from '@/types/catalog';
import { cartesian } from './shared';

/**
 * Thuộc tính biến thể khi tạo sản phẩm kiểu seller center (FE#350 phần 3, Documents/21 §5.2 `POST /catalog/products`):
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
  /** Giá, cân nặng, kích thước gõ ngay khi tạo, khoá `comboId`, giữ nguyên chữ người dùng gõ (Documents/21 §5.5) */
  facts?: Record<string, FactsDraft>;
  /** `key` của trục gắn ảnh phân loại (một trục duy nhất, Documents/21 §5.5 `imageAxis`) */
  imageAxisKey?: string | null;
  /** Ảnh theo giá trị của trục gắn ảnh, khoá `fold(giá trị)` */
  axisImages?: Record<string, { fileId: string; url: string }>;
}

/** Khoá ảnh của một giá trị trục */
export const imageKey = (value: string) => fold(value);

export const FACT_KEYS = ['standardPrice', 'targetNetPrice', 'weightG', 'lengthMm', 'widthMm', 'heightMm'] as const;
export type FactKey = (typeof FACT_KEYS)[number];
export type FactsDraft = Partial<Record<FactKey, string>>;

/** Trần như PATCH …/variants/:variantId (§17.2, commerio-backend#434): 50 kg, cạnh 2 m */
const FACT_MAX: Record<FactKey, [number, string]> = {
  standardPrice: [1_000_000_000, 'Giá quá lớn'],
  targetNetPrice: [1_000_000_000, 'Giá quá lớn'],
  weightG: [50_000, 'Quá 50 kg, kiểm tra lại đơn vị gram'],
  lengthMm: [2000, 'Quá 2 m, kiểm tra lại đơn vị mm'],
  widthMm: [2000, 'Quá 2 m, kiểm tra lại đơn vị mm'],
  heightMm: [2000, 'Quá 2 m, kiểm tra lại đơn vị mm'],
};

/** Một ô số: trống là chưa có; bỏ dấu chấm, phẩy, khoảng trắng phân cách nghìn; phải là số nguyên dương */
export function parseFact(key: FactKey, raw: string | undefined): { value: number | null; error?: string } {
  const text = (raw ?? '').trim().replace(/[.,\s]/g, '');
  if (!text) return { value: null };
  if (!/^\d+$/.test(text) || Number(text) <= 0) return { value: null, error: 'Số nguyên dương' };
  const [max, tooBig] = FACT_MAX[key];
  if (Number(text) > max) return { value: null, error: tooBig };
  return { value: Number(text) };
}

/** Số của một variant và lỗi theo ô; kích thước phải đủ ba cạnh hoặc bỏ trống cả ba */
export function factsOf(draft: FactsDraft | undefined): { facts: VariantFacts; errors: Partial<Record<FactKey, string>> } {
  const facts: VariantFacts = {};
  const errors: Partial<Record<FactKey, string>> = {};
  for (const k of FACT_KEYS) {
    const { value, error } = parseFact(k, draft?.[k]);
    if (error) errors[k] = error;
    else if (value !== null) facts[k] = value;
  }
  const sides = ['lengthMm', 'widthMm', 'heightMm'] as const;
  const filled = sides.filter((k) => draft?.[k]?.trim());
  if (filled.length && filled.length < 3) for (const k of sides) if (!draft?.[k]?.trim()) errors[k] = 'Nhập đủ ba cạnh';
  return { facts, errors };
}

/** Điền một lần cho mọi variant: chỉ điền ô đang trống của các tổ hợp được giữ, không ghi đè */
export function fillFacts(draft: VariantDraft, values: FactsDraft): VariantDraft {
  const facts = { ...draft.facts };
  for (const options of includedCombos(draft)) {
    const id = comboId(options);
    const row = { ...facts[id] };
    for (const k of FACT_KEYS) if (values[k]?.trim() && !row[k]?.trim()) row[k] = values[k];
    facts[id] = row;
  }
  return { ...draft, facts };
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
    if (!name) errors.name = 'Nhập tên thuộc tính biến thể';
    else if (name.length > MAX_AXIS_NAME) errors.name = `Tên thuộc tính biến thể tối đa ${MAX_AXIS_NAME} ký tự`;
    else if (draft.axes.some((other, j) => j !== i && sameText(other.name, name))) errors.name = 'Hai thuộc tính biến thể trùng tên';
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
  if (draft.axes.length > MAX_AXES) return `Tối đa ${MAX_AXES} thuộc tính biến thể`;
  if (axisErrors(draft).some((e) => e.name || e.values)) return 'Sửa lỗi ở thuộc tính biến thể';
  const count = includedCombos(draft).length;
  if (!count) return 'Cần ít nhất một biến thể';
  if (count > MAX_VARIANTS) return `Tối đa ${MAX_VARIANTS} biến thể mỗi lần tạo`;
  if (includedCombos(draft).some((c) => Object.keys(factsOf(draft.facts?.[comboId(c)]).errors).length)) {
    return 'Sửa ô giá, cân nặng, kích thước đang báo lỗi';
  }
  return null;
}

/**
 * Body `axes`, `variants` của `POST /catalog/products`: nhóm khớp thuộc tính có sẵn gửi `attributeId`, giá trị có sẵn
 * kèm `id`; còn lại gửi `name`, `value` để BE tạo cùng lúc với sản phẩm
 */
export function draftBody(
  draft: VariantDraft,
  attributes: Attribute[],
): { axes: ProductAxis[]; imageAxis?: 0 | 1; variants: ({ options: string[] } & VariantFacts)[] } {
  const imageAxis = draft.axes.findIndex((a) => a.key === draft.imageAxisKey);
  const axes = draft.axes.map((axis, i): ProductAxis => {
    const attribute = axisAttribute(axis, attributes);
    const values = axis.values.map((v) => {
      const found = attribute?.values.find((x) => sameText(x.value, v));
      const imageFileId = i === imageAxis ? draft.axisImages?.[imageKey(v)]?.fileId : undefined;
      return {
        ...(found ? { id: found.id, value: found.value } : { value: v.trim() }),
        ...(imageFileId && { imageFileId }),
      };
    });
    return attribute ? { attributeId: attribute.id, values } : { name: axis.name.trim(), values };
  });
  return {
    axes,
    ...(imageAxis >= 0 && { imageAxis: imageAxis as 0 | 1 }),
    variants: includedCombos(draft).map((options) => ({
      options: options.map((o) => o.trim()),
      ...factsOf(draft.facts?.[comboId(options)]).facts,
    })),
  };
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
