import { describe, expect, it } from 'vitest';
import { PRODUCT_NAME_MIN, productNameCounter, productNameError, productNameLength, productNameMaxError } from './productName';
import { productSchema } from './shared';

const NAME_24 = 'Áo thun cotton nam cổ tr'; // 24 ký tự
const NAME_25 = 'Áo thun cotton nam cổ trò'; // 25 ký tự

const base = { groupId: 'g1', description: '', originCountry: '', brand: '' };

describe('tên sản phẩm tối thiểu 25 ký tự', () => {
  it('mẫu thử đúng độ dài', () => {
    expect(productNameLength(NAME_24)).toBe(24);
    expect(productNameLength(NAME_25)).toBe(PRODUCT_NAME_MIN);
  });

  it('24 ký tự trượt, 25 ký tự đạt', () => {
    expect(productNameError(NAME_24)).toBe('Tên sản phẩm cần ít nhất 25 ký tự (hiện 24)');
    expect(productNameError(NAME_25)).toBeNull();
  });

  it('khoảng trắng đầu cuối không tính', () => {
    expect(productNameError(`   ${NAME_24}   `)).toBe('Tên sản phẩm cần ít nhất 25 ký tự (hiện 24)');
    expect(productNameError(`  ${NAME_25}\t`)).toBeNull();
  });

  it('chữ có dấu gõ dạng tổ hợp (NFD) đếm như dạng dựng sẵn', () => {
    expect(productNameLength(NAME_25.normalize('NFD'))).toBe(25);
  });

  it('tên rỗng báo hiện 0', () => {
    expect(productNameError('   ')).toBe('Tên sản phẩm cần ít nhất 25 ký tự (hiện 0)');
  });

  it('schema form sản phẩm dùng cùng luật', () => {
    const short = productSchema.safeParse({ ...base, name: ` ${NAME_24} ` });
    expect(short.success).toBe(false);
    expect(short.error?.issues[0]).toMatchObject({ path: ['name'], message: 'Tên sản phẩm cần ít nhất 25 ký tự (hiện 24)' });
    const ok = productSchema.safeParse({ ...base, name: ` ${NAME_25} ` });
    expect(ok.success).toBe(true);
    expect(ok.data?.name).toBe(NAME_25);
  });

  it('tối đa đếm cùng cách với bộ đếm: chữ có dấu dạng tổ hợp (NFD) không bị đếm đôi', () => {
    const name200 = 'ệ'.normalize('NFD').repeat(200);
    expect(name200.length).toBe(600);
    expect(productNameMaxError(name200)).toBeNull();
    expect(productSchema.safeParse({ ...base, name: name200 }).success).toBe(true);
    expect(productNameMaxError(`${name200}a`)).toBe('Tên sản phẩm tối đa 200 ký tự');
    expect(productSchema.safeParse({ ...base, name: `${name200}a` }).error?.issues).toMatchObject([
      { path: ['name'], message: 'Tên sản phẩm tối đa 200 ký tự' },
    ]);
    expect(productNameMaxError('a'.repeat(121), 120)).toBe('Tên sản phẩm tối đa 120 ký tự');
  });

  it('bộ đếm nhắc mức tối thiểu khi còn ngắn', () => {
    expect(productNameCounter(NAME_24)).toBe('24/200 · tối thiểu 25');
    expect(productNameCounter(NAME_25)).toBe('25/200');
  });
});
