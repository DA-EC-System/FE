import { describe, expect, it } from 'vitest';
import { splitByScope } from './scope';

describe('splitByScope', () => {
  it('chia dòng theo tầng, giữ thứ tự', () => {
    const rows = [{ id: 'a', scope: 'platform' as const }, { id: 'b', scope: 'company' as const }, { id: 'c', scope: 'platform' as const }];
    const out = splitByScope(rows);
    expect(out.platform.map((r) => r.id)).toEqual(['a', 'c']);
    expect(out.company.map((r) => r.id)).toEqual(['b']);
  });

  it('dòng thiếu scope (BE cũ) tính là của công ty', () => {
    const old: { id: string; scope?: 'platform' | 'company' } = { id: 'x' };
    expect(splitByScope([old]).company).toHaveLength(1);
  });
});
