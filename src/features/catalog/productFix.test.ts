import { describe, expect, it } from 'vitest';
import { blockerFix } from '@/features/channel/blockerFix';
import { productFixTarget } from './productFix';

const path = '/c/c1/catalog/products/p1';
const ctx = { companyId: 'c1', productId: 'p1', platform: 'lazada', shopId: 's1', variantId: 'v1' };

describe('productFixTarget: nút sửa trong chính trang sản phẩm (review PR #480)', () => {
  it('sửa cân nặng: ô Khối lượng của SKU trong bảng biến thể', () => {
    const fix = blockerFix({ kind: 'variant_field', field: 'weight' }, ctx)!;
    expect(productFixTarget(fix.to, path)).toEqual({ spec: 'v1', field: 'weightG', tab: 'commerio' });
  });

  it('attribute: chuyển tab sàn kèm ô cần focus', () => {
    const fix = blockerFix({ kind: 'spec_attribute', attributeCode: 'color_family' }, ctx)!;
    expect(productFixTarget(fix.to, path)).toEqual({ tab: 'lazada', focus: 'ptab-lazada-color_family' });
  });

  it('ảnh: tab Nội bộ; trỏ trang khác thì null', () => {
    expect(productFixTarget(`${path}?focus=product-field-images`, path)).toEqual({ tab: 'commerio', focus: 'product-field-images' });
    expect(productFixTarget('/c/c1/finance/configs', path)).toBeNull();
    expect(productFixTarget('/c/c1/catalog/products/p2?spec=v1', path)).toBeNull();
  });
});
