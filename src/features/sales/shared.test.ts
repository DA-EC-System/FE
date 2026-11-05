import { describe, expect, it } from 'vitest';
import { addressParts, initiatorLabel, lineHasIssue, paymentMethodLabel } from './shared';

describe('thông tin đơn sàn (FE#176)', () => {
  it('nhãn thanh toán: đơn tạo tay, giá trị gốc của sàn, giá trị lạ, chưa có', () => {
    const platform = (platformPaymentMethod: string | null) => paymentMethodLabel({ paymentMethod: null, platformPaymentMethod });
    expect(paymentMethodLabel({ paymentMethod: 'cod' })).toBe('Thu khi giao (COD)');
    expect(paymentMethodLabel({ paymentMethod: 'prepaid', platformPaymentMethod: 'COD' })).toBe('Trả trước');
    expect(platform('COD')).toBe('COD');
    expect(platform('MIXEDCARD')).toBe('Thẻ');
    expect(platform('Lazada Wallet')).toBe('Ví Lazada');
    expect(platform('PAYLATER_X')).toBe('PAYLATER_X');
    expect(platform('toString')).toBe('toString');
    expect(platform(null)).toBe('Sàn thu hộ');
    expect(paymentMethodLabel({ paymentMethod: null })).toBe('Sàn thu hộ');
  });

  it('địa chỉ tách phần bỏ phần trống; BE cũ chưa trả thì rỗng', () => {
    expect(addressParts({ name: 'A', phone: '1', address: 'x', line: '12 Lê Lợi', ward: null, district: 'Quận 1', province: 'TP. HCM' })).toEqual([
      '12 Lê Lợi',
      'Quận 1',
      'TP. HCM',
    ]);
    expect(addressParts({ name: 'A', phone: '1', address: 'x' })).toEqual([]);
  });

  it('ai huỷ', () => {
    expect(initiatorLabel('buyer')).toBe('khách');
    expect(initiatorLabel('platform')).toBe('sàn');
  });

  it('dòng có huỷ/trả; trường thiếu thì không', () => {
    expect(lineHasIssue({})).toBe(false);
    expect(lineHasIssue({ returnStatus: 'Đang hoàn về' })).toBe(true);
    expect(lineHasIssue({ cancelKind: 'cancellation' })).toBe(true);
  });
});
