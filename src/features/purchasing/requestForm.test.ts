import { describe, expect, it } from 'vitest';
import { newProductName, optionsLabel, parentKey, requestFormSchema, requestFormSchemaFor, type RequestLineDraft } from './shared';

const line = (patch: Partial<RequestLineDraft>): RequestLineDraft => ({
  variantId: null,
  sku: '',
  productName: '',
  attributesLabel: '',
  isNew: true,
  parentMode: 'new',
  parentId: '',
  parentName: 'Áo polo',
  categoryId: 'cat-ao',
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
    expect(errorsOf([line({ parentName: '', categoryId: '' })])).toMatchObject({
      'lines.0.parentName': 'Nhập tên sản phẩm cha',
      'lines.0.categoryId': 'Chọn danh mục',
    });
    expect(errorsOf([line({ parentMode: 'existing', parentName: '' })])).toMatchObject({
      'lines.0.parentId': 'Chọn sản phẩm cha',
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
    expect(e['lines.0.options.1.axis']).toBe('Chọn trục phân loại');
  });

  it('các dòng cùng tên cha mới gộp một cha: quá 2 trục thì báo', () => {
    const e = errorsOf([
      line({ options: [{ axis: 'Màu sắc', value: 'Đen' }, { axis: 'Kích cỡ', value: 'M' }] }),
      line({ parentName: '  áo  POLO ', options: [{ axis: 'Chất liệu', value: 'Cotton' }] }),
    ]);
    expect(e['lines.0.options']).toMatch(/3 trục phân loại; tối đa 2/);
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
      'lines.1.options': 'Trùng phân loại với dòng 1 cùng sản phẩm cha',
    });
    expect(errorsOf([line({ options: opts }), line({ parentName: 'Áo thun', options: opts })])).toEqual({});
  });

  it('cha có sẵn: trùng tổ hợp cũng báo; dòng biến thể có sẵn không bị xét', () => {
    const existing = { parentMode: 'existing' as const, parentId: 'prd-1', options: [{ axis: 'Kích cỡ', value: 'M' }] };
    expect(errorsOf([line(existing), line(existing)])['lines.1.options']).toMatch(/^Trùng phân loại/);
    expect(errorsOf([line({ isNew: false, variantId: 'v1', parentName: '' })])).toEqual({});
  });

  it('BE chưa nhận cha (cờ tắt): không xét gộp cha, chỉ chặn hai dòng trùng hẳn tên', () => {
    const errorsNoParent = (lines: RequestLineDraft[]) => {
      const r = requestFormSchemaFor(false).safeParse({ supplierId: 'sup-1', note: '', lines });
      return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]));
    };
    // Cùng tên "Áo polo", trục khác nhau: hai sản phẩm riêng, không báo thiếu trục hay quá 2 trục
    expect(
      errorsNoParent([
        line({ options: [{ axis: 'Màu sắc', value: 'Đen' }, { axis: 'Kích cỡ', value: 'M' }] }),
        line({ options: [{ axis: 'Chất liệu', value: 'Cotton' }] }),
      ]),
    ).toEqual({});
    expect(
      errorsNoParent([line({ options: [{ axis: 'Màu sắc', value: 'Đen' }] }), line({ parentName: 'áo  POLO', options: [{ axis: 'Màu sắc', value: 'đen' }] })]),
    ).toMatchObject({ 'lines.1.options': 'Trùng tên sản phẩm với dòng 1' });
    expect(newProductName(line({ parentName: ' Áo polo ', options: [{ axis: 'Màu sắc', value: 'Đen' }, { axis: '', value: '' }] }))).toBe(
      'Áo polo Đen',
    );
  });

  it('khoá nhóm và nhãn phân loại', () => {
    expect(parentKey({ parentMode: 'new', parentId: '', parentName: ' Áo  Polo ' })).toBe('new:áo polo');
    expect(parentKey({ parentMode: 'existing', parentId: 'prd-1', parentName: 'x' })).toBe('id:prd-1');
    expect(optionsLabel({ 'Màu sắc': 'Đen', 'Kích cỡ': 'M' })).toBe('Màu sắc: Đen · Kích cỡ: M');
  });
});
