import { describe, expect, it } from 'vitest';
import type { ProductListItem } from '@/types/catalog';
import { parentActions } from './businessStatus';

// BE chưa trả labelCounts (commerio-backend#204): menu không sập, không mất thao tác
const item = (over: Partial<ProductListItem>) => ({ status: 'active', ...over }) as ProductListItem;

describe('parentActions khi thiếu labelCounts', () => {
  it('sản phẩm đang hoạt động: mở mọi thao tác kinh doanh, không có khôi phục', () => {
    const actions = parentActions(item({}));
    expect(actions).toEqual(expect.arrayContaining(['pause', 'unpause', 'discontinue', 'reactivate', 'archive']));
    expect(actions).not.toContain('restore');
  });

  it('sản phẩm đã lưu trữ: chỉ khôi phục', () => {
    expect(parentActions(item({ status: 'archived' }))).toEqual(['restore']);
  });
});
