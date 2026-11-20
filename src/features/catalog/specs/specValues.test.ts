// Giá trị thông số của sản phẩm (Documents/21 §5.5)
import { describe, expect, it } from 'vitest';
import { draftsFromProduct, missingRequired, specErrorsByField, specInputs, type SpecFieldView } from './specValues';
import type { ProductSpecValue } from '@/types/catalog';

const view = (over: Partial<SpecFieldView>): SpecFieldView => ({
  fieldId: 'f',
  name: 'F',
  input: 'select',
  unit: null,
  allowCustom: false,
  required: false,
  inTemplate: true,
  choices: [],
  ...over,
});
const material = view({ fieldId: 'f-chat', input: 'multiselect', allowCustom: true, required: true });
const pattern = view({ fieldId: 'f-hoa', input: 'select' });
const volume = view({ fieldId: 'f-dt', input: 'number', unit: 'ml', required: true });
const views = [material, pattern, volume];

describe('specInputs', () => {
  it('tạo: chỉ gửi thông số có giá trị, giá trị mới đi bằng newValues', () => {
    const drafts = {
      'f-chat': { optionIds: ['o-cot'], newValues: ['Lụa tơ tằm'], value: '' },
      'f-hoa': { optionIds: [], newValues: [], value: '' },
      'f-dt': { optionIds: [], newValues: [], value: ' 50 ' },
    };
    expect(specInputs(views, drafts)).toEqual([
      { fieldId: 'f-chat', optionIds: ['o-cot'], newValues: ['Lụa tơ tằm'] },
      { fieldId: 'f-dt', value: '50' },
    ]);
  });

  it('sửa: chỉ gửi thông số đã đổi, đổi thành trống là xoá', () => {
    const initial = {
      'f-chat': { optionIds: ['o-cot', 'o-pol'], newValues: [], value: '' },
      'f-hoa': { optionIds: ['o-tron'], newValues: [], value: '' },
      'f-dt': { optionIds: [], newValues: [], value: '50' },
    };
    const drafts = {
      'f-chat': { optionIds: ['o-pol', 'o-cot'], newValues: [], value: '' },
      'f-hoa': { optionIds: [], newValues: [], value: '' },
      'f-dt': { optionIds: [], newValues: [], value: '' },
    };
    expect(specInputs(views, drafts, initial)).toEqual([
      { fieldId: 'f-hoa', optionIds: [] },
      { fieldId: 'f-dt', value: '' },
    ]);
  });
});

describe('đọc và kiểm', () => {
  it('draftsFromProduct lấy id lựa chọn đã chọn và value', () => {
    const specs = [
      { fieldId: 'f-chat', selected: [{ id: 'o-cot', value: 'Cotton' }], value: null },
      { fieldId: 'f-dt', selected: [], value: '50' },
    ] as ProductSpecValue[];
    expect(draftsFromProduct(specs)).toEqual({
      'f-chat': { optionIds: ['o-cot'], newValues: [], value: '' },
      'f-dt': { optionIds: [], newValues: [], value: '50' },
    });
  });

  it('missingRequired bỏ qua thông số ngoài mẫu', () => {
    const outside = view({ fieldId: 'f-x', required: true, inTemplate: false });
    const drafts = { 'f-chat': { optionIds: ['o'], newValues: [], value: '' } };
    expect(missingRequired([...views, outside], drafts).map((v) => v.fieldId)).toEqual(['f-dt']);
  });

  it('specErrorsByField ghép lỗi specs.<i> về đúng thông số đã gửi', () => {
    const sent = [{ fieldId: 'f-chat', optionIds: [] }, { fieldId: 'f-dt', value: 'abc' }];
    expect(specErrorsByField({ 'specs.1': 'Phải là số', name: 'x' }, sent)).toEqual({ 'f-dt': 'Phải là số' });
  });
});
