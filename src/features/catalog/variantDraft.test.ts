// Thuộc tính biến thể kiểu seller center (FE#350 phần 3, Documents/21 §5.2)
import { describe, expect, it } from 'vitest';
import type { Attribute, ProductSettings } from '@/types/catalog';
import {
  axisErrors,
  axisServerErrors,
  draftBody,
  draftError,
  draftRows,
  emptyDraft,
  factsOf,
  fillFacts,
  imageKey,
  parseFact,
  valueError,
  type AxisDraft,
  type VariantDraft,
} from './variantDraft';

const attributes = [
  {
    id: 'att-mau',
    name: 'Màu sắc',
    platformKind: 'color',
    values: [
      { id: 'val-den', value: 'Đen', code: 'DEN' },
      { id: 'val-trang', value: 'Trắng', code: 'TRANG' },
    ],
  },
  { id: 'att-chat', name: 'Chất liệu', platformKind: null, values: [{ id: 'val-cot', value: 'Cotton', code: 'COT' }] },
] as unknown as Attribute[];

const settings = { skuPattern: 'SP{SEQ:5}-{VAL}', skuNextSeq: 7, suggest: {}, version: 1 } as unknown as ProductSettings;
const axis = (over: Partial<AxisDraft>): AxisDraft => ({ key: 'k', attributeId: null, name: '', values: [], ...over });

describe('valueError', () => {
  const mau = axis({ name: 'Màu sắc', values: ['Đen'] });
  it('chặn rỗng, quá 20 ký tự, trùng không phân biệt hoa thường, quá 50 giá trị', () => {
    expect(valueError(mau, '  ')).toBe('Nhập giá trị');
    expect(valueError(mau, 'x'.repeat(21))).toBe('Mỗi giá trị tối đa 20 ký tự');
    expect(valueError(mau, ' đen ')).toBe('Đã có giá trị đen');
    expect(valueError(axis({ values: Array.from({ length: 50 }, (_, i) => `v${i}`) }), 'mới')).toBe('Mỗi thuộc tính biến thể tối đa 50 giá trị');
    expect(valueError(mau, 'Xanh rêu')).toBeNull();
  });
});

describe('axisErrors, draftError', () => {
  it('tên trống, quá 15 ký tự, hai nhóm trùng tên, nhóm chưa có giá trị', () => {
    const draft: VariantDraft = {
      axes: [axis({ name: 'Màu', values: ['Đen'] }), axis({ name: ' màu ', values: [] })],
      excluded: [],
    };
    expect(axisErrors(draft)).toEqual([
      { name: 'Hai thuộc tính biến thể trùng tên' },
      { name: 'Hai thuộc tính biến thể trùng tên', values: 'Thêm ít nhất một giá trị' },
    ]);
    expect(axisErrors({ axes: [axis({ name: 'A'.repeat(16), values: ['x'] })], excluded: [] })[0]!.name).toBe(
      'Tên thuộc tính biến thể tối đa 15 ký tự',
    );
    expect(draftError(draft)).toBe('Sửa lỗi ở thuộc tính biến thể');
  });

  it('không có nhóm: một variant mặc định; bỏ tick hết thì báo; quá 100 thì báo', () => {
    expect(draftError(emptyDraft)).toBeNull();
    const one: VariantDraft = { axes: [axis({ name: 'Cỡ', values: ['S'] })], excluded: ['s'] };
    expect(draftError(one)).toBe('Cần ít nhất một biến thể');
    const many = (n: number) => Array.from({ length: n }, (_, i) => `v${i}`);
    expect(draftError({ axes: [axis({ name: 'A', values: many(11) }), axis({ name: 'B', values: many(10) })], excluded: [] })).toBe(
      'Tối đa 100 biến thể mỗi lần tạo',
    );
  });
});

describe('draftBody', () => {
  it('nhóm có sẵn gửi attributeId, giá trị có sẵn kèm id; tên tự đặt gửi name; bỏ tổ hợp đã loại', () => {
    const draft: VariantDraft = {
      axes: [
        axis({ attributeId: 'att-mau', name: 'Màu sắc', values: ['đen', 'Xanh rêu'] }),
        axis({ name: 'Hoạ tiết', values: ['Kẻ caro'] }),
      ],
      excluded: ['xanh rêu|kẻ caro'],
    };
    expect(draftBody(draft, attributes)).toEqual({
      axes: [
        { attributeId: 'att-mau', values: [{ id: 'val-den', value: 'Đen' }, { value: 'Xanh rêu' }] },
        { name: 'Hoạ tiết', values: [{ value: 'Kẻ caro' }] },
      ],
      variants: [{ options: ['đen', 'Kẻ caro'] }],
    });
  });

  it('gõ tay trùng tên thuộc tính có sẵn thì dùng thuộc tính đó', () => {
    const body = draftBody({ axes: [axis({ name: 'chất liệu', values: ['Cotton'] })], excluded: [] }, attributes);
    expect(body.axes).toEqual([{ attributeId: 'att-chat', values: [{ id: 'val-cot', value: 'Cotton' }] }]);
  });

  it('không có nhóm: axes rỗng, một variant options rỗng', () => {
    expect(draftBody(emptyDraft, attributes)).toEqual({ axes: [], variants: [{ options: [] }] });
  });
});

