import { describe, expect, it } from 'vitest';
import type { AllowedAttribute, ProductDetail } from '@/types/catalog';
import { axesNoticeText, groupChangeNotice, liveAxes, movingNoticeText, movingSpecNames } from './groupChange';

const allowed = (id: string, name: string): AllowedAttribute => ({ attributeId: id, name, platformKind: null, isAxis: false });

describe('groupChangeNotice', () => {
  it('báo trục có attributeId không thuộc danh sách của danh mục mới', () => {
    const n = groupChangeNotice(
      [
        { attributeId: 'a-mau', name: 'Màu' },
        { attributeId: 'a-co', name: 'Cỡ' },
      ],
      [allowed('a-mau', 'Màu')],
      [],
    );
    expect(n.axes).toEqual(['Cỡ']);
  });

  it('trục gõ tay so theo tên, không phân biệt hoa thường', () => {
    const n = groupChangeNotice([{ attributeId: null, name: ' màu ' }, { attributeId: null, name: 'Chất liệu' }], [allowed('a-mau', 'Màu')], []);
    expect(n.axes).toEqual(['Chất liệu']);
  });

  it('danh mục chưa giới hạn (rỗng hoặc BE chưa trả) thì không báo trục', () => {
    expect(groupChangeNotice([{ attributeId: 'a-co', name: 'Cỡ' }], [], []).axes).toEqual([]);
    expect(groupChangeNotice([{ attributeId: 'a-co', name: 'Cỡ' }], undefined, []).axes).toEqual([]);
  });

  it('câu báo đúng chữ đã duyệt', () => {
    expect(axesNoticeText(['Màu', 'Cỡ'])).toBe('Thuộc tính biến thể Màu, Cỡ không có trong danh mục mới. Sản phẩm giữ nguyên.');
    expect(movingNoticeText(['Chất liệu', 'Xuất xứ'])).toBe('2 thuộc tính sẽ chuyển sang Thuộc tính khác: Chất liệu, Xuất xứ.');
    expect(axesNoticeText([])).toBeNull();
    expect(movingNoticeText([])).toBeNull();
  });
});

describe('liveAxes', () => {
  const variant = (status: string, attrs: [string, string, string][]) => ({
    businessStatus: status,
    attributes: attrs.map(([attributeId, attributeName, value]) => ({ attributeId, attributeName, valueId: `${attributeId}-${value}`, value })),
  });

  it('bỏ trục chỉ còn ở biến thể đã lưu trữ', () => {
    const product = {
      variants: [
        variant('selling', [['a-mau', 'Màu', 'Đỏ']]),
        variant('archived', [
          ['a-mau', 'Màu', 'Xanh'],
          ['a-co', 'Cỡ', 'L'],
        ]),
      ],
    } as unknown as Pick<ProductDetail, 'variants'>;
    const axes = liveAxes(product);
    expect(axes.map((a) => a.name)).toEqual(['Màu']);
    expect(axes[0]!.values.map((v) => v.value)).toEqual(['Đỏ']);
  });
});

describe('movingSpecNames', () => {
  const filled = { optionIds: [], newValues: [], value: 'x' };
  const empty = { optionIds: [], newValues: [], value: '  ' };

  it('tính theo giá trị đang có trong form, gồm thuộc tính vừa điền ở danh mục chọn tạm', () => {
    const others = [
      { fieldId: 'f-chat-lieu', name: 'Chất liệu' },
      { fieldId: 'f-tam', name: 'Kiểu cổ' },
      { fieldId: 'f-trong', name: 'Xuất xứ vải' },
    ];
    const drafts = { 'f-chat-lieu': filled, 'f-tam': filled, 'f-trong': empty };
    const saved = [{ fieldId: 'f-chat-lieu', inTemplate: true }];
    expect(movingSpecNames(others, drafts, saved)).toEqual(['Chất liệu', 'Kiểu cổ']);
  });

  it('bỏ thuộc tính vốn đã ở Thuộc tính khác lúc lưu', () => {
    const others = [{ fieldId: 'f-khac', name: 'Ghi chú may' }];
    expect(movingSpecNames(others, { 'f-khac': filled }, [{ fieldId: 'f-khac', inTemplate: false }])).toEqual([]);
  });
});
