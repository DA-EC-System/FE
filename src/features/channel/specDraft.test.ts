import { describe, expect, it } from 'vitest';
import type { PlatformAttribute, ProductSpec } from '@/types/shop';
import {
  CUSTOM_AXIS,
  draftFromSpec,
  draftMissing,
  permissionBlocked,
  productAxes,
  profilePatch,
  mergedValues,
  valuesChanged,
  specInput,
  valueSource,
  specMissing,
  suggestValueMap,
  withSuggestedAxes,
  valueLabel,
  withAttribute,
  withAxis,
  withCategory,
  axisTargetCount,
  combinedGroups,
  combinedValues,
  withCombinedAxes,
  type ProductAxis,
  fieldHint,
  cascadePath,
  cascadeLevels,
} from './specDraft';

const attr = (over: Partial<PlatformAttribute>): PlatformAttribute => ({
  code: 'a',
  label: 'A',
  kind: 'property',
  input: 'text',
  options: [],
  allowCustom: true,
  required: false,
  requiredWhen: null,
  isKey: false,
  tier: 'category',
  defaultValue: null,
  ...over,
});

const MATERIAL = attr({ code: 'material', label: 'Chất liệu', input: 'select', required: true, allowCustom: false, options: [{ id: 'm1', label: 'Cotton' }] });
const COLLAR = attr({ code: 'collar', label: 'Kiểu cổ', requiredWhen: [{ code: 'material', optionIds: ['m1'] }] });
const COMPANY = attr({ code: '101489', label: 'Tên tổ chức', tier: 'company', required: true, defaultValue: 'Công ty ABC' });
const ORIGIN = attr({ code: '100149', label: 'Quốc gia xuất xứ', tier: 'product', required: true, input: 'select' });
const BRAND = attr({ code: 'brand', label: 'Thương hiệu', tier: 'product', required: true });
const COLOR = attr({ code: 'color_family', label: 'Màu sắc', kind: 'sales', required: true, input: 'select', options: [{ id: 'Đen', label: 'Đen' }, { id: 'Trắng', label: 'Trắng' }] });
const SIZE = attr({ code: 'size', label: 'Kích cỡ', kind: 'sales', input: 'select', options: [{ id: 'EU:40', label: 'EU:40' }, { id: 'Int:M', label: 'Int:M' }, { id: 'EU:M', label: 'EU:M' }] });
const ATTRS = [MATERIAL, COLLAR, COMPANY, ORIGIN, BRAND, COLOR, SIZE];

const AXES: ProductAxis[] = [
  { attributeId: 'att-mau', name: 'Màu sắc', values: [{ id: 'val-den', value: 'Đen' }, { id: 'val-xanh', value: 'Xanh rêu' }] },
  { attributeId: 'att-size', name: 'Kích cỡ', values: [{ id: 'val-m', value: 'M' }] },
];
const FACTS = { originCountry: 'VN', brand: null };

const spec = (over: Partial<ProductSpec> = {}): ProductSpec => ({
  productId: 'prd-1',
  platform: 'lazada',
  externalCategoryId: '7930',
  categoryPath: 'Thời trang > Áo phông',
  categoryStatus: 'ok',
  attributes: { material: 'm1' },
  axisMap: { 'att-mau': 'color_family', 'att-size': CUSTOM_AXIS },
  valueMap: {},
  source: 'push',
  version: 2,
  updatedAt: '2026-11-18T00:00:00.000Z',
  ...over,
});

