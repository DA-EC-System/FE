import { describe, expect, it } from 'vitest';
import { categoryFit, sortByFit } from './categoryFit';

const names = ['Màu sắc', 'Kích cỡ', 'Chất liệu'];

describe('categoryFit (FE#459)', () => {
  it('nhận đủ hoặc chưa biết maxAxes: không ghi gì', () => {
    expect(categoryFit({ maxAxes: 3, combinable: false }, names)).toBeNull();
    expect(categoryFit({ maxAxes: null, combinable: null }, names)).toBeNull();
    expect(categoryFit({}, names)).toBeNull();
  });

  it('nhận ít hơn, không ghép được: làm mờ; ghép được: không mờ, ghi các thuộc tính biến thể được ghép', () => {
    expect(categoryFit({ maxAxes: 2, combinable: false }, names)).toEqual({ dim: true, note: 'Chỉ nhận 2 thuộc tính biến thể' });
    expect(categoryFit({ maxAxes: 1, combinable: true }, names)).toEqual({
      dim: false,
      note: 'Nhận 1 thuộc tính biến thể, Commerio ghép Màu sắc, Kích cỡ, Chất liệu',
    });
  });

  it('xếp category bị làm mờ xuống cuối, giữ thứ tự còn lại', () => {
    const items = [
      { id: 'a', maxAxes: 1, combinable: false },
      { id: 'b', maxAxes: 1, combinable: true },
      { id: 'c', maxAxes: null },
      { id: 'd', maxAxes: 2, combinable: false },
    ];
    expect(sortByFit(items, names).map((c) => c.id)).toEqual(['b', 'c', 'a', 'd']);
  });
});
