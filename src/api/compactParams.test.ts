import { describe, expect, it } from 'vitest';
import { compactParams } from './compactParams';

describe('compactParams', () => {
  it('bỏ chuỗi rỗng, null, undefined; giữ 0 và false', () => {
    expect(compactParams({ search: '', status: null, roleId: undefined, page: 0, flag: false, q: 'a' })).toEqual({
      page: 0,
      flag: false,
      q: 'a',
    });
  });
});
