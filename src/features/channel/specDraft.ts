/**
 * Hàm thuần của trang đẩy lên sàn 4 bước (commerio-backend#400, Documents/21 §18.5): bản nháp thông tin sàn của sản
 * phẩm (`ProductSpec`), phần còn thiếu, gắn lỗi 422 về đúng bước. Mock MSW dùng chung `specMissing` để giống BE.
 */

import type { ProductVariant } from '@/types/catalog';
import type {
  CategoryPermission,
  PlatformAttribute,
  ProductSpec,
  ProductSpecInput,
  ProductSpecResult,
  SpecMissing,
  SpecMissingReason,
  SpecValue,
} from '@/types/shop';

/** Trục phân loại không ánh xạ sales attribute nào của sàn: gửi tên trục làm custom sales attribute */
export const CUSTOM_AXIS = '__custom';

/** 0 Category · 1 Attributes · 2 Variants · 3 Xem lại & đẩy */
export type PushStep = 0 | 1 | 2 | 3;
export const PUSH_STEPS = ['category', 'attributes', 'variants', 'review'] as const;
export type PushStepKey = (typeof PUSH_STEPS)[number];

/** Tab của bước Attributes, theo `tier` của attribute */
export type AttributeTab = 'category' | 'product' | 'company';

export interface ProductAxis {
  /** Id thuộc tính Commerio: khoá của `axisMap` */
  attributeId: string;
  name: string;
  /** Id giá trị thuộc tính Commerio: khoá của `valueMap` */
  values: { id: string; value: string }[];
}

/** Xuất xứ, thương hiệu của sản phẩm (catalog, Documents/21 §17.2): attribute `tier = 'product'` đọc từ đây */
export interface ProductFacts {
  originCountry: string | null;
  brand: string | null;
}

export interface SpecDraft {
  externalCategoryId: string | null;
  categoryPath: string;
  attributes: Record<string, SpecValue>;
  axisMap: Record<string, string>;
  valueMap: Record<string, string>;
  /** `null` khi chưa có spec (PUT tạo mới) */
  version: number | null;
  /** `match`: category đọc từ sàn lúc ghép SKU, không đổi ở trang này */
  source: ProductSpec['source'] | null;
  categoryStatus: ProductSpec['categoryStatus'];
}

/** Bỏ dấu, đổi đ → d, chữ thường (như `normalizePath` của BE) */
export const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().trim();

/** Mã attribute xuất xứ của từng sàn: lấy từ `originCountry` của sản phẩm */
const ORIGIN_CODES = new Set(['100149', 'country_origin_hb']);
/** Lazada `brand` trống thì BE gửi "No Brand" nên không bao giờ thiếu (plan A1, A15) */
const BRAND_CODES = new Set(['brand']);

export const isFilled = (v: SpecValue | null | undefined): boolean =>
  Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim() !== '';

export const attributeTab = (a: Pick<PlatformAttribute, 'tier'>): AttributeTab => a.tier;

/** Giá trị đang có: nhập trong nháp, không có thì `defaultValue` (hồ sơ công ty, chỉ `tier = 'company'`) */
export function effectiveValue(a: PlatformAttribute, attributes: Record<string, SpecValue>): SpecValue | null {
  const v = attributes[a.code];
  if (isFilled(v)) return v;
  return a.tier === 'company' && a.defaultValue ? a.defaultValue : null;
}

/** Giá trị attribute `tier = 'product'` lấy từ trang sản phẩm; null là sản phẩm chưa điền */
export function productValue(a: Pick<PlatformAttribute, 'code'>, facts: ProductFacts): string | null {
  if (ORIGIN_CODES.has(a.code)) return facts.originCountry;
  if (BRAND_CODES.has(a.code)) return facts.brand;
  return null;
}

/** Bắt buộc theo điều kiện: có ít nhất một điều kiện đúng (attribute `code` đang chọn một trong `optionIds`) */
export function conditionMet(a: Pick<PlatformAttribute, 'requiredWhen'>, attributes: Record<string, SpecValue>): boolean {
  return (a.requiredWhen ?? []).some((c) => {
    const v = attributes[c.code];
    const picked = Array.isArray(v) ? v : v ? [v] : [];
    return picked.some((id) => c.optionIds.includes(id));
  });
}

