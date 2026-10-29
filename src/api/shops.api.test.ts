import { describe, expect, it } from 'vitest';
import { shopKeys } from './shops.api';

describe('shopKeys', () => {
  it('danh sách sàn tách cache theo công ty và nằm dưới khoá chung để invalidate cùng gian hàng', () => {
    expect(shopKeys.platforms('cmp-001')).not.toEqual(shopKeys.platforms('cmp-002'));
    expect(shopKeys.platforms('cmp-001').slice(0, 3)).toEqual(shopKeys.all('cmp-001'));
    expect(shopKeys.list('cmp-001')).not.toEqual(shopKeys.platforms('cmp-001'));
  });
});
