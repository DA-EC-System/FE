import { describe, expect, it } from 'vitest';
import type { PlatformAttribute, ProductSpec } from '@/types/shop';
import {
  CUSTOM_AXIS,
  defaultAxisMap,
  draftFromSpec,
  firstErrorStep,
  firstStep,
  permissionBlocked,
  productAxes,
  profilePatch,
  mergedValues,
  specInput,
  valueSource,
  specMissing,
  stepOfError,
  stepOfMissing,
  suggestValueMap,
  valueLabel,
  withAttribute,
  withAxis,
  withCategory,
  type ProductAxis,
  fieldHint,
  cascadePath,
  cascadeLevels,
  pushReadiness,
  type ReadinessInput,
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

describe('stepOfError: lỗi 422 của PUT spec về đúng bước (FE-4)', () => {
  it.each([
    ['externalCategoryId', 0],
    ['attributes.material', 1],
    ['attributes.101489', 1],
    ['axisMap.att-mau', 2],
    ['valueMap.val-den', 2],
    ['version', 3],
  ] as const)('%s → bước %i', (key, step) => {
    expect(stepOfError(key)).toBe(step);
  });

  it('nhiều lỗi: về bước sớm nhất', () => {
    expect(firstErrorStep({ 'axisMap.att-mau': 'x', 'attributes.material': 'y' })).toBe(1);
    expect(firstErrorStep({})).toBe(3);
  });

  it('missing: category đổi về bước 1, trục về bước 3, attribute về bước 2', () => {
    expect(stepOfMissing('category_changed')).toBe(0);
    expect(stepOfMissing('category_removed')).toBe(0);
    expect(stepOfMissing('required_when')).toBe(1);
    expect(stepOfMissing('axis_unmapped')).toBe(2);
  });

  it('mở trang: chưa có spec ở Category; có spec thì vào Attributes; category đổi thì về Category', () => {
    expect(firstStep({ spec: null, missing: [] })).toBe(0);
    expect(firstStep({ spec: spec(), missing: [] })).toBe(1);
    expect(firstStep({ spec: spec(), missing: [{ code: 'category', label: 'x', reason: 'category_changed' }] })).toBe(0);
  });
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
  it('đoán theo tên: Màu ↔ Màu sắc, Kích cỡ ↔ size; giữ ánh xạ đã có; không khớp thì custom', () => {
    expect(defaultAxisMap(AXES, [COLOR, SIZE], {})).toEqual({ 'att-mau': 'color_family', 'att-size': 'size' });
    expect(defaultAxisMap(AXES, [COLOR, SIZE], { 'att-size': CUSTOM_AXIS })).toEqual({ 'att-mau': 'color_family', 'att-size': CUSTOM_AXIS });
    expect(defaultAxisMap([{ attributeId: 'x', name: 'Chất liệu', values: [] }], [COLOR], {})).toEqual({ x: CUSTOM_AXIS });
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

describe('pushReadiness (bước 4 chỉ ghi Sẵn sàng khi đẩy được thật)', () => {
  const base: ReadinessInput = {
    label: 'TikTok',
    hasCategory: true,
    attributes: 'loaded',
    missing: [],
    fillOnly: false,
    shops: [{ id: 's1', status: 'active' }],
    selected: new Set(['s1']),
    blockedShops: new Map(),
  };
  const keys = (i: Partial<ReadinessInput>) => pushReadiness({ ...base, ...i }).blockers.map((b) => b.key);

  it('đủ category, attribute, phân loại và có gian hàng đã chọn: sẵn sàng', () => {
    expect(pushReadiness(base)).toEqual({ ready: true, blockers: [] });
  });

  it('không có gian hàng của sàn (lỗi staging 19/11/2026): chưa sẵn sàng, nói rõ và đưa sang trang gian hàng', () => {
    const r = pushReadiness({ ...base, attributes: 'failed', shops: [], selected: new Set() });
    expect(r.ready).toBe(false);
    expect(r.blockers).toEqual([
      { key: 'attributes', label: expect.stringContaining('Chưa tải được attribute'), action: { kind: 'step', step: 1 } },
      { key: 'no_shop', label: 'Công ty chưa có gian hàng TikTok nào', action: { kind: 'shops' } },
    ]);
  });

  it('attribute đang tải hoặc tải lỗi thì chưa sẵn sàng; chưa chọn category thì không kiểm attribute', () => {
    expect(keys({ attributes: 'loading' })).toEqual(['attributes']);
    expect(keys({ attributes: 'failed' })).toEqual(['attributes']);
    const category = { code: 'category', label: 'Chưa chọn category TikTok', reason: 'category_changed' as const };
    expect(pushReadiness({ ...base, hasCategory: false, attributes: 'failed', missing: [category] }).blockers).toEqual([
      { key: 'category_changed-category', label: 'Chưa chọn category TikTok', action: { kind: 'step', step: 0 } },
    ]);
  });

  it('mục còn thiếu đưa về đúng bước, category trước attribute', () => {
    const r = pushReadiness({
      ...base,
      attributes: 'failed',
      missing: [
        { code: 'att-mau', label: 'Màu', reason: 'axis_unmapped' },
        { code: 'category', label: 'Category trên sàn đã đổi', reason: 'category_changed' },
        { code: 'material', label: 'Chất liệu', reason: 'required' },
      ],
    });
    expect(r.blockers.map((b) => [b.key, b.action])).toEqual([
      ['category_changed-category', { kind: 'step', step: 0 }],
      ['attributes', { kind: 'step', step: 1 }],
      ['axis_unmapped-att-mau', { kind: 'step', step: 2 }],
      ['required-material', { kind: 'step', step: 1 }],
    ]);
  });

  it('có gian hàng nhưng không cái nào đẩy được, hoặc chưa chọn cái đẩy được', () => {
    expect(keys({ shops: [{ id: 's1', status: 'needs_reauth' }, { id: 's2', status: 'disconnected' }] })).toEqual(['no_usable_shop']);
    expect(keys({ blockedShops: new Map([['s1', 'Sàn cấm bán']]) })).toEqual(['no_usable_shop']);
    expect(keys({ selected: new Set() })).toEqual(['no_selected_shop']);
    expect(pushReadiness({ ...base, selected: new Set() }).blockers[0].action).toBeNull();
  });

  it('chế độ chỉ lưu không cần gian hàng nhưng vẫn cần attribute đã tải', () => {
    expect(pushReadiness({ ...base, fillOnly: true, shops: [], selected: new Set() }).ready).toBe(true);
    expect(keys({ fillOnly: true, shops: [], attributes: 'failed' })).toEqual(['attributes']);
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
