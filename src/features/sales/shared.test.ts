import { describe, expect, it } from 'vitest';
import { addressParts, initiatorLabel, lineHasIssue, paymentMethodLabel } from './shared';

describe('thông tin đơn sàn (FE#176)', () => {
  it('nhãn thanh toán: đơn tạo tay, giá trị gốc của sàn, giá trị lạ, chưa có', () => {
    expect(paymentMethodLabel('cod')).toBe('Thu khi giao (COD)');
    expect(paymentMethodLabel('prepaid')).toBe('Trả trước');
    expect(paymentMethodLabel('COD')).toBe('COD');
    expect(paymentMethodLabel('MIXEDCARD')).toBe('Thẻ');
    expect(paymentMethodLabel('Lazada Wallet')).toBe('Ví Lazada');
    expect(paymentMethodLabel('PAYLATER_X')).toBe('PAYLATER_X');
    expect(paymentMethodLabel('toString')).toBe('toString');
    expect(paymentMethodLabel(null)).toBe('Sàn thu hộ');
  });

  it('địa chỉ tách phần bỏ phần trống; BE cũ chưa trả thì rỗng', () => {
    expect(addressParts({ name: 'A', phone: '1', address: 'x', line: '12 Lê Lợi', ward: null, district: 'Quận 1', province: 'TP. HCM' })).toEqual([
      '12 Lê Lợi',
      'Quận 1',
      'TP. HCM',
    ]);
    expect(addressParts({ name: 'A', phone: '1', address: 'x' })).toEqual([]);
  });

  it('ai huỷ: giá trị đã map và giá trị gốc lạ', () => {
    expect(initiatorLabel('buyer')).toBe('khách');
    expect(initiatorLabel('cancellation-customer')).toBe('cancellation-customer');
  });

  it('dòng có huỷ/trả; trường thiếu thì không', () => {
    expect(lineHasIssue({})).toBe(false);
    expect(lineHasIssue({ returnStatus: 'Đang hoàn về' })).toBe(true);
  });
});
