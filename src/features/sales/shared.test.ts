import { describe, expect, it } from 'vitest';
import { initiatorLabel, lineHasIssue, paymentMethodLabel, wardNote } from './shared';

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

  it('phường hiện riêng khi chuỗi địa chỉ chưa có; BE cũ chưa trả thì không', () => {
    expect(wardNote({ name: 'A', phone: '1', address: '6*** T***h', ward: 'Phường Tân Sơn Hòa' })).toBe('Phường Tân Sơn Hòa');
    expect(wardNote({ name: 'A', phone: '1', address: '6***, Phường Tân Sơn Hòa', ward: 'Phường Tân Sơn Hòa' })).toBeNull();
    expect(wardNote({ name: 'A', phone: '1', address: 'x' })).toBeNull();
  });

  it('ai huỷ', () => {
    expect(initiatorLabel('buyer')).toBe('khách');
    expect(initiatorLabel('platform')).toBe('sàn');
  });

  it('dòng có huỷ/trả; trường thiếu thì không', () => {
    expect(lineHasIssue({})).toBe(false);
    expect(lineHasIssue({ returnStatus: 'Đang hoàn về' })).toBe(true);
    expect(lineHasIssue({ cancelKind: 'cancellation' })).toBe(true);
    expect(lineHasIssue({ cancelKind: 'failed_delivery' })).toBe(true);
  });
});
