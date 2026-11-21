import { describe, expect, it } from 'vitest';
import {
  hasActiveSupplier,
  newProductConfirmText,
  axisChoices,
  newLineFromPrevious,
  newProductPlan,
  receiptFormSchema,
  returnFormSchema,
  shortOfDraft,
  type ReceiptLineDraft,
} from './shared';

const line = (over: Partial<ReceiptLineDraft> = {}): ReceiptLineDraft => ({
  lineId: 'l1',
  sku: 'SKU-1',
  isNew: false,
  productName: 'Áo',
  attributesLabel: '',
  outstanding: 10,
  announced: '10',
  accepted: '10',
  defectKept: '0',
  returnedOnSpot: '0',
  reason: '',
  ...over,
});

const receipt = (l: ReceiptLineDraft) => receiptFormSchema.safeParse({ deliveryMode: 'waiting', note: '', lines: [l] });
const issues = (r: ReturnType<typeof receipt>) =>
  r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);

describe('Phiếu nhận: kiểm đếm (sơ đồ A2)', () => {
  it('thiếu = báo giao − đạt − lỗi giữ − trả tại chỗ; chữ chưa hợp lệ coi là 0', () => {
    expect(shortOfDraft(line({ announced: '10', accepted: '6', defectKept: '1', returnedOnSpot: '1' }))).toBe(2);
    expect(shortOfDraft(line({ announced: '5', accepted: 'abc' }))).toBe(5);
    expect(shortOfDraft(line({ announced: '3', accepted: '5' }))).toBe(0);
  });

  it('đủ hàng, không lỗi thì không cần lý do', () => {
    expect(receipt(line()).success).toBe(true);
  });

  it('có thiếu, lỗi hoặc trả tại chỗ thì bắt buộc lý do', () => {
    expect(issues(receipt(line({ accepted: '8' })))).toEqual(['lines.0.reason: Ghi lý do khi có thiếu, lỗi hoặc trả lại']);
    expect(receipt(line({ accepted: '8', reason: 'Nhà cung cấp giao thiếu 2' })).success).toBe(true);
    expect(receipt(line({ accepted: '9', defectKept: '1' })).success).toBe(false);
  });

  it('đạt + lỗi + trả không vượt báo giao; đạt + lỗi không vượt còn chờ', () => {
    expect(issues(receipt(line({ announced: '10', accepted: '9', defectKept: '2', reason: 'x' })))).toEqual([
      'lines.0.accepted: SL đạt + lỗi + trả lại vượt SL NCC giao',
    ]);
    expect(issues(receipt(line({ outstanding: 5, announced: '8', accepted: '6', reason: 'x' })))).toEqual([
      'lines.0.accepted: Còn phải nhận 5, SL đạt và lỗi vượt số này',
    ]);
  });
});

describe('Phiếu trả nhà cung cấp (sơ đồ B4)', () => {
  it('số trả không vượt hàng lỗi/chờ kiểm, phải có ít nhất một dòng', () => {
    const parse = (quantity: string) =>
      returnFormSchema.safeParse({ supplierId: 's1', note: '', lines: [{ variantId: 'v1', quarantine: 3, quantity }] });
    expect(parse('3').success).toBe(true);
    const over = parse('4');
    expect(over.success ? '' : over.error.issues[0]?.message).toBe('Chỉ còn 3 hàng lỗi/chờ kiểm');
    const empty = returnFormSchema.safeParse({ supplierId: '', note: '', lines: [] });
    expect(empty.success ? '' : empty.error.issues[0]?.message).toBe('Thêm ít nhất một dòng');
  });
});

describe('hasActiveSupplier: chặn Lập đề nghị khi chưa có nhà cung cấp', () => {
  it('chưa tải xong danh sách thì không chặn', () => {
    expect(hasActiveSupplier(undefined)).toBeUndefined();
  });
  it('chưa có nhà cung cấp nào, hoặc tất cả đã ngừng giao dịch, thì chặn', () => {
    expect(hasActiveSupplier([])).toBe(false);
    expect(hasActiveSupplier([{ active: false }])).toBe(false);
  });
  it('có ít nhất một nhà cung cấp đang giao dịch thì cho lập', () => {
    expect(hasActiveSupplier([{ active: false }, { active: true }])).toBe(true);
  });
});

