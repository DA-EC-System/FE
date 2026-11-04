import { describe, expect, it } from 'vitest';
import type { CategoryAttribute, CategoryMap } from '@/types/shop';
import {
  attributeErrors,
  categoryMapRows,
  foldText,
  pickAttributeValues,
  searchCategories,
  splitProblemErrors,
} from './categoryMap';

const ATTRS: CategoryAttribute[] = [
  { name: 'brand', label: 'Thương hiệu', options: [] },
  { name: 'material', label: 'Chất liệu', options: ['Cotton', 'Polyester'] },
];

const map = (categoryId: string): CategoryMap => ({
  categoryId,
  platform: 'lazada',
  externalCategoryId: '10000',
  attributes: { brand: 'ABC' },
  version: 1,
  updatedAt: '2026-10-28T03:00:00.000Z',
});

describe('Tìm danh mục sàn', () => {
  const items = [
    { name: 'Thời trang nam > Áo > Áo thun' },
    { name: 'Thời trang nữ > Áo > Áo thun' },
    { name: 'Thời trang nam > Quần > Quần kaki' },
  ];

  it('bỏ dấu, không phân biệt hoa thường, mọi từ phải có trong đường dẫn', () => {
    expect(foldText('  Đồ Chơi ')).toBe('do choi');
    expect(searchCategories(items, 'ao thun').map((c) => c.name)).toHaveLength(2);
    expect(searchCategories(items, 'nam ÁO').map((c) => c.name)).toEqual(['Thời trang nam > Áo > Áo thun']);
    expect(searchCategories(items, 'giày')).toEqual([]);
  });

  it('chưa gõ thì trả cả danh sách, tối đa giới hạn', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ name: `Dụng cụ ${i}` }));
    expect(searchCategories(many, '')).toHaveLength(50);
    expect(searchCategories(items, '', 2)).toHaveLength(2);
  });
});

describe('Thuộc tính bắt buộc', () => {
  it('thiếu giá trị: ô nhập báo "Nhập", ô chọn báo "Chọn"', () => {
    expect(attributeErrors(ATTRS, {})).toEqual({ brand: 'Nhập thương hiệu', material: 'Chọn chất liệu' });
    expect(attributeErrors(ATTRS, { brand: '   ', material: 'Cotton' })).toEqual({ brand: 'Nhập thương hiệu' });
  });

  it('giá trị ngoài lựa chọn bị chặn, đủ và đúng thì không lỗi', () => {
    expect(attributeErrors(ATTRS, { brand: 'ABC', material: 'Lụa' })).toEqual({
      material: 'Chọn một giá trị trong danh sách',
    });
    expect(attributeErrors(ATTRS, { brand: 'ABC', material: 'Cotton' })).toEqual({});
    expect(attributeErrors([], {})).toEqual({});
  });

  it('chỉ gửi thuộc tính của danh mục đang chọn, đã cắt khoảng trắng', () => {
    expect(pickAttributeValues(ATTRS, { brand: ' ABC ', material: 'Cotton', collar_type: 'Cổ tròn' })).toEqual({
      brand: 'ABC',
      material: 'Cotton',
    });
  });
});

describe('Lỗi 422 theo trường', () => {
  it('khoá attributes.<tên> gắn vào ô thuộc tính, khoá khác giữ riêng', () => {
    expect(
      splitProblemErrors({
        'attributes.brand': 'Nhập thương hiệu',
        'attributes.material': 'Chọn một giá trị trong danh sách',
        externalCategoryId: 'Chọn một danh mục lá trên sàn',
      }),
    ).toEqual({
      attributes: { brand: 'Nhập thương hiệu', material: 'Chọn một giá trị trong danh sách' },
      other: { externalCategoryId: 'Chọn một danh mục lá trên sàn' },
    });
    expect(splitProblemErrors(undefined)).toEqual({ attributes: {}, other: {} });
  });
});

describe('Bảng ghép danh mục', () => {
  it('mọi danh mục Commerio đều có dòng, chưa ghép lên trước rồi theo tên', () => {
    const rows = categoryMapRows(
      [
        { id: 'cat-quan', name: 'Quần' },
        { id: 'cat-ao', name: 'Áo' },
        { id: 'cat-vo', name: 'Vớ' },
        { id: 'cat-pk', name: 'Phụ kiện' },
      ],
      [map('cat-ao'), map('cat-khac')],
    );
    expect(rows.map((r) => [r.category.id, Boolean(r.map)])).toEqual([
      ['cat-pk', false],
      ['cat-quan', false],
      ['cat-vo', false],
      ['cat-ao', true],
    ]);
  });
});
