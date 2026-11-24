import { describe, expect, it } from 'vitest';
import type { AllowedAttribute } from '@/types/catalog';
import { axesNoticeText, groupChangeNotice, movingNoticeText } from './groupChange';

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