describe('newProductPlan, newProductConfirmText (21 §16.3, chốt 21/11 câu 3)', () => {
  const fresh = (lineId: string, attributesLabel: string, accepted: string, defectKept = '0', productName = 'Áo thun basic') =>
    line({ lineId, sku: null, isNew: true, productName, attributesLabel, accepted, defectKept });
  const req = (id: string, parentId: string | null, variantId: string | null = null) => ({ id, variantId, newProduct: { parentId } });

  it('dòng có đạt hoặc lỗi giữ tạo biến thể, dòng 0 để lần sau; gộp theo tên cha', () => {
    const plan = newProductPlan(
      [line(), fresh('a', 'Đen / M', '18', '2'), fresh('b', 'Đen / L', '0'), fresh('c', 'Trắng / M', '0', '1')],
      [req('a', null), req('b', null), req('c', null)],
    );
    expect(plan.productCount).toBe(1);
    expect(plan.variantCount).toBe(2);
    expect(newProductConfirmText(plan)).toBe(
      'Sẽ tạo 1 sản phẩm, 2 biến thể: Áo thun basic (Đen / M, Trắng / M). Chưa về hàng, để lần nhập sau: Áo thun basic (Đen / L).',
    );
  });

  it('thêm biến thể vào sản phẩm có sẵn không đếm là sản phẩm mới', () => {
    const plan = newProductPlan([fresh('a', 'Xanh / 32', '5', '0', 'Quần jean slim')], [req('a', 'p1')]);
    expect(plan.productCount).toBe(0);
    expect(newProductConfirmText(plan)).toBe('Sẽ tạo 1 biến thể: Quần jean slim (Xanh / 32), thêm vào sản phẩm có sẵn.');
  });

  it('dòng đề nghị đã có SKU (phiếu khác ghi sổ trước) thì không tạo nữa; không có dòng mới thì không có câu', () => {
    const plan = newProductPlan([fresh('a', 'Đen / M', '3')], [req('a', null, 'v1')]);
    expect(plan.groups).toEqual([]);
    expect(newProductConfirmText(plan)).toBeNull();
  });

  it('chưa đọc được đề nghị thì chỉ đếm biến thể; chưa dòng nào có hàng thì nói rõ', () => {
    expect(newProductConfirmText(newProductPlan([fresh('a', 'Đen / M', '1')]))).toBe('Sẽ tạo 1 biến thể: Áo thun basic (Đen / M).');
    expect(newProductConfirmText(newProductPlan([fresh('a', 'Đen / M', '0')], [req('a', null)]))).toBe(
      'Chưa tạo sản phẩm mới nào: các dòng sản phẩm mới chưa có SL đạt hoặc lỗi, giữ lại. Chưa về hàng, để lần nhập sau: Áo thun basic (Đen / M).',
    );
  });
});

describe('newLineFromPrevious (KB2 2.1: dòng sau chép dòng trên)', () => {
  const base = { variantId: null, parentId: '', isNew: true } as const;
  it('chép tên, danh mục, thuộc tính; để trống giá trị', () => {
    const prev = { ...base, parentMode: 'new' as const, parentName: 'Điện thoại TD22 X1', groupId: 'g1', options: [{ axis: 'Màu sắc', value: 'Xanh' }, { axis: 'Dung lượng', value: '128GB' }] };
    expect(newLineFromPrevious([prev])).toEqual({
      isNew: true,
      parentMode: 'new',
      parentId: '',
      parentName: 'Điện thoại TD22 X1',
      groupId: 'g1',
      options: [{ axis: 'Màu sắc', value: '' }, { axis: 'Dung lượng', value: '' }],
    });
  });
  it('chưa có dòng sản phẩm mới: dòng trống đủ ô thuộc tính', () => {
    expect(newLineFromPrevious([{ ...base, isNew: false, variantId: 'v1', parentMode: 'existing', parentName: '', groupId: '', options: [] }])).toMatchObject({
      parentMode: 'new',
      parentName: '',
      options: [{ axis: '', value: '' }, { axis: '', value: '' }],
    });
  });
});

describe('axisChoices (chốt 21/11 mục 5)', () => {
  const attrs = [{ id: 'a1', name: 'Màu sắc' }, { id: 'a2', name: 'Hương vị' }, { id: 'a3', name: 'Dung lượng' }];
  it('hợp danh mục lên đầu theo thứ tự danh mục, còn lại ngoài danh mục', () => {
    expect(axisChoices(attrs, [{ attributeId: 'a3' }, { attributeId: 'a1' }])).toEqual({
      fits: [{ id: 'a3', name: 'Dung lượng' }, { id: 'a1', name: 'Màu sắc' }],
      others: [{ id: 'a2', name: 'Hương vị' }],
    });
  });
  it('danh mục chưa giới hạn: một nhóm', () => {
    expect(axisChoices(attrs, [])).toEqual({ fits: attrs, others: [] });
  });
});