describe('draftRows', () => {
  it('SKU dự kiến chạy số từ skuNextSeq theo tổ hợp được giữ, mã có sẵn hoặc sinh từ chữ', () => {
    const draft: VariantDraft = {
      axes: [axis({ attributeId: 'att-mau', name: 'Màu sắc', values: ['Đen', 'Xanh rêu'] }), axis({ name: 'Cỡ', values: ['S', 'M'] })],
      excluded: ['đen|m'],
    };
    expect(draftRows(draft, attributes, settings).map((r) => r.sku)).toEqual([
      'SP00007-DEN-S',
      null,
      'SP00008-XANHRE-S',
      'SP00009-XANHRE-M',
    ]);
    expect(draftRows(draft, attributes, undefined).every((r) => r.sku === null)).toBe(true);
  });
});

it('axisServerErrors: gắn lỗi BE vào nhóm, còn lại là lỗi chung', () => {
  expect(
    axisServerErrors({ 'axes.1.values.0.value': 'Quá dài', 'axes.0.name': 'Trùng', variants: 'Trùng tổ hợp', name: 'x' }, 2),
  ).toEqual({ byAxis: [['Trùng'], ['Quá dài']], general: ['Trùng tổ hợp'] });
});

describe('giá, cân nặng, kích thước khi tạo (Documents/21 §5.5)', () => {
  const two: VariantDraft = { axes: [axis({ attributeId: 'att-mau', name: 'Màu sắc', values: ['Đen', 'Trắng'] })], excluded: [] };

  it('parseFact bỏ dấu nghìn, chặn số không nguyên dương và quá trần', () => {
    expect(parseFact('standardPrice', '120.000')).toEqual({ value: 120000 });
    expect(parseFact('weightG', ' ')).toEqual({ value: null });
    expect(parseFact('weightG', '1,5kg').error).toBe('Số nguyên dương');
    expect(parseFact('weightG', '60000').error).toBe('Quá 50 kg, kiểm tra lại đơn vị gram');
    expect(parseFact('lengthMm', '2001').error).toBe('Quá 2 m, kiểm tra lại đơn vị mm');
  });

  it('kích thước phải đủ ba cạnh hoặc bỏ trống cả ba', () => {
    expect(factsOf({ lengthMm: '300' }).errors).toEqual({ widthMm: 'Nhập đủ ba cạnh', heightMm: 'Nhập đủ ba cạnh' });
    expect(factsOf({ lengthMm: '300', widthMm: '200', heightMm: '20', weightG: '250' })).toEqual({
      facts: { lengthMm: 300, widthMm: 200, heightMm: 20, weightG: 250 },
      errors: {},
    });
  });

  it('điền một lần chỉ điền ô trống của variant được giữ, không ghi đè', () => {
    const draft = { ...two, excluded: ['trắng'], facts: { 'đen': { weightG: '300' } } };
    const filled = fillFacts(draft, { weightG: '250', standardPrice: '99000' });
    expect(filled.facts).toEqual({ 'đen': { weightG: '300', standardPrice: '99000' } });
  });

  it('draftBody gửi số theo từng variant; ô lỗi chặn tạo', () => {
    const draft = { ...two, facts: { 'đen': { targetNetPrice: '80.000' }, 'trắng': { weightG: 'abc' } } };
    expect(draftError(draft)).toBe('Sửa ô giá, cân nặng, kích thước đang báo lỗi');
    const ok = { ...two, facts: { 'đen': { targetNetPrice: '80.000' } } };
    expect(draftError(ok)).toBeNull();
    expect(draftBody(ok, attributes).variants).toEqual([{ options: ['Đen'], targetNetPrice: 80000 }, { options: ['Trắng'] }]);
  });
});

describe('ảnh phân loại khi tạo (Documents/21 §5.5 imageAxis)', () => {
  const draft: VariantDraft = {
    axes: [
      axis({ key: 'a', attributeId: 'att-chat', name: 'Chất liệu', values: ['Cotton'] }),
      axis({ key: 'b', attributeId: 'att-mau', name: 'Màu sắc', values: ['Đen', 'Đỏ'] }),
    ],
    excluded: [],
    imageAxisKey: 'b',
    axisImages: { [imageKey('Đen')]: { fileId: 'file-den', url: 'blob:x' } },
  };

  it('gửi imageAxis theo vị trí trục và imageFileId cho giá trị có ảnh, giá trị chưa có ảnh vẫn tạo được', () => {
    const body = draftBody(draft, attributes);
    expect(body.imageAxis).toBe(1);
    expect(body.axes[1]!.values).toEqual([{ id: 'val-den', value: 'Đen', imageFileId: 'file-den' }, { value: 'Đỏ' }]);
    expect(body.axes[0]!.values).toEqual([{ id: 'val-cot', value: 'Cotton' }]);
  });

  it('không chọn trục gắn ảnh thì không gửi imageAxis', () => {
    expect(draftBody({ ...draft, imageAxisKey: null }, attributes).imageAxis).toBeUndefined();
  });
});
