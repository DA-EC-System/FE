import { describe, expect, it } from 'vitest';
import type { PlatformAttribute } from '@/types/shop';
import { attributeGroup, groupAttributes, hasCondition, inputSummary, isPlatformTab, parentPath } from './platformCategory';

const attr = (over: Partial<PlatformAttribute>): PlatformAttribute => ({
  code: 'x',
  label: 'X',
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

describe('Nhóm attribute của leaf (commerio-backend#400)', () => {
  it('trục phân loại trước, rồi tier, rồi mức bắt buộc', () => {
    expect(attributeGroup(attr({ kind: 'sales', required: true }))).toBe('sales');
    expect(attributeGroup(attr({ tier: 'company', required: true }))).toBe('company');
    expect(attributeGroup(attr({ tier: 'product' }))).toBe('product');
    expect(attributeGroup(attr({ required: true, isKey: true }))).toBe('required');
    expect(attributeGroup(attr({ requiredWhen: [{ attributeId: '101734', valueId: '1' }] }))).toBe('conditional');
    expect(attributeGroup(attr({ isKey: true }))).toBe('key');
    expect(attributeGroup(attr({}))).toBe('optional');
  });

  it('bỏ nhóm rỗng, giữ thứ tự nhóm', () => {
    const groups = groupAttributes([attr({ code: 'o' }), attr({ code: 'r', required: true }), attr({ code: 's', kind: 'sales' })]);
    expect(groups.map((g) => [g.key, g.items.map((a) => a.code)])).toEqual([
      ['sales', ['s']],
      ['required', ['r']],
      ['optional', ['o']],
    ]);
  });

  it('điều kiện rỗng không tính là bắt buộc theo điều kiện', () => {
    expect(hasCondition({ requiredWhen: null })).toBe(false);
    expect(hasCondition({ requiredWhen: [] })).toBe(false);
    expect(hasCondition({ requiredWhen: {} })).toBe(false);
    expect(hasCondition({ requiredWhen: { any: true } })).toBe(true);
  });
});

describe('Mô tả ô nhập', () => {
  it('nêu số lựa chọn và có cho giá trị riêng không', () => {
    const options = [
      { id: '1', label: 'Đỏ' },
      { id: '2', label: 'Xanh' },
    ];
    expect(inputSummary({ input: 'select', options, allowCustom: true })).toBe('Chọn một · 2 lựa chọn · cho nhập giá trị riêng');
    expect(inputSummary({ input: 'multiselect', options, allowCustom: false })).toBe('Chọn nhiều · 2 lựa chọn');
    expect(inputSummary({ input: 'text', options: [], allowCustom: true })).toBe('Nhập chữ');
  });

  it('tab sàn, đường dẫn cha', () => {
    expect(isPlatformTab('lazada')).toBe(true);
    expect(isPlatformTab('shopee')).toBe(false);
    expect(parentPath('Thời trang nam > Áo > Áo thun')).toBe('Thời trang nam > Áo');
    expect(parentPath('Gốc')).toBe('');
  });
});
