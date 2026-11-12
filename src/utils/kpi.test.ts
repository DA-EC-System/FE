import { describe, expect, it } from 'vitest';
import { changePercent, compactMoney, signedPercent } from './kpi';

describe('kpi', () => {
  it('rút gọn tiền theo triệu, tỷ', () => {
    expect(compactMoney(48_200_000)).toEqual({ value: '48,2', unit: 'tr₫' });
    expect(compactMoney(250_400_000)).toEqual({ value: '250', unit: 'tr₫' });
    expect(compactMoney(1_250_000_000)).toEqual({ value: '1,25', unit: 'tỷ₫' });
    expect(compactMoney(950_000)).toEqual({ value: '950.000', unit: '₫' });
    expect(compactMoney(-2_500_000)).toEqual({ value: '-2,5', unit: 'tr₫' });
  });

  it('phần trăm đổi so với kỳ trước', () => {
    expect(changePercent(112, 100)).toBe(12);
    expect(changePercent(97, 100)).toBe(-3);
    expect(changePercent(5, 0)).toBeNull();
    expect(signedPercent(12)).toBe('+12%');
    expect(signedPercent(-3)).toBe('-3%');
    expect(signedPercent(0)).toBe('0%');
  });
});
