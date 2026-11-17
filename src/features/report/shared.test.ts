import { describe, expect, it } from 'vitest';
import { margin } from './shared';

describe('biên lãi (AC-B4)', () => {
  it('biên lãi làm tròn một chữ số; doanh thu 0 hoặc không có lãi là gạch', () => {
    expect(margin(400, 1000)).toBe('40,0%');
    expect(margin(1, 3)).toBe('33,3%');
    expect(margin(-120000, 300000)).toBe('-40,0%');
    expect(margin(0, 0)).toBe('—');
    expect(margin(null, 1000)).toBe('—');
  });
});