describe('specMissing: cùng luật với missing của BE (AC-7, AC-14, AC-15)', () => {
  it('đủ: không thiếu gì; công ty lấy defaultValue, thương hiệu trống không thiếu, sales attribute không tính', () => {
    expect(specMissing(ATTRS, spec(), AXES, FACTS)).toEqual([
      { code: 'collar', label: 'Kiểu cổ', reason: 'required_when' },
    ]);
  });

  it('bắt buộc theo điều kiện chỉ khi điều kiện đúng', () => {
    expect(specMissing(ATTRS, spec({ attributes: {} }), AXES, FACTS).map((m) => [m.code, m.reason])).toEqual([
      ['material', 'required'],
    ]);
    expect(specMissing(ATTRS, spec({ attributes: { material: 'm1', collar: 'Tròn' } }), AXES, FACTS)).toEqual([]);
  });

  it('xuất xứ chưa điền: thiếu, nhãn như sàn (sửa ngay ở tab Product info, FE#415)', () => {
    const m = specMissing(ATTRS, spec({ attributes: { material: 'm1', collar: 'x' } }), AXES, { originCountry: null, brand: null });
    expect(m).toEqual([{ code: '100149', label: 'Quốc gia xuất xứ', reason: 'required' }]);
  });

  it('công ty: xoá trắng mà không có defaultValue thì thiếu', () => {
    const noDefault = { ...COMPANY, defaultValue: null };
    expect(specMissing([noDefault], spec({ attributes: {} }), [], FACTS)).toEqual([
      { code: '101489', label: 'Tên tổ chức', reason: 'required' },
    ]);
  });

  it('trục chưa ánh xạ; category đổi; chưa biết attribute của leaf thì chỉ kiểm trục và category', () => {
    const m = specMissing(null, spec({ axisMap: { 'att-mau': 'color_family' }, categoryStatus: 'changed' }), AXES, FACTS);
    expect(m.map((x) => [x.code, x.reason])).toEqual([
      ['category', 'category_changed'],
      ['att-size', 'axis_unmapped'],
    ]);
  });
});

describe('Bản nháp và body PUT', () => {
  it('nạp spec; chưa có spec thì version null', () => {
    expect(draftFromSpec(null)).toMatchObject({ externalCategoryId: null, version: null, source: null });
    expect(draftFromSpec(spec())).toMatchObject({ externalCategoryId: '7930', version: 2, source: 'push' });
  });

  it('đổi leaf thì bỏ attribute, ánh xạ của leaf cũ; chọn lại cùng leaf thì giữ', () => {
    const d = draftFromSpec(spec());
    expect(withCategory(d, '7930', 'p').attributes).toEqual({ material: 'm1' });
    expect(withCategory(d, '7545', 'Áo polo')).toMatchObject({ externalCategoryId: '7545', attributes: {}, axisMap: {}, valueMap: {} });
  });

  it('xoá trắng giá trị thì bỏ khoá; đổi sales attribute của trục thì bỏ ánh xạ giá trị của trục đó', () => {
    const d = withAttribute(draftFromSpec(spec()), 'material', '');
    expect(d.attributes).toEqual({});
    const mapped = { ...draftFromSpec(spec()), valueMap: { 'val-den': 'Đen', 'val-m': 'Int:M' } };
    expect(withAxis(mapped, AXES[0], CUSTOM_AXIS).valueMap).toEqual({ 'val-m': 'Int:M' });
  });

  it('gửi mọi ghi đè trừ company trùng defaultValue, sales, mã không có ở leaf, trục lạ (thương hiệu, xuất xứ ghi đè được)', () => {
    const d = {
      ...draftFromSpec(spec()),
      attributes: { material: 'm1', '101489': 'Công ty ABC', '100149': 'VN', color_family: 'Đen', old: 'x', collar: ['a', 'b'] },
      axisMap: { 'att-mau': 'color_family', 'att-cu': 'size' },
      valueMap: { 'val-den': 'Đen', 'val-cu': 'x' },
    };
    expect(specInput(d, ATTRS, AXES)).toEqual({
      externalCategoryId: '7930',
      attributes: { material: 'm1', '100149': 'VN', collar: ['a', 'b'] },
      axisMap: { 'att-mau': 'color_family' },
      valueMap: { 'val-den': 'Đen' },
      version: 2,
    });
    const own = { ...d, attributes: { '101489': 'Công ty khác' } };
    expect(specInput(own, ATTRS, AXES).attributes).toEqual({ '101489': 'Công ty khác' });
    expect(specInput({ ...d, attributes: { old: 'x' } }, null, AXES).attributes).toEqual({ old: 'x' });
  });

  it('chưa chọn category thì không dựng body', () => {
    expect(() => specInput(draftFromSpec(null), ATTRS, AXES)).toThrow();
  });
});

