import { describe, expect, it } from 'vitest';
import { countryName, countryOptions } from './countries';
import { productFactsBody } from './shared';

describe('countryOptions', () => {
  it('đủ mã ISO, không trùng, nhóm hay gặp ở đầu', () => {
    const all = countryOptions();
    expect(all.length).toBe(249);
    expect(new Set(all.map((o) => o.code)).size).toBe(249);
    expect(all.slice(0, 2).map((o) => o.code)).toEqual(['VN', 'CN']);
    expect(all.every((o) => /^[A-Z]{2}$/.test(o.code))).toBe(true);
  });

  it('tên tiếng Việt', () => {
    expect(countryName('VN')).toBe('Việt Nam');
  });
});

describe('productFactsBody', () => {
  const p = {
    name: 'Áo thun',
    description: 'Mô tả',
    version: 3,
    images: [
      { id: 'b', fileId: 'f2', url: '', position: 1 },
      { id: 'a', fileId: 'f1', url: '', position: 0 },
    ],
  };

  it('gửi lại tên, mô tả, ảnh theo thứ tự; không đụng bảng size', () => {
    const body = productFactsBody(p, { originCountry: 'VN', brand: ' Jastech ' });
    expect(body).toEqual({ name: 'Áo thun', description: 'Mô tả', imageFileIds: ['f1', 'f2'], originCountry: 'VN', brand: 'Jastech', version: 3 });
    expect('sizeChartFileId' in body).toBe(false);
  });

  it('ô trống gửi null', () => {
    expect(productFactsBody(p, { originCountry: '', brand: '  ' })).toMatchObject({ originCountry: null, brand: null });
  });
});
