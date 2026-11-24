import { describe, expect, it } from 'vitest';
import { blockerFix, canUseFix } from './blockerFix';

const ctx = { companyId: 'c1', productId: 'p1', platform: 'lazada', shopId: 's1', variantId: 'v1' };
const product = '/c/c1/catalog/products/p1';

describe('blockerFix: nút tới chỗ sửa theo target (FE#462)', () => {
  it('trường của biến thể: mở hộp Thông tin SKU', () => {
    expect(blockerFix({ kind: 'variant_field', field: 'weight' }, ctx)).toEqual({
      label: 'Sửa cân nặng',
      to: `${product}?spec=v1`,
      perm: 'product',
    });
    expect(blockerFix({ kind: 'variant_field', field: 'price' }, { ...ctx, variantId: null })?.to).toBe(
      `${product}?focus=product-field-variants`,
    );
  });

  it('category, attribute, thuộc tính biến thể: tab sàn đúng ô', () => {
    expect(blockerFix({ kind: 'category' }, ctx)?.to).toBe(`${product}?tab=lazada&focus=ptab-lazada-category`);
    expect(blockerFix({ kind: 'spec_attribute', attributeCode: 'color_family' }, ctx)?.to).toBe(
      `${product}?tab=lazada&focus=ptab-lazada-color_family`,
    );
    expect(blockerFix({ kind: 'axis' }, ctx)).toMatchObject({ label: 'Sửa thuộc tính biến thể', to: `${product}?tab=lazada&focus=ptab-lazada-section-attrs` });
    expect(blockerFix({ kind: 'category' }, { ...ctx, platform: null })).toBeNull();
  });

  it('ảnh, tên, bảng kích cỡ: tab Nội bộ', () => {
    expect(blockerFix({ kind: 'product_field', field: 'images' }, ctx)?.to).toBe(`${product}?focus=product-field-images`);
    expect(blockerFix({ kind: 'product_field', field: 'name' }, ctx)?.label).toBe('Sửa tên');
  });

  it('gian hàng và listing', () => {
    const fee = blockerFix({ kind: 'shop', field: 'fee_config' }, ctx)!;
    expect(fee).toEqual({ label: 'Cài phí sàn', to: '/c/c1/finance/configs', perm: 'finance' });
    expect(canUseFix(fee, { product: true, finance: false })).toBe(false);
    expect(blockerFix({ kind: 'listing', listingId: null }, ctx)).toEqual({
      label: 'Xem ở gian hàng',
      to: '/c/c1/channel/shops/s1',
      perm: null,
    });
    expect(blockerFix(null, ctx)).toBeNull();
  });
});
