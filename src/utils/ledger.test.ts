import { describe, expect, it } from 'vitest';
import { formatMargin, formatMilestone, isCostKind, isReplaced, taxWarnings } from './ledger';

describe('dòng sổ', () => {
  it('đã thay khi có replacedBy; giá vốn và hoàn giá vốn không phải tiền mặt', () => {
    expect(isReplaced({ replacedBy: 'x' })).toBe(true);
    expect(isReplaced({ replacedBy: null })).toBe(false);
    expect(isCostKind('cogs')).toBe(true);
    expect(isCostKind('cogs_reversal')).toBe(true);
    expect(isCostKind('withdrawal')).toBe(false);
  });

  it('biên lãi một chữ số thập phân, null thành gạch', () => {
    expect(formatMargin(12.5)).toBe('12,5%');
    expect(formatMargin(-3)).toBe('-3%');
    expect(formatMargin(null)).toBe('—');
  });
});

describe('taxWarnings', () => {
  it('cảnh báo từ 90% mốc, đánh dấu đã vượt', () => {
    expect(taxWarnings(400_000_000)).toEqual([]);
    expect(taxWarnings(470_000_000)).toEqual([{ milestone: 500_000_000, ytdRevenue: 470_000_000, over: false }]);
    expect(taxWarnings(2_800_000_000).map((w) => [w.milestone, w.over])).toEqual([
      [500_000_000, true],
      [3_000_000_000, false],
    ]);
  });

  it('ghi mốc bằng chữ', () => {
    expect(formatMilestone(500_000_000)).toBe('500 triệu');
    expect(formatMilestone(3_000_000_000)).toBe('3 tỷ');
  });
});
