import { describe, expect, it } from 'vitest';
import {
  EMPTY_FACTS,
  axesOf,
  axisValues,
  changedFacts,
  draftFieldErrors,
  droppedDrafts,
  editableVariantIndexes,
  factsDraft,
  parseFact,
  parseFacts,
  requestClosed,
  specDraftsOf,
  variantLabel,
} from './productDraft';

describe('parseFacts (21 §16.3, luật số như §17.2, §17.5)', () => {
  it('ô trống là null, bỏ dấu ngăn nghìn', () => {
    const { value, errors } = parseFacts({ ...EMPTY_FACTS, targetNetPrice: '149.000', weightG: '250' }, { withMinQty: true });
    expect(errors).toEqual({});
    expect(value).toMatchObject({ targetNetPrice: 149000, weightG: 250, standardPrice: null, minQty: null });
  });

  it('số sai báo theo ô; cân nặng, kích thước phải > 0; giá được 0', () => {
    const { errors } = parseFacts(
      { ...EMPTY_FACTS, targetNetPrice: '0', weightG: '0', lengthMm: '-5', heightMm: '1,5x', minQty: 'abc' },
      { withMinQty: true },
    );
    expect(errors).toEqual({
      weightG: 'Cân nặng là số nguyên gam > 0',
      lengthMm: 'Chiều dài là số nguyên mm > 0',
      heightMm: 'Chiều cao là số nguyên mm > 0',
      minQty: 'Ngưỡng tồn là số nguyên ≥ 0',
    });
  });

  it('không có quyền chỉnh ngưỡng tồn thì không gửi minQty, cũng không kiểm', () => {
    const { value, errors } = parseFacts({ ...EMPTY_FACTS, minQty: 'abc' }, { withMinQty: false });
    expect(errors).toEqual({});
    expect('minQty' in value).toBe(false);
  });

  it('factsDraft đổi null thành ô trống', () => {
    expect(
      factsDraft({ standardPrice: null, targetNetPrice: 1000, weightG: null, lengthMm: 1, widthMm: null, heightMm: null, minQty: 0 }),
    ).toMatchObject({ targetNetPrice: '1000', standardPrice: '', minQty: '0' });
  });
});

describe('biến thể của bản soạn', () => {
  const variants = [
    { optionValues: { 'Màu sắc': 'Đen', 'Kích cỡ': 'M' }, variantId: 'v1' },
    { optionValues: { 'Màu sắc': 'Đen', 'Kích cỡ': 'L' }, variantId: null },
    { optionValues: { 'Màu sắc': 'Trắng', 'Kích cỡ': 'M' }, variantId: null },
  ];

  it('nhãn, thuộc tính biến thể, giá trị theo thứ tự xuất hiện', () => {
    expect(variantLabel(variants[1]!.optionValues)).toBe('Đen / L');
    expect(variantLabel({})).toBe('Một biến thể');
    expect(axesOf(variants)).toEqual(['Màu sắc', 'Kích cỡ']);
    expect(axisValues(variants, 'Màu sắc')).toEqual(['Đen', 'Trắng']);
  });

  it('chỉ tổ hợp chưa có SKU sửa được; lỗi variants.i của BE đổi về dòng trên bảng', () => {
    const sent = editableVariantIndexes({ variants: variants.map((v) => ({ ...v, ...nullFacts })) });
    expect(sent).toEqual([1, 2]);
    expect(
      draftFieldErrors({ 'variants.1.weightG': 'Cân nặng sai', 'variants.0': 'variant_created', 'variantDefaults.minQty': 'x' }, sent),
    ).toEqual({ 'variants.2.weightG': 'Cân nặng sai', 'variants.1': 'variant_created', 'variantDefaults.minQty': 'x' });
  });
});

const nullFacts = { standardPrice: null, targetNetPrice: null, weightG: null, lengthMm: null, widthMm: null, heightMm: null, minQty: null };

describe('khác', () => {
  it('đề nghị kết thúc thì bản soạn chỉ đọc', () => {
    expect(requestClosed('ordered')).toBe(false);
    expect(requestClosed('partially_received')).toBe(false);
    expect(requestClosed('received')).toBe(true);
    expect(requestClosed('cancelled')).toBe(true);
  });

  it('thuộc tính sản phẩm đã soạn thành ô của form', () => {
    expect(specDraftsOf([{ fieldId: 'f1', optionIds: ['o1'] }, { fieldId: 'f2', value: 'Cotton' }])).toEqual({
      f1: { optionIds: ['o1'], newValues: [], value: '' },
      f2: { optionIds: [], newValues: [], value: 'Cotton' },
    });
  });
});

describe('droppedDrafts (21 §16.3: FE hỏi trước khi lưu)', () => {
  const drafts = [{ id: 'd1', parentName: 'Áo thun basic' }];
  const np = (parentName: string | null, parentId: string | null = null) => ({ newProduct: { parentId, parentName } });

  it('đổi tên cha mới: bản soạn tên cũ bị xoá, đoán tên mới', () => {
    expect(droppedDrafts(drafts, [np('Áo thun cổ tròn'), np('Áo thun cổ tròn')])).toEqual({
      dropped: drafts,
      renamedTo: 'Áo thun cổ tròn',
    });
  });

  it('giữ tên (khác hoa thường, khoảng trắng) thì không mất; chuyển sang sản phẩm có sẵn thì mất, không có tên mới', () => {
    expect(droppedDrafts(drafts, [np('  áo  thun BASIC ')]).dropped).toEqual([]);
    expect(droppedDrafts(drafts, [np(null, 'p1'), { newProduct: null }])).toEqual({ dropped: drafts, renamedTo: null });
  });
});

describe('changedFacts (PUT gộp theo ô, Documents#236)', () => {
  const initial = { ...nullFacts, targetNetPrice: 149000, weightG: 250 };

  it('chỉ ô đổi; xoá số là null; không đổi gì thì null', () => {
    expect(changedFacts({ ...nullFacts, targetNetPrice: 149000, weightG: null, lengthMm: 300 }, initial)).toEqual({
      weightG: null,
      lengthMm: 300,
    });
    expect(changedFacts({ ...nullFacts, targetNetPrice: 149000, weightG: 250 }, initial)).toBeNull();
  });

  it('ô không có trong value (minQty khi thiếu quyền) không gửi', () => {
    const { minQty: _drop, ...noMin } = { ...nullFacts, targetNetPrice: 149000, weightG: 250 };
    expect(changedFacts(noMin, { ...initial, minQty: 5 })).toBeNull();
  });
});

describe('parseFact (một ô của bảng Biến thể, FE#476)', () => {
  it('cùng luật với parseFacts: trống là null, bỏ dấu ngăn nghìn, sai thì câu lỗi của cột', () => {
    expect(parseFact('targetNetPrice', ' 149.000 ')).toEqual({ ok: true, value: 149000 });
    expect(parseFact('weightG', '')).toEqual({ ok: true, value: null });
    expect(parseFact('minQty', '0')).toEqual({ ok: true, value: 0 });
    expect(parseFact('weightG', '0')).toEqual({ ok: false, error: 'Cân nặng là số nguyên gam > 0' });
    expect(parseFact('lengthMm', '1,5a')).toEqual({ ok: false, error: 'Chiều dài là số nguyên mm > 0' });
  });
});