describe('Ánh xạ trục và giá trị (FE-3)', () => {
  it('áp gợi ý trục của BE: điền trục trống, thay trục không hợp lệ ở leaf, giữ trục người dùng đã chọn', () => {
    const d = { ...draftFromSpec(null), externalCategoryId: '1' };
    const sug = { axisMap: { 'att-mau': 'color_family', 'att-size': 'size' }, valueMap: { 'val-den': 'Đen', 'val-m': 'Int:M' } };
    const codes = new Set(['color_family', 'size']);
    expect(withSuggestedAxes(d, AXES, sug, codes, true)).toMatchObject({ axisMap: sug.axisMap, valueMap: sug.valueMap });
    // trục đã chọn hợp lệ thì giữ, không điền giá trị theo gợi ý của mã khác
    const kept = withSuggestedAxes({ ...d, axisMap: { 'att-size': CUSTOM_AXIS } }, AXES, sug, codes, true);
    expect(kept.axisMap['att-size']).toBe(CUSTOM_AXIS);
    expect(kept.valueMap['val-m']).toBeUndefined();
    // sàn không nhận tên tự đặt, hoặc mã cũ không có ở leaf mới: thay bằng gợi ý, bỏ giá trị cũ của trục
    expect(withSuggestedAxes({ ...d, axisMap: { 'att-size': CUSTOM_AXIS } }, AXES, sug, codes, false).axisMap['att-size']).toBe('size');
    const moved = withSuggestedAxes({ ...d, axisMap: { 'att-mau': 'old' }, valueMap: { 'val-den': 'x' } }, AXES, sug, codes, true);
    expect(moved).toMatchObject({ axisMap: { 'att-mau': 'color_family' }, valueMap: { 'val-den': 'Đen' } });
  });

  it('thiếu theo năng lực trục: tên tự đặt bị cấm, vượt số trục, thiếu sales attribute bắt buộc', () => {
    const facts = { originCountry: 'VN', brand: null };
    const spec = { attributes: {}, axisMap: { 'att-mau': CUSTOM_AXIS, 'att-size': 'size' } };
    const caps = { maxAxes: 1, customAxisName: false, salesRequired: ['color_family'] };
    expect(specMissing([], spec, AXES, facts, caps).map((m) => m.reason)).toEqual(['axis_unmapped', 'axis_limit', 'sales_required']);
    expect(specMissing([], spec, AXES, facts, { maxAxes: 2, customAxisName: true, salesRequired: [] })).toEqual([]);
  });

  it('giá trị: trùng nhãn; kích cỡ so phần sau ":" và ưu tiên INT; không khớp để trống', () => {
    const map = suggestValueMap(AXES, { 'att-mau': 'color_family', 'att-size': 'size' }, [COLOR, SIZE], {});
    expect(map).toEqual({ 'val-den': 'Đen', 'val-m': 'Int:M' });
  });

  it('trục từ biến thể chưa lưu trữ, không lặp giá trị', () => {
    const v = (vals: [string, string][], archivedAt: string | null = null) => ({
      archivedAt,
      attributes: vals.map(([valueId, value]) => ({
        attributeId: valueId.startsWith('val-s') || valueId === 'val-m' ? 'att-size' : 'att-mau',
        attributeName: valueId === 'val-m' || valueId.startsWith('val-s') ? 'Kích cỡ' : 'Màu sắc',
        valueId,
        value,
      })),
    });
    const axes = productAxes([v([['val-den', 'Đen'], ['val-m', 'M']]), v([['val-den', 'Đen'], ['val-s', 'S']]), v([['val-do', 'Đỏ'], ['val-m', 'M']], 'x')]);
    expect(axes.map((a) => [a.attributeId, a.values.map((x) => x.value)])).toEqual([
      ['att-mau', ['Đen']],
      ['att-size', ['M', 'S']],
    ]);
  });
});

describe('Hiển thị', () => {
  it('nhãn giá trị: mã lựa chọn ra nhãn, giá trị riêng giữ nguyên', () => {
    expect(valueLabel(MATERIAL, 'm1')).toBe('Cotton');
    expect(valueLabel(MATERIAL, ['m1', 'Lụa'])).toBe('Cotton, Lụa');
  });

  it('quyền category: chỉ available và null (Lazada) không chặn', () => {
    expect(permissionBlocked('available')).toBe(false);
    expect(permissionBlocked(null)).toBe(false);
    expect(permissionBlocked('invite_only')).toBe(true);
    expect(permissionBlocked('prohibited')).toBe(true);
  });
});