/** Attribute đang bắt buộc: `required`, hoặc bắt buộc theo điều kiện mà điều kiện đúng */
export function requirementOf(
  a: PlatformAttribute,
  attributes: Record<string, SpecValue>,
): Extract<SpecMissingReason, 'required' | 'required_when'> | null {
  if (a.kind === 'sales') return null;
  if (a.required) return 'required';
  return conditionMet(a, attributes) ? 'required_when' : null;
}

/**
 * Phần còn thiếu của thông tin sàn, cùng luật với `missing` của BE: attribute bắt buộc (kể cả theo điều kiện) chưa có
 * giá trị; sales attribute không tính (kiểm qua `axisMap`); thương hiệu không bao giờ thiếu; xuất xứ thiếu khi trang
 * sản phẩm chưa điền; trục phân loại chưa ánh xạ; category đổi hay bị sàn bỏ. `attrs = null` là chưa biết attribute
 * của leaf (BE chưa lấy từ sàn): chỉ kiểm trục và category
 */
export function specMissing(
  attrs: PlatformAttribute[] | null,
  spec: Pick<SpecDraft, 'attributes' | 'axisMap'> & { categoryStatus?: ProductSpec['categoryStatus'] },
  axes: Pick<ProductAxis, 'attributeId' | 'name'>[],
  facts: ProductFacts,
): SpecMissing[] {
  const out: SpecMissing[] = [];
  if (spec.categoryStatus === 'changed') out.push({ code: 'category', label: 'Category trên sàn đã đổi', reason: 'category_changed' });
  if (spec.categoryStatus === 'removed') out.push({ code: 'category', label: 'Category đã bị sàn bỏ', reason: 'category_removed' });
  for (const a of attrs ?? []) {
    const reason = requirementOf(a, spec.attributes);
    if (!reason) continue;
    if (a.tier === 'product') {
      if (BRAND_CODES.has(a.code) || productValue(a, facts)) continue;
      out.push({ code: a.code, label: `${a.label} (điền ở trang sản phẩm)`, reason });
      continue;
    }
    if (!isFilled(effectiveValue(a, spec.attributes))) out.push({ code: a.code, label: a.label, reason });
  }
  for (const axis of axes) {
    if (!spec.axisMap[axis.attributeId]) out.push({ code: axis.attributeId, label: axis.name, reason: 'axis_unmapped' });
  }
  return out;
}

/** Trục phân loại của sản phẩm, đọc từ biến thể chưa lưu trữ; giữ thứ tự xuất hiện */
export function productAxes(variants: Pick<ProductVariant, 'attributes' | 'archivedAt'>[]): ProductAxis[] {
  const axes = new Map<string, ProductAxis>();
  for (const v of variants) {
    if (v.archivedAt) continue;
    for (const a of v.attributes) {
      const axis = axes.get(a.attributeId) ?? { attributeId: a.attributeId, name: a.attributeName, values: [] };
      if (!axis.values.some((x) => x.id === a.valueId)) axis.values.push({ id: a.valueId, value: a.value });
      axes.set(a.attributeId, axis);
    }
  }
  return [...axes.values()];
}

/** Khoá lỗi 422 của `PUT …/specs/:platform` thuộc bước nào */
export function stepOfError(key: string): PushStep {
  if (key === 'externalCategoryId') return 0;
  if (key.startsWith('attributes.')) return 1;
  if (key.startsWith('axisMap.') || key.startsWith('valueMap.')) return 2;
  return 3;
}

/** Bước đầu tiên có lỗi trong `errors` của 422; không có khoá nào thì bước cuối */
export function firstErrorStep(errors: Record<string, string>): PushStep {
  const steps = Object.keys(errors).map(stepOfError);
  return steps.length ? (Math.min(...steps) as PushStep) : 3;
}

/** Một dòng `missing` sửa ở bước nào */
export function stepOfMissing(reason: SpecMissingReason): PushStep {
  if (reason === 'category_changed' || reason === 'category_removed') return 0;
  return reason === 'axis_unmapped' ? 2 : 1;
}

/** Mở trang: chưa có spec hoặc category đổi/bị bỏ thì ở bước Category; đã có thì vào thẳng Attributes */
export function firstStep(result: ProductSpecResult | undefined): PushStep {
  if (!result?.spec) return 0;
  return result.missing.some((m) => stepOfMissing(m.reason) === 0) ? 0 : 1;
}

