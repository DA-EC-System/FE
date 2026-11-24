import { describe, expect, it } from 'vitest';
import { optionsLabel, parentKey, requestFormSchema, type RequestLineDraft } from './shared';

const line = (patch: Partial<RequestLineDraft>): RequestLineDraft => ({
  variantId: null,
  sku: '',
  productName: '',
  attributesLabel: '',
  isNew: true,
  parentMode: 'new',
  parentId: '',
  parentName: 'Áo polo nam cổ bẻ cotton cao cấp',
  groupId: 'cat-ao',
  options: [],
  quantity: '5',
  unitCost: '100000',
  ...patch,
});

const errorsOf = (lines: RequestLineDraft[]) => {
  const r = requestFormSchema.safeParse({ supplierId: 'sup-1', note: '', lines });
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]));
};

describe('Dòng sản phẩm mới của đề nghị nhập (Documents/21)', () => {
  it('cha mới cần tên và danh mục; cha có sẵn cần chọn cha', () => {
    expect(errorsOf([line({ parentName: '', groupId: '' })])).toMatchObject({
      'lines.0.parentName': 'Tên sản phẩm cần ít nhất 25 ký tự (hiện 0)',
      'lines.0.groupId': 'Chọn danh mục sản phẩm',
    });
    expect(errorsOf([line({ parentMode: 'existing', parentName: '' })])).toMatchObject({
      'lines.0.parentId': 'Chọn sản phẩm',
    });
  });

  it('trục có mà thiếu giá trị, giá trị có mà thiếu trục', () => {
    const e = errorsOf([
      line({
        options: [
          { axis: 'Màu sắc', value: '' },
          { axis: '', value: 'L' },
        ],
      }),
    ]);
    expect(e['lines.0.options.0.value']).toBe('Nhập màu sắc');
    expect(e['lines.0.options.1.axis']).toBe('Chọn thuộc tính biến thể');
  });

  it('tên cha mới dưới 25 ký tự (sau khi trim) thì báo, đủ 25 thì đạt', () => {
    expect(errorsOf([line({ parentName: '  Áo thun cotton nam cổ tr  ' })])).toMatchObject({
      'lines.0.parentName': 'Tên sản phẩm cần ít nhất 25 ký tự (hiện 24)',
    });
    expect(errorsOf([line({ parentName: '  Áo thun cotton nam cổ trò  ' })])['lines.0.parentName']).toBeUndefined();
  });

  it('tên cha mới quá 120 ký tự thì báo; cha có sẵn tên dài (lấy từ danh mục) không bị chặn', () => {
    const long = `Áo ${'a'.repeat(120)}`;
    expect(errorsOf([line({ parentName: long })])).toMatchObject({ 'lines.0.parentName': 'Tên sản phẩm tối đa 120 ký tự' });
    expect(errorsOf([line({ parentMode: 'existing', parentId: 'p-1', parentName: long })])).toEqual({});
  });

  it('các dòng cùng tên cha mới gộp một cha: quá 2 trục thì báo', () => {
    const e = errorsOf([
      line({ options: [{ axis: 'Màu sắc', value: 'Đen' }, { axis: 'Kích cỡ', value: 'M' }] }),
      line({ parentName: '  áo  POLO nam cổ bẻ   cotton cao CẤP ', options: [{ axis: 'Chất liệu', value: 'Cotton' }] }),
    ]);
    expect(e['lines.0.options']).toMatch(/3 thuộc tính biến thể; tối đa 2/);
    expect(e['lines.1.options']).toMatch(/tối đa 2/);
  });

  it('dòng cùng cha thiếu một trục của cha thì báo', () => {
    const e = errorsOf([
      line({ options: [{ axis: 'Màu sắc', value: 'Đen' }, { axis: 'Kích cỡ', value: 'M' }] }),
      line({ options: [{ axis: 'Màu sắc', value: 'Trắng' }] }),
    ]);
    expect(e['lines.1.options']).toMatch(/^Thiếu kích cỡ/);
    expect(e['lines.0.options']).toBeUndefined();
  });

  it('trùng tổ hợp giá trị trong cùng cha thì báo ở dòng sau; khác cha thì không', () => {
    const opts = [{ axis: 'Màu sắc', value: 'Đen' }];
    expect(errorsOf([line({ options: opts }), line({ options: [{ axis: 'Màu sắc', value: 'đen' }] })])).toMatchObject({
      'lines.1.options': 'Trùng phân loại với dòng 1 cùng sản phẩm',
    });
    expect(errorsOf([line({ options: opts }), line({ parentName: 'Áo thun nam cổ tròn cotton cao cấp', options: opts })])).toEqual({});
  });

  it('cha có sẵn: trùng tổ hợp cũng báo; dòng biến thể có sẵn không bị xét', () => {
    const existing = { parentMode: 'existing' as const, parentId: 'prd-1', options: [{ axis: 'Kích cỡ', value: 'M' }] };
    expect(errorsOf([line(existing), line(existing)])['lines.1.options']).toMatch(/^Trùng phân loại/);
    expect(errorsOf([line({ isNew: false, variantId: 'v1', parentName: '' })])).toEqual({});
  });

  it('khoá nhóm và nhãn phân loại', () => {
    expect(parentKey({ parentMode: 'new', parentId: '', parentName: ' Áo  Polo ' })).toBe('new:áo polo');
    expect(parentKey({ parentMode: 'existing', parentId: 'prd-1', parentName: 'x' })).toBe('id:prd-1');
    expect(optionsLabel({ 'Màu sắc': 'Đen', 'Kích cỡ': 'M' })).toBe('Màu sắc: Đen · Kích cỡ: M');
  });
});
