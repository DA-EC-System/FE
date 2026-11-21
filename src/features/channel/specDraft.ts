/**
 * Hàm thuần của trang đẩy lên sàn 4 bước (commerio-backend#400, Documents/21 §18.5): bản nháp thông tin sàn của sản
 * phẩm (`ProductSpec`), phần còn thiếu, gắn lỗi 422 về đúng bước.
 */

import type { ProductVariant } from '@/types/catalog';
import type {
  CategoryPermission,
  PlatformAttribute,
  ProductSpec,
  ProductSpecInput,
  ProductSpecResult,
  Shop,
  SpecMissing,
  SpecMissingReason,
  ResolvedAttribute,
  SpecValue,
  VariantCapabilities,
} from '@/types/shop';
import { shopUsable } from '@/lib/machines/channel';

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
export const ORIGIN_CODES = new Set(['100149', 'country_origin_hb']);
/** Lazada `brand` trống thì BE gửi "No Brand" nên không bao giờ thiếu (plan A1, A15) */
export const BRAND_CODES = new Set(['brand']);
/**
 * Attribute `tier = 'company'` lấy mặc định từ trường nào của hồ sơ công ty (BE `RESPONSIBLE_ATTRS` ở
 * `tiktok-categories.ts`: `101489` tên, `101490` địa chỉ). Ô tick "Lưu cũng vào hồ sơ công ty" ghi vào trường này
 */
export const PROFILE_FIELDS: Readonly<Record<string, 'responsibleName' | 'responsibleAddress'>> = {
  '101489': 'responsibleName',
  '101490': 'responsibleAddress',
};

/** Body `PUT /platform/company` từ các ô tick: chỉ trường có giá trị, kèm version hồ sơ; không có gì thì null */
export function profilePatch(
  codes: Iterable<string>,
  attributes: Record<string, SpecValue>,
  version: number,
): { responsibleName?: string; responsibleAddress?: string; version: number } | null {
  const out: { responsibleName?: string; responsibleAddress?: string; version: number } = { version };
  let any = false;
  for (const code of codes) {
    const field = PROFILE_FIELDS[code];
    const v = attributes[code];
    if (!field || typeof v !== 'string' || !v.trim()) continue;
    out[field] = v.trim();
    any = true;
  }
  return any ? out : null;
}

export const isFilled = (v: SpecValue | null | undefined): boolean =>
  Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim() !== '';

export const attributeTab = (a: Pick<PlatformAttribute, 'tier'>): AttributeTab => a.tier;

/** Giá trị đang có: nhập trong nháp, không có thì `defaultValue` (hồ sơ công ty, chỉ `tier = 'company'`) */
/**
 * Giá trị đang có của từng attribute: ghi đè trong bản nháp đè lên giá trị BE đã tự điền (`resolved`, Documents/21
 * §18.8.2). Ghi đè đã bỏ ("Về giá trị gốc") không còn trong `overrides` nên rơi về giá trị gốc; giá trị gốc của ô đang
 * ghi đè thì BE không trả, phải lưu xong mới thấy
 */
export function mergedValues(
  overrides: Record<string, SpecValue>,
  resolved: Record<string, ResolvedAttribute> | undefined,
): Record<string, SpecValue> {
  const out: Record<string, SpecValue> = {};
  for (const [code, r] of Object.entries(resolved ?? {})) if (r.source !== 'override') out[code] = r.value;
  for (const [code, v] of Object.entries(overrides)) if (isFilled(v)) out[code] = v;
  return out;
}

/**
 * Nháp có đổi giá trị hiển thị so với bản đã lưu không: so giá trị gộp (ghi đè > `resolved`) từng ô, không so tập ghi đè.
 * "Sửa riêng" rồi giữ nguyên giá trị gốc thì chưa đổi gì; multiselect không phân biệt thứ tự
 */
export function valuesChanged(
  draftOverrides: Record<string, SpecValue>,
  savedOverrides: Record<string, SpecValue>,
  resolved: Record<string, ResolvedAttribute> | undefined,
): boolean {
  // Giá trị hiển thị của bản đã lưu: ghi đè đã lưu, không có thì giá trị gốc BE tính
  const saved = mergedValues(savedOverrides, resolved);
  const now = mergedValues(draftOverrides, resolved);
  const norm = (v: SpecValue | undefined) => (v === undefined ? '' : Array.isArray(v) ? [...v].sort().join('\u0000') : v.trim());
  const codes = new Set([...Object.keys(saved), ...Object.keys(now)]);
  for (const c of codes) if (norm(saved[c]) !== norm(now[c])) return true;
  return false;
}

