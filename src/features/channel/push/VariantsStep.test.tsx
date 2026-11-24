// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductAxis } from '../specDraft';
import { VariantsStep } from './VariantsStep';

const AXES: ProductAxis[] = [
  { attributeId: 'mau', name: 'Màu', values: [{ id: 'do', value: 'Đỏ thẫm' }, { id: 'xanh', value: 'Xanh' }] },
  { attributeId: 'size', name: 'Size', values: [{ id: 's', value: 'S' }] },
];
const variants = [
  { archivedAt: null, attributes: [{ attributeId: 'mau', value: 'Đỏ thẫm' }, { attributeId: 'size', value: 'S' }] },
  { archivedAt: null, attributes: [{ attributeId: 'mau', value: 'Xanh' }, { attributeId: 'size', value: 'S' }] },
] as never;
const sales = [{ code: 'variation', label: 'Biến thể', kind: 'sales', options: [{ id: 'o1', label: 'Đỏ' }] }] as never;

afterEach(cleanup);

describe('VariantsStep: thuộc tính biến thể đã gộp (FE#459)', () => {
  it('đếm là một, ẩn bảng giá trị chuẩn, xem trước giá trị ghép và báo giá trị dài quá', () => {
    render(
      <VariantsStep
        label="Lazada"
        axes={AXES}
        variants={variants}
        sales={sales}
        caps={{ maxAxes: 1, customAxisName: true, salesRequired: [], combineTarget: 'variation', maxValueLength: 9, maxAxisValues: 50 }}
        draft={{ externalCategoryId: '1', categoryPath: 'A', attributes: {}, axisMap: { mau: 'variation', size: 'variation' }, valueMap: {}, version: 1 } as never}
        errors={{}}
        onAxis={vi.fn()}
        onValue={vi.fn()}
      />,
    );
    expect(screen.queryByText(/nên chưa đăng được/)).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    const notes = screen.getAllByTestId('combined-note');
    expect(notes).toHaveLength(2);
    expect(notes[0]!.textContent).toContain('Giá trị gửi lên (2): Đỏ thẫm - S, Xanh - S');
    expect(notes[0]!.textContent).toContain('1 giá trị dài quá 9 ký tự sàn nhận: Đỏ thẫm - S');
    expect(notes[1]!.textContent).toContain('Giá trị gửi lên xem ở thuộc tính biến thể “Màu”');
  });
});
