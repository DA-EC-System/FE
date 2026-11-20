// Ảnh phân loại trên trang sản phẩm (Documents/21 §17.2, commerio-backend#340)
import { describe, expect, it } from 'vitest';
import type { ProductVariant } from '@/types/catalog';
import { productAxes } from './valueImages';

const v = (attrs: [string, string, string, string][]) =>
  ({ attributes: attrs.map(([attributeId, attributeName, valueId, value]) => ({ attributeId, attributeName, valueId, value })) }) as ProductVariant;

describe('productAxes', () => {
  it('gom giá trị theo trục, bỏ trùng, giữ thứ tự gặp', () => {
    const variants = [
      v([['mau', 'Màu sắc', 'den', 'Đen'], ['co', 'Kích cỡ', 'm', 'M']]),
      v([['mau', 'Màu sắc', 'den', 'Đen'], ['co', 'Kích cỡ', 'l', 'L']]),
      v([['mau', 'Màu sắc', 'do', 'Đỏ'], ['co', 'Kích cỡ', 'm', 'M']]),
    ];
    expect(productAxes({ variants })).toEqual([
      { attributeId: 'mau', name: 'Màu sắc', values: [{ id: 'den', value: 'Đen' }, { id: 'do', value: 'Đỏ' }] },
      { attributeId: 'co', name: 'Kích cỡ', values: [{ id: 'm', value: 'M' }, { id: 'l', value: 'L' }] },
    ]);
  });

  it('sản phẩm một variant không trục thì không có trục', () => {
    expect(productAxes({ variants: [v([])] })).toEqual([]);
  });
});