export function draftFromSpec(spec: ProductSpec | null): SpecDraft {
  return {
    externalCategoryId: spec?.externalCategoryId ?? null,
    categoryPath: spec?.categoryPath ?? '',
    attributes: { ...(spec?.attributes ?? {}) },
    axisMap: { ...(spec?.axisMap ?? {}) },
    valueMap: { ...(spec?.valueMap ?? {}) },
    version: spec?.version ?? null,
    source: spec?.source ?? null,
    categoryStatus: spec?.categoryStatus ?? 'ok',
  };
}

/** Chọn leaf: cùng leaf thì giữ nguyên; leaf khác thì bỏ attribute và ánh xạ của leaf cũ (mã attribute theo leaf) */
export function withCategory(draft: SpecDraft, externalId: string, path: string): SpecDraft {
  if (draft.externalCategoryId === externalId) return { ...draft, categoryPath: path };
  return { ...draft, externalCategoryId: externalId, categoryPath: path, attributes: {}, axisMap: {}, valueMap: {}, categoryStatus: 'ok' };
}

export function withAttribute(draft: SpecDraft, code: string, value: SpecValue | null): SpecDraft {
  const attributes = { ...draft.attributes };
  if (value === null || !isFilled(value)) delete attributes[code];
  else attributes[code] = value;
  return { ...draft, attributes };
}

/** Đổi sales attribute của một trục: bỏ ánh xạ giá trị cũ của trục đó */
export function withAxis(draft: SpecDraft, axis: ProductAxis, code: string): SpecDraft {
  const valueMap = { ...draft.valueMap };
  for (const v of axis.values) delete valueMap[v.id];
  return { ...draft, axisMap: { ...draft.axisMap, [axis.attributeId]: code }, valueMap };
}

export function withValue(draft: SpecDraft, valueId: string, optionId: string | null): SpecDraft {
  const valueMap = { ...draft.valueMap };
  if (optionId) valueMap[valueId] = optionId;
  else delete valueMap[valueId];
  return { ...draft, valueMap };
}

/**
 * Body của `PUT …/specs/:platform`. Chỉ gửi attribute `tier = 'category'`; `tier = 'company'` khi khác `defaultValue`
 * (trống hoặc trùng thì BE lấy hồ sơ công ty lúc đẩy); bỏ `tier = 'product'` (catalog giữ) và sales attribute (đi qua
 * `axisMap`). `attrs = null` (chưa biết attribute của leaf) thì gửi nguyên giá trị đã nhập để BE tự kiểm
 */
export function specInput(draft: SpecDraft, attrs: PlatformAttribute[] | null, axes: ProductAxis[]): ProductSpecInput {
  if (!draft.externalCategoryId) throw new Error('Chưa chọn category');
  const attributes: Record<string, SpecValue> = {};
  const byCode = new Map((attrs ?? []).map((a) => [a.code, a]));
  for (const [code, value] of Object.entries(draft.attributes)) {
    if (!isFilled(value)) continue;
    const a = byCode.get(code);
    if (attrs && !a) continue;
    if (a && (a.kind === 'sales' || a.tier === 'product')) continue;
    if (a?.tier === 'company' && value === a.defaultValue) continue;
    attributes[code] = value;
  }
  const axisIds = new Set(axes.map((x) => x.attributeId));
  const valueIds = new Set(axes.flatMap((x) => x.values.map((v) => v.id)));
  return {
    externalCategoryId: draft.externalCategoryId,
    attributes,
    axisMap: Object.fromEntries(Object.entries(draft.axisMap).filter(([k]) => axisIds.has(k))),
    valueMap: Object.fromEntries(Object.entries(draft.valueMap).filter(([k]) => valueIds.has(k))),
    version: draft.version,
  };
}

const COLOR = /mau|color/;
const SIZE = /kich|size/;

