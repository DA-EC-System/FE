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
  specInput,
  specMissing,
  stepOfError,
  stepOfMissing,
  suggestValueMap,
  valueLabel,
  withAttribute,
  withAxis,
  withCategory,
  type ProductAxis,
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

  it('xuất xứ chưa điền ở trang sản phẩm: thiếu kèm lời chỉ chỗ sửa', () => {
    const m = specMissing(ATTRS, spec({ attributes: { material: 'm1', collar: 'x' } }), AXES, { originCountry: null, brand: null });
    expect(m).toEqual([{ code: '100149', label: 'Quốc gia xuất xứ (điền ở trang sản phẩm)', reason: 'required' }]);
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

  it('chỉ gửi tier category và company khác defaultValue; bỏ product, sales, mã không có ở leaf, trục lạ', () => {
    const d = {
      ...draftFromSpec(spec()),
      attributes: { material: 'm1', '101489': 'Công ty ABC', '100149': 'VN', color_family: 'Đen', old: 'x', collar: ['a', 'b'] },
      axisMap: { 'att-mau': 'color_family', 'att-cu': 'size' },
      valueMap: { 'val-den': 'Đen', 'val-cu': 'x' },
    };
    expect(specInput(d, ATTRS, AXES)).toEqual({
      externalCategoryId: '7930',
      attributes: { material: 'm1', collar: ['a', 'b'] },
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
