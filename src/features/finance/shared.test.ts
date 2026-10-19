import { describe, expect, it } from 'vitest';
import {
  CREATABLE_PURPOSES,
  TRANSACTION_STATUS,
  UNMATCHED_REASON_LABELS,
  VOUCHER_PURPOSE_LABELS,
  amountGap,
  codSelection,
  labelOptions,
  numberRange,
  paidViaLabel,
  payoutSchema,
  voucherSchema,
} from './shared';

const firstError = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues[0]?.message;

describe('nhãn (AC-C2)', () => {
  it('trả qua: tên cổng, gán khoản thu, hoặc gạch', () => {
    expect(paidViaLabel('vnpay')).toBe('VNPay');
    expect(paidViaLabel('unmatched_assignment')).toBe('Gán khoản chưa khớp');
    expect(paidViaLabel(null)).toBe('—');
    expect(paidViaLabel('la')).toBe('la');
  });

  it('mục đích lập được chỉ gồm hoàn tiền, vẫn có nhãn trả nhà cung cấp', () => {
    expect(labelOptions(VOUCHER_PURPOSE_LABELS, CREATABLE_PURPOSES)).toEqual([
      { value: 'customer_refund', label: 'Hoàn tiền khách' },
      { value: 'unmatched_refund', label: 'Hoàn khoản thu chưa khớp' },
    ]);
    expect(VOUCHER_PURPOSE_LABELS.supplier_payment).toBe('Trả nhà cung cấp');
  });

  it('tuỳ chọn lấy nhãn từ cả bảng chuỗi và bảng có màu', () => {
    expect(labelOptions(UNMATCHED_REASON_LABELS).map((o) => o.label)).toEqual(['Không có mã thanh toán', 'Lệch số tiền', 'Đơn đã huỷ']);
    expect(labelOptions(TRANSACTION_STATUS).find((o) => o.value === 'needs_review')?.label).toBe('Cần xem lại');
  });
});

describe('voucherSchema (AC-V1)', () => {
  const valid = { purpose: 'customer_refund', sourceId: 'ord-1', paidOn: '2026-10-19', note: '' };

  it('nhận phiếu hợp lệ, kể cả ngày chi tương lai', () => {
    expect(voucherSchema.safeParse(valid).success).toBe(true);
    expect(voucherSchema.safeParse({ ...valid, paidOn: '2030-01-01' }).success).toBe(true);
  });

  it('báo thiếu mục đích, chứng từ gốc, ngày chi', () => {
    expect(firstError(voucherSchema.safeParse({ ...valid, purpose: '' }))).toBe('Chọn mục đích chi');
    expect(firstError(voucherSchema.safeParse({ ...valid, purpose: 'supplier_payment' }))).toBe('Chọn mục đích chi');
    expect(firstError(voucherSchema.safeParse({ ...valid, sourceId: '' }))).toBe('Chọn chứng từ gốc');
    expect(firstError(voucherSchema.safeParse({ ...valid, paidOn: '' }))).toBe('Chọn ngày chi');
    expect(firstError(voucherSchema.safeParse({ ...valid, paidOn: '19/10/2026' }))).toBe('Ngày chi không hợp lệ');
  });

  it('ghi chú tối đa 500 ký tự', () => {
    expect(payoutSchema.safeParse({ paidOn: '2026-10-19', note: 'a'.repeat(500) }).success).toBe(true);
    expect(firstError(payoutSchema.safeParse({ paidOn: '2026-10-19', note: 'a'.repeat(501) }))).toBe('Ghi chú tối đa 500 ký tự');
  });
});

describe('codSelection (AC-K2)', () => {
  it('đếm, cộng tiền và chặn quá 100 đơn', () => {
    expect(codSelection([])).toEqual({ count: 0, total: 0, tooMany: false });
    expect(codSelection([150000, 250000])).toEqual({ count: 2, total: 400000, tooMany: false });
    expect(codSelection(Array(100).fill(1)).tooMany).toBe(false);
    expect(codSelection(Array(101).fill(1)).tooMany).toBe(true);
  });
});

describe('amountGap (AC-U2)', () => {
  it('khớp là null, lệch thì ghi trị tuyệt đối', () => {
    expect(amountGap(500000, 500000)).toBeNull();
    expect(amountGap(500000, 450000)).toMatch(/^Lệch 50\.000\s₫$/);
    expect(amountGap(450000, 500000)).toMatch(/^Lệch 50\.000\s₫$/);
  });
});

describe('numberRange (AC-K2)', () => {
  it('một số hoặc khoảng từ nhỏ đến lớn', () => {
    expect(numberRange([])).toBe('');
    expect(numberRange(['PT-000007'])).toBe('PT-000007');
    expect(numberRange(['PT-000009', 'PT-000007', 'PT-000008'])).toBe('PT-000007 đến PT-000009');
  });
});
