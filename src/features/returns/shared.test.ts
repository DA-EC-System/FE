import { describe, expect, it } from 'vitest';
import { respondByState } from './shared';

describe('respondByState (commerio-backend#392)', () => {
  const now = Date.parse('2026-11-20T10:00:00Z');
  const at = (hours: number) => new Date(now + hours * 3600 * 1000).toISOString();

  it('còn trên 24 giờ: có hạn, không gấp', () => {
    expect(respondByState('requested', at(30), now)).toEqual({ at: at(30), urgent: false, overdue: false });
  });

  it('còn dưới 24 giờ: gấp', () => {
    expect(respondByState('requested', at(5), now)).toMatchObject({ urgent: true, overdue: false });
  });

  it('đã qua hạn: quá hạn, không tính gấp', () => {
    expect(respondByState('requested', at(-1), now)).toMatchObject({ urgent: false, overdue: true });
  });

  it('không chờ người bán, sàn không trả hạn hay giá trị hỏng: không hiện', () => {
    expect(respondByState('awaiting_return', at(5), now)).toBeNull();
    expect(respondByState('requested', null, now)).toBeNull();
    expect(respondByState('requested', undefined, now)).toBeNull();
    expect(respondByState('requested', 'không phải ngày', now)).toBeNull();
  });
});