/** Nguồn của một ô: có ghi đè trong bản nháp là `override`, không thì nguồn BE đã tính; null khi chưa có giá trị */
export function valueSource(
  code: string,
  overrides: Record<string, SpecValue>,
  resolved: Record<string, ResolvedAttribute> | undefined,
): ResolvedAttribute['source'] | null {
  if (isFilled(overrides[code])) return 'override';
  const r = resolved?.[code];
  return r && r.source !== 'override' ? r.source : null;
}

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
  /** Luật trục của leaf (Documents/21 §18.8.3); null khi BE chưa trả: chỉ kiểm trục chưa ánh xạ */
  caps: VariantCapabilities | null = null,
): SpecMissing[] {
  const out: SpecMissing[] = [];
  if (spec.categoryStatus === 'changed') out.push({ code: 'category', label: 'Category trên sàn đã đổi', reason: 'category_changed' });
  if (spec.categoryStatus === 'removed') out.push({ code: 'category', label: 'Category đã bị sàn bỏ', reason: 'category_removed' });
  for (const a of attrs ?? []) {
    const reason = requirementOf(a, spec.attributes);
    if (!reason) continue;
    if (a.tier === 'product') {
      if (BRAND_CODES.has(a.code) || productValue(a, facts) || isFilled(spec.attributes[a.code])) continue;
      out.push({ code: a.code, label: a.label, reason });
      continue;
    }
    if (!isFilled(effectiveValue(a, spec.attributes))) out.push({ code: a.code, label: a.label, reason });
  }
  for (const axis of axes) {
    const code = spec.axisMap[axis.attributeId];
    if (!code || (code === CUSTOM_AXIS && caps && !caps.customAxisName)) {
      out.push({ code: axis.attributeId, label: axis.name, reason: 'axis_unmapped' });
    }
  }
  if (caps) {
    if (axes.length > caps.maxAxes) {
      out.push({ code: 'axes', label: `Sản phẩm có ${axes.length} trục, category này nhận tối đa ${caps.maxAxes}`, reason: 'axis_shape' });
    }
    const mapped = new Set(axes.map((x) => spec.axisMap[x.attributeId]));
    for (const code of caps.salesRequired) {
      if (!mapped.has(code)) out.push({ code, label: (attrs ?? []).find((a) => a.code === code)?.label ?? code, reason: 'sales_required' });
    }
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
  return reason === 'axis_unmapped' || reason === 'sales_required' || reason === 'axis_shape' ? 2 : 1;
}

/**
 * Áp gợi ý trục của BE (`suggestedAxisMap`, `suggestedValueMap` theo leaf đang chọn, Documents/21 §18.8.3) vào bản nháp.
 * Giữ trục người dùng đã chọn nếu còn hợp lệ ở leaf (là sales attribute của leaf, hoặc tên tự đặt khi sàn nhận); giá
 * trị chỉ điền ô trống của trục đang trỏ đúng mã BE gợi ý
 */
export function withSuggestedAxes(
  draft: SpecDraft,
  axes: ProductAxis[],
  suggested: { axisMap: Record<string, string>; valueMap: Record<string, string> },
  salesCodes: ReadonlySet<string>,
  customAxisName: boolean,
): SpecDraft {
  const axisMap = { ...draft.axisMap };
  const valueMap = { ...draft.valueMap };
  for (const axis of axes) {
    const current = axisMap[axis.attributeId];
    const valid = current && (salesCodes.has(current) || (current === CUSTOM_AXIS && customAxisName));
    const want = suggested.axisMap[axis.attributeId];
    if (!valid && want) {
      axisMap[axis.attributeId] = want;
      for (const v of axis.values) delete valueMap[v.id];
    }
    if (axisMap[axis.attributeId] !== want) continue;
    for (const v of axis.values) {
      if (!valueMap[v.id] && suggested.valueMap[v.id]) valueMap[v.id] = suggested.valueMap[v.id];
    }
  }
  return { ...draft, axisMap, valueMap };
}

/** Nút đi kèm một mục còn thiếu ở bước 4: về một bước của trang, hoặc sang trang gian hàng */
export type ReadinessAction = { kind: 'step'; step: PushStep } | { kind: 'shops' };

export interface PushBlocker {
  key: string;
  label: string;
  /** `null`: sửa ngay tại bước 4 (vd. tick gian hàng) */
  action: ReadinessAction | null;
}

export interface ReadinessInput {
  /** Tên sàn hiển thị */
  label: string;
  hasCategory: boolean;
  /** Attribute của leaf: đã tải, đang tải, hay tải lỗi (vd. không có gian hàng đang kết nối để hỏi sàn) */
  attributes: 'loaded' | 'loading' | 'failed';
  /** Kết quả `specMissing`, kèm dòng "Chưa chọn category" khi chưa có leaf */
  missing: SpecMissing[];
  /** Chỉ lưu thông tin sàn: không cần gian hàng */
  fillOnly: boolean;
  shops: Pick<Shop, 'id' | 'status'>[];
  selected: ReadonlySet<string>;
  /** Gian hàng biết chắc không bán được category này */
  blockedShops: ReadonlyMap<string, string>;
}

/**
 * Bước 4 có đẩy được thật không. Sẵn sàng khi đã chọn category, attribute của leaf đã tải và đủ bắt buộc, trục phân
 * loại đã ánh xạ, và (trừ chế độ chỉ lưu) có ít nhất một gian hàng đẩy được đang được chọn. Mỗi mục thiếu kèm nút
 * về đúng bước; thứ tự theo bước để người dùng sửa từ trên xuống
 */
export function pushReadiness(input: ReadinessInput): { ready: boolean; blockers: PushBlocker[] } {
  const fromMissing = (m: SpecMissing): PushBlocker => ({
    key: `${m.reason}-${m.code}`,
    label: m.label,
    action: { kind: 'step', step: stepOfMissing(m.reason) },
  });
  const blockers: PushBlocker[] = input.missing.filter((m) => stepOfMissing(m.reason) === 0).map(fromMissing);
  if (input.hasCategory && input.attributes !== 'loaded') {
    blockers.push({
      key: 'attributes',
      label:
        input.attributes === 'loading'
          ? 'Đang tải attribute của category, chưa kiểm được ô bắt buộc'
          : 'Chưa tải được attribute của category nên chưa kiểm được ô bắt buộc',
      action: { kind: 'step', step: 1 },
    });
  }
  blockers.push(...input.missing.filter((m) => stepOfMissing(m.reason) !== 0).map(fromMissing));
  if (!input.fillOnly) {
    const pushable = input.shops.filter((s) => shopUsable(s.status) && !input.blockedShops.has(s.id));
    if (!input.shops.length) {
      blockers.push({ key: 'no_shop', label: `Công ty chưa có gian hàng ${input.label} nào`, action: { kind: 'shops' } });
    } else if (!pushable.length) {
      blockers.push({
        key: 'no_usable_shop',
        label: `Không gian hàng ${input.label} nào đẩy được: chưa kết nối, mất uỷ quyền hoặc không được bán category này`,
        action: { kind: 'shops' },
      });
    } else if (!pushable.some((s) => input.selected.has(s.id))) {
      blockers.push({ key: 'no_selected_shop', label: 'Chưa chọn gian hàng để đẩy', action: null });
    }
  }
  return { ready: blockers.length === 0, blockers };
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
 * Body của `PUT …/specs/:platform`. `attributes` là toàn bộ tập ghi đè (Documents/21 §18.8.2): khoá không gửi là không ghi
 * đè, BE bỏ giá trị trùng nguồn gốc. Bỏ `tier = 'company'` trùng `defaultValue` và sales attribute (đi qua `axisMap`).
 * `attrs = null` (chưa biết attribute của leaf) thì gửi nguyên giá trị đã nhập để BE tự kiểm
 */
export function specInput(draft: SpecDraft, attrs: PlatformAttribute[] | null, axes: ProductAxis[]): ProductSpecInput {
  if (!draft.externalCategoryId) throw new Error('Chưa chọn category');
  const attributes: Record<string, SpecValue> = {};
  const byCode = new Map((attrs ?? []).map((a) => [a.code, a]));
  for (const [code, value] of Object.entries(draft.attributes)) {
    if (!isFilled(value)) continue;
    const a = byCode.get(code);
    if (attrs && !a) continue;
    // Thương hiệu, xuất xứ ghi đè riêng sàn được (Documents/21 §18.8.2); giá trị trùng nguồn gốc thì BE không lưu
    if (a?.kind === 'sales') continue;
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