/** Đoán sales attribute cho trục chưa ánh xạ theo tên (Màu ↔ Màu sắc/color_family, Kích cỡ ↔ size); không khớp thì custom */
export function defaultAxisMap(
  axes: ProductAxis[],
  sales: Pick<PlatformAttribute, 'code' | 'label'>[],
  current: Record<string, string>,
): Record<string, string> {
  const out = { ...current };
  const used = new Set(Object.values(current));
  for (const axis of axes) {
    if (out[axis.attributeId]) continue;
    const name = fold(axis.name);
    const re = COLOR.test(name) ? COLOR : SIZE.test(name) ? SIZE : null;
    const hit = re ? sales.find((s) => !used.has(s.code) && re.test(fold(`${s.label} ${s.code}`))) : undefined;
    out[axis.attributeId] = hit?.code ?? CUSTOM_AXIS;
    if (hit) used.add(hit.code);
  }
  return out;
}

/**
 * Gợi ý giá trị chuẩn của sàn cho giá trị trục chưa ánh xạ: trùng nhãn (bỏ dấu); kích cỡ dạng "INT:M", "EU:40" thì so
 * phần sau dấu ":" và ưu tiên INT. Không khớp thì để trống (gửi custom value)
 */
export function suggestValueMap(
  axes: ProductAxis[],
  axisMap: Record<string, string>,
  sales: Pick<PlatformAttribute, 'code' | 'options'>[],
  current: Record<string, string>,
): Record<string, string> {
  const out = { ...current };
  for (const axis of axes) {
    const attr = sales.find((s) => s.code === axisMap[axis.attributeId]);
    if (!attr?.options.length) continue;
    for (const v of axis.values) {
      if (out[v.id]) continue;
      const want = fold(v.value);
      const exact = attr.options.find((o) => fold(o.label) === want);
      const sized = attr.options.filter((o) => fold(o.label.split(':').pop() ?? '') === want);
      const hit = exact ?? sized.find((o) => /^int:/i.test(o.label)) ?? sized[0];
      if (hit) out[v.id] = hit.id;
    }
  }
  return out;
}

/** Nhãn hiển thị của giá trị đã lưu (mã lựa chọn → nhãn; giá trị riêng giữ nguyên) */
export function valueLabel(a: Pick<PlatformAttribute, 'options'>, value: SpecValue | null): string {
  if (value === null) return '';
  const label = (id: string) => a.options.find((o) => o.id === id)?.label ?? id;
  return Array.isArray(value) ? value.map(label).join(', ') : label(value);
}

/** Quyền category của gian hàng TikTok chặn chọn: khác `available`; Lazada `null` không chặn */
export const permissionBlocked = (p: CategoryPermission | null | undefined): boolean => Boolean(p) && p !== 'available';

export const PERMISSION_LABELS: Record<CategoryPermission, string> = {
  available: 'Được bán',
  invite_only: 'Chỉ bán khi được sàn mời',
  non_main_category: 'Ngoài ngành hàng chính của gian hàng',
  prohibited: 'Sàn cấm bán',
};

/** Gợi ý cách nhập dưới ô */
export function fieldHint(a: PlatformAttribute): string {
  const n = a.options.length;
  if (a.input === 'image') return '';
  if (a.input === 'cascade') return 'Chọn từng cấp, cấp sau hiện khi đã chọn cấp trước';
  if (a.input === 'multiselect') return n ? `Chọn được nhiều trong ${n} giá trị${a.allowCustom ? ', hoặc gõ giá trị riêng' : ''}` : 'Gõ giá trị rồi chọn để thêm';
  if (n && !a.allowCustom) return `Chọn 1 trong ${n} giá trị của sàn`;
  if (n) return `Chọn trong ${n} gợi ý hoặc gõ giá trị riêng`;
  if (a.input === 'number') return 'Nhập số';
  if (a.input === 'date') return 'Chọn ngày';
  return a.defaultValue ? 'Để trống thì dùng giá trị từ hồ sơ công ty' : 'Nhập tự do';
}

/**
 * `path` của attribute cascade: mã các cấp đã chọn theo thứ tự, gửi lên route cascade và lưu vào spec khi tới cấp
 * `leaf` (Documents/21 §18.5). Dấu ngăn theo định dạng `path` của Lazada GetNextCascadeProp, chưa đo trên sàn thật
 */
export const CASCADE_SEPARATOR = ',';
export const cascadePath = (ids: string[]) => ids.join(CASCADE_SEPARATOR);
export const cascadeLevels = (path: string) => (path ? path.split(CASCADE_SEPARATOR) : []);
