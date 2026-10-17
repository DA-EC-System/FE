import { describe, expect, it } from 'vitest';
import { renderSku, skuPatternError, valueCode } from './sku';

// Bộ ví dụ dùng chung FE và BE: docs/21 mục 9. BE (commerio-backend#12) chạy cùng bảng này.

describe('bảng 9.1: sinh SKU', () => {
  it.each([
    ['AO-{SEQ:4}-{VAL}', 12, ['Đen', 'XL'], 'AO-0012-DEN-XL'],
    ['AO-{SEQ}-{VAL}', 3, [], 'AO-0003'],
    ['{VAL}-{SEQ:6}', 1, ['Xanh navy', 'M'], 'XANHNA-M-000001'],
    ['QUAN_{SEQ:3}', 7, ['Trắng'], 'QUAN_007'],
    ['GIAY-{SEQ:2}-{VAL}', 123, ['Size 42'], 'GIAY-123-SIZE42'],
    ['MP-{VAL}-{SEQ:5}', 45, ['Hồng đất', '50ml'], 'MP-HONGDA-50ML-00045'],
    ['DC{SEQ:1}{VAL}', 9, ['Đỏ'], 'DC9DO'],
  ])('%s, số %i, %j → %s', (pattern, seq, values, sku) => {
    expect(skuPatternError(pattern)).toBeNull();
    // Mã bỏ trống thì sinh từ tên giá trị (V21)
    expect(renderSku(pattern, seq, values.map(valueCode))).toBe(sku);
  });

  it('dùng mã người dùng đặt thay cho mã tự sinh (V21)', () => {
    expect(renderSku('AO-{SEQ:4}-{VAL}', 12, ['BLK', 'XL'])).toBe('AO-0012-BLK-XL');
  });
});

describe('bảng 9.2: mã giá trị', () => {
  it.each([
    ['Xanh navy', 'XANHNA'],
    ['Xanh nhạt', 'XANHNH'],
    ['Đỏ đô', 'DODO'],
    ['Size 42', 'SIZE42'],
    ['50ml', '50ML'],
    ['Ấm áp', 'AMAP'],
  ])('%s → %s', (value, code) => {
    expect(valueCode(value)).toBe(code);
  });
});

describe('bảng 9.3: quy tắc sai', () => {
  it.each([
    ['AO-{VAL}', 'Quy tắc phải có đúng một {SEQ} để SKU không trùng'],
    ['AO-{SEQ}-{SEQ}', 'Quy tắc phải có đúng một {SEQ} để SKU không trùng'],
    ['ao-{SEQ}', 'Phần chữ cố định chỉ gồm A-Z, 0-9, "-" và "_"'],
    ['AO {SEQ}', 'Phần chữ cố định chỉ gồm A-Z, 0-9, "-" và "_"'],
    ['AO-{SEQ:0}', 'Số chữ số của {SEQ} từ 1 đến 9'],
    ['AO-{VAL}-{VAL}-{SEQ}', 'Chỉ dùng {VAL} một lần'],
  ])('%s → %s', (pattern, message) => {
    expect(skuPatternError(pattern)).toBe(message);
  });

  it('quy tắc dài hơn 40 ký tự', () => {
    expect(skuPatternError(`${'A'.repeat(36)}{SEQ}`)).toBe('Quy tắc tối đa 40 ký tự');
  });
});
