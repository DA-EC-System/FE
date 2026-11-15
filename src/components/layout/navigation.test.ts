import { describe, expect, it } from 'vitest';
import type { TaskItem } from '@/types/tasks';
import { companyNav, countTasksByNav, findActiveNav } from './navigation';

const C = 'cmp-001';
const nav = companyNav(C);

const task = (id: string, ref: TaskItem['ref'], severity: TaskItem['severity'] = 'info'): TaskItem => ({
  id,
  kind: 'test',
  group: 'Thử',
  title: id,
  detail: '',
  dueAt: null,
  severity,
  ref,
});

describe('findActiveNav', () => {
  it('chọn mục khớp dài nhất kèm nhóm', () => {
    expect(findActiveNav(nav, `/c/${C}/catalog/setup`)?.item.label).toBe('Danh mục & thuộc tính');
    const order = findActiveNav(nav, `/c/${C}/sales/orders/ord-1`);
    expect(order?.item.label).toBe('Đơn hàng');
    expect(order?.section.title).toBe('Đơn hàng');
  });

  it('Tổng quan chỉ khớp đúng đường dẫn', () => {
    expect(findActiveNav(nav, `/c/${C}`)?.item.label).toBe('Tổng quan');
    expect(findActiveNav(nav, `/c/${C}/khong-co`)).toBeNull();
  });

  it('trang chi tiết đối soát thuộc mục Đối soát sàn', () => {
    const found = findActiveNav(nav, `/c/${C}/finance/settlements/st-1`);
    expect(found?.item.label).toBe('Đối soát sàn');
    expect(found?.section.title).toBe('Tài chính');
  });
});

describe('countTasksByNav', () => {
  it('đếm việc theo mục chứa bản ghi, đánh dấu quá hạn', () => {
    const counts = countTasksByNav(
      nav,
      [
        task('a', { type: 'order', id: 'o1' }),
        task('b', { type: 'order', id: 'o2' }, 'overdue'),
        task('c', { type: 'shop', id: 's1' }),
        task('d', { type: 'return_parcel', id: 'p1' }),
      ],
      C,
    );
    expect(counts.get(`/c/${C}/sales/orders`)).toEqual({ count: 2, overdue: true });
    expect(counts.get(`/c/${C}/channel/shops`)).toEqual({ count: 1, overdue: false });
    expect(counts.get(`/c/${C}/sales/returns`)).toEqual({ count: 1, overdue: false });
    expect(counts.has(`/c/${C}/catalog`)).toBe(false);
  });

  it('bỏ việc trỏ tới mục người xem không thấy', () => {
    const visible = nav.filter((s) => s.title !== 'Đơn hàng');
    expect(countTasksByNav(visible, [task('a', { type: 'order', id: 'o1' })], C).size).toBe(0);
  });
});