describe('fieldHint', () => {
  const opts = (n: number) => Array.from({ length: n }, (_, k) => ({ id: `o${k}`, label: `L${k}` }));
  it('mô tả cách nhập theo input, số lựa chọn, allowCustom, giá trị hồ sơ công ty', () => {
    expect(fieldHint(attr({ input: 'select', options: opts(5), allowCustom: false }))).toBe('Chọn 1 trong 5 giá trị của sàn');
    expect(fieldHint(attr({ input: 'select', options: opts(3), allowCustom: true }))).toBe('Chọn trong 3 gợi ý hoặc gõ giá trị riêng');
    expect(fieldHint(attr({ input: 'multiselect', options: [], allowCustom: true }))).toBe('Gõ giá trị rồi chọn để thêm');
    expect(fieldHint(attr({ input: 'text', options: [], defaultValue: 'Công ty ABC' }))).toBe('Để trống thì dùng giá trị từ hồ sơ công ty');
    expect(fieldHint(attr({ input: 'image', options: [] }))).toBe('');
  });
});

describe('cascadePath', () => {
  it('ghép mã các cấp đã chọn thành path, tách lại được; rỗng là cấp đầu', () => {
    expect(cascadePath([])).toBe('');
    expect(cascadeLevels(cascadePath(['vn', 'vn-hcm']))).toEqual(['vn', 'vn-hcm']);
    expect(cascadeLevels('')).toEqual([]);
  });
});

describe('profilePatch', () => {
  it('chỉ ghi trường có giá trị của ô đang tick', () => {
    expect(profilePatch(['101490', '101489'], { '101490': ' 12 Lê Lợi, Q1 ', '101489': '' }, 5)).toEqual({
      responsibleAddress: '12 Lê Lợi, Q1',
      version: 5,
    });
  });

  it('không có gì để ghi thì null; mã lạ bỏ qua', () => {
    expect(profilePatch(['101490'], {}, 1)).toBeNull();
    expect(profilePatch(['100149'], { '100149': 'VN' }, 1)).toBeNull();
  });
});

describe('Giá trị tự điền (resolved, Documents/21 §18.8.2)', () => {
  const resolved = {
    '100149': { value: 'VN', source: 'catalog' as const, fieldId: null },
    '101489': { value: 'Công ty ABC', source: 'company' as const, fieldId: null },
    brand: { value: 'No Brand', source: 'default' as const, fieldId: null },
    material: { value: 'm9', source: 'override' as const, fieldId: null },
  };

  it('ghi đè trong nháp đè giá trị gốc; ghi đè đã bỏ thì không lấy lại giá trị ghi đè cũ của BE', () => {
    expect(mergedValues({ brand: 'ACME' }, resolved)).toEqual({ '100149': 'VN', '101489': 'Công ty ABC', brand: 'ACME' });
    expect(mergedValues({}, undefined)).toEqual({});
  });

  it('nguồn từng ô: nháp có ghi đè là override, không thì nguồn BE; chưa có giá trị là null', () => {
    expect(valueSource('brand', { brand: 'ACME' }, resolved)).toBe('override');
    expect(valueSource('100149', {}, resolved)).toBe('catalog');
    expect(valueSource('material', {}, resolved)).toBeNull();
    expect(valueSource('x', { x: '' }, resolved)).toBeNull();
  });
});

describe('Nút Lưu chỉ bật khi giá trị thật sự đổi', () => {
  const resolved = {
    org: { value: 'Jastech', source: 'company' as const, fieldId: null },
    mat: { value: 'm9', source: 'override' as const, fieldId: null },
    tags: { value: ['a', 'b'], source: 'catalog' as const, fieldId: 'f1' },
  };
  it('Sửa riêng mà giữ nguyên giá trị gốc thì chưa đổi; đổi giá trị, bỏ ghi đè đã lưu thì có đổi', () => {
    expect(valuesChanged({ mat: 'm9', org: 'Jastech' }, { mat: 'm9' }, resolved)).toBe(false);
    expect(valuesChanged({ mat: 'm9', tags: ['b', 'a'] }, { mat: 'm9' }, resolved)).toBe(false);
    expect(valuesChanged({ mat: 'm9', org: 'Khác' }, { mat: 'm9' }, resolved)).toBe(true);
    expect(valuesChanged({}, { mat: 'm9' }, resolved)).toBe(true);
  });
});

