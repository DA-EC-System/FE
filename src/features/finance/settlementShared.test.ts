import { describe, expect, it } from 'vitest';
import { settlementLines } from '@/mocks/settlementData';
import {
  DISCREPANCY_REASON_LABELS,
  FEE_KEYS,
  FEE_LABELS,
  LINE_KIND_LABELS,
  MATCH_STATUS,
  formulaCheck,
  paymentStatusOf,
} from './settlementShared';

const line = (over: Partial<Parameters<typeof formulaCheck>[0]> = {}) => ({
  revenue: 330000,
  feeTotal: 20000,
  shippingCost: 0,
  adjustment: 20000,
  settlement: 330000,
  orderTotal: 330000,
  discrepancyReason: null,
  ...over,
});

describe('nhãn (AC-C2)', () => {
  it('kết quả khớp, lý do, loại dòng', () => {
    expect(Object.values(MATCH_STATUS).map((s) => s.label)).toEqual(['Khớp', 'Chênh lệch', 'Sàn đã hoàn']);
    expect(DISCREPANCY_REASON_LABELS).toEqual({
      order_not_found: 'Không tìm thấy đơn',
      revenue_mismatch: 'Lệch doanh thu',
      formula_mismatch: 'Sai công thức',
    });
    expect(LINE_KIND_LABELS).toEqual({ order: 'Đơn hàng', adjustment: 'Điều chỉnh', reserve: 'Giữ lại' });
  });

  it('trạng thái trả của sàn; chữ lạ giữ nguyên', () => {
    expect(paymentStatusOf('PAID').label).toBe('Đã trả');
    expect(paymentStatusOf('PROCESSING').label).toBe('Đang xử lý');
    expect(paymentStatusOf('FAILED').label).toBe('Thất bại');
    expect(paymentStatusOf('ON_HOLD')).toEqual({ label: 'ON_HOLD', variant: 'secondary' });
  });

  it('bảy ô phí theo thứ tự', () => {
    expect(FEE_KEYS.map((k) => FEE_LABELS[k])).toEqual([
      'Hoa hồng',
      'Phí giao dịch',
      'Phí hạ tầng',
      'Tiếp thị liên kết',
      'Chiến dịch',
      'Thuế',
      'Khác',
    ]);
  });
});

describe('phép kiểm công thức (AC-S2)', () => {
  it('đúng thì không lệch', () => {
    const c = formulaCheck(line());
    expect(c.holds).toBe(true);
    expect(c.expected).toBe(330000);
    expect(c.gap).toBeNull();
    expect(c.text.replace(/\s/g, ' ')).toBe('330.000 ₫ − 20.000 ₫ − 0 ₫ + 20.000 ₫ = 330.000 ₫');
  });

  it('sai công thức thì ghi số lệch', () => {
    const c = formulaCheck(line({ revenue: 0, feeTotal: 0, adjustment: -30000, settlement: -25000 }));
    expect(c.holds).toBe(false);
    expect(c.expected).toBe(-30000);
    expect(c.gap?.replace(/\s/g, ' ')).toBe('Lệch 5.000 ₫');
  });

  it('lệch doanh thu thì so với tổng đơn', () => {
    const c = formulaCheck(
      line({ revenue: 170000, feeTotal: 10000, adjustment: 0, settlement: 160000, orderTotal: 180000, discrepancyReason: 'revenue_mismatch' }),
    );
    expect(c.holds).toBe(true);
    expect(c.revenueGap?.replace(/\s/g, ' ')).toBe('Doanh thu sàn 170.000 ₫, tổng đơn 180.000 ₫, lệch 10.000 ₫');
  });

  it('dữ liệu mock khớp đúng luật: chỉ dòng sai công thức là lệch công thức', () => {
    for (const l of settlementLines) {
      const feeTotal = Object.values(l.fees).reduce((a, b) => a + b, 0);
      const c = formulaCheck({ ...l, feeTotal, orderTotal: null });
      expect(c.holds, l.id).toBe(l.discrepancyReason !== 'formula_mismatch');
    }
  });
});