describe('draftMissing: tin missing của BE, tính lại có resolved (kiểm người bán KB3 3.10)', () => {
  const LICENSE = attr({ code: 'license_no', label: 'Số đăng kí', required: true });
  const attrs = [MATERIAL, LICENSE];
  const base = { attrs, axes: [], facts: FACTS, caps: null };
  const fromCatalog = { license_no: { value: 'GP-123', source: 'catalog' as const, fieldId: 'f1' } };

  it('đã lưu, chưa sửa: trả nguyên missing của BE, kể cả khi bản nháp không có giá trị ghi đè', () => {
    const saved = { spec: spec({ attributes: {} }), missing: [], resolved: fromCatalog };
    expect(draftMissing({ ...base, draft: draftFromSpec(saved.spec), dirty: false, saved, forLeaf: undefined })).toEqual([]);
  });

  it('đang sửa: giá trị tự điền từ thông số sản phẩm (nguồn catalog) không bị báo thiếu', () => {
    const saved = { spec: spec({ attributes: {} }), missing: [], resolved: fromCatalog };
    const draft = { ...draftFromSpec(saved.spec), attributes: {} };
    expect(draftMissing({ ...base, draft, dirty: true, saved, forLeaf: undefined }).map((m) => m.code)).toEqual(['material']);
  });

  it('đổi category: dùng resolved của leaf mới; chưa chọn category thì thiếu category', () => {
    const saved = { spec: spec(), missing: [], resolved: {} };
    const draft = { ...draftFromSpec(saved.spec), externalCategoryId: '999', attributes: { material: 'm1' } };
    expect(draftMissing({ ...base, draft, dirty: true, saved, forLeaf: { resolved: fromCatalog } })).toEqual([]);
    expect(draftMissing({ ...base, draft, dirty: true, saved, forLeaf: undefined }).map((m) => m.code)).toEqual(['license_no']);
    expect(draftMissing({ ...base, draft: { ...draft, externalCategoryId: '' }, dirty: true, saved, forLeaf: undefined })[0]?.code).toBe('category');
  });
});

describe('Gộp thuộc tính biến thể (FE#459)', () => {
  const VARIANTS = [
    { archivedAt: null, attributes: [{ attributeId: 'att-mau', value: 'Đen' }, { attributeId: 'att-size', value: 'M' }] },
    { archivedAt: null, attributes: [{ attributeId: 'att-mau', value: 'Xanh rêu' }, { attributeId: 'att-size', value: 'M' }] },
    { archivedAt: '2026-01-01', attributes: [{ attributeId: 'att-mau', value: 'Trắng' }, { attributeId: 'att-size', value: 'M' }] },
  ] as unknown as Parameters<typeof combinedValues>[0];

  it('đếm theo đích khác nhau; mỗi tên tự đặt hoặc chưa ánh xạ tính riêng', () => {
    expect(axisTargetCount(AXES, { 'att-mau': 'variation', 'att-size': 'variation' })).toBe(1);
    expect(axisTargetCount(AXES, { 'att-mau': 'color_family', 'att-size': 'size' })).toBe(2);
    expect(axisTargetCount(AXES, { 'att-mau': CUSTOM_AXIS, 'att-size': CUSTOM_AXIS })).toBe(2);
    expect(axisTargetCount(AXES, {})).toBe(2);
  });

  it('gộp: mọi trục trỏ đích ghép, bỏ giá trị chuẩn, không gửi valueMap; hết axis_limit', () => {
    const d = { ...draftFromSpec(spec()), axisMap: { 'att-mau': 'color_family', 'att-size': 'size' }, valueMap: { 'val-den': 'Đen', 'val-m': 'M' } };
    const g = withCombinedAxes(d, AXES, 'variation');
    expect(g.axisMap).toEqual({ 'att-mau': 'variation', 'att-size': 'variation' });
    expect(g.valueMap).toEqual({});
    expect([...combinedGroups(AXES, g.axisMap).keys()]).toEqual(['variation']);
    expect(combinedGroups(AXES, d.axisMap).size).toBe(0);
    const input = specInput({ ...g, valueMap: { 'val-den': 'Đen' } }, ATTRS, AXES);
    expect(input.axisMap).toEqual({ 'att-mau': 'variation', 'att-size': 'variation' });
    expect(input.valueMap).toEqual({});
    const caps = { maxAxes: 1, customAxisName: true, salesRequired: [] };
    expect(specMissing([], d, AXES, FACTS, caps).map((m) => m.reason)).toEqual(['axis_limit']);
    expect(specMissing([], g, AXES, FACTS, caps)).toEqual([]);
  });

  it('giá trị ghép theo thứ tự trục, bỏ SKU lưu trữ, bỏ trùng', () => {
    expect(combinedValues(VARIANTS, AXES)).toEqual(['Đen - M', 'Xanh rêu - M']);
  });
});
