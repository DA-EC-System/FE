import { describe, expect, it } from 'vitest';
import type { ProductDetail } from '@/types/catalog';
import { withVariantDefaults } from './catalog.api';

// Sản phẩm đúng như BE main trả khi chưa có commerio-backend#204: biến thể thiếu các trường mới
const tuBe = (variant: Record<string, unknown>) =>
  ({
    id: 'p1',
    name: 'Áo',
    group: { id: 'c1', name: 'Áo' },
    variantCount: 1,
    thumbnailUrl: null,
    status: 'active',
    updatedAt: '2026-11-13T00:00:00.000Z',
    version: 1,
    description: '',
    images: [],
    variants: [{ id: 'v1', sku: 'AO-0001', attributes: [], standardPrice: null, ...variant }],
  }) as unknown as ProductDetail;

describe('withVariantDefaults', () => {
  it('BE chưa trả trường của BE#204 thì điền mặc định, không để undefined', () => {
    const [v] = withVariantDefaults(tuBe({ archivedAt: null })).variants;
    expect(v).toMatchObject({
      businessStatus: 'selling',
      missing: [],
      targetNetPrice: null,
      hasListingError: false,
      minQty: null,
      weightG: null,
      lengthMm: null,
      widthMm: null,
      heightMm: null,
      listingCount: 0,
      archiveBlockers: [],
    });
  });

  it('FE#260: thiếu độ hoàn thiện, hiện diện thì để trống cho UI hiện "Chưa tính"', () => {
    const [v] = withVariantDefaults(tuBe({ archivedAt: null })).variants;
    expect(v.readiness).toBeUndefined();
    expect(v.presence).toBeUndefined();
  });

  it('SKU đã lưu trữ suy ra archived; trường BE đã trả thì giữ nguyên', () => {
    const [luuTru] = withVariantDefaults(tuBe({ archivedAt: '2026-11-01T00:00:00.000Z' })).variants;
    expect(luuTru.businessStatus).toBe('archived');
    const [day] = withVariantDefaults(tuBe({ archivedAt: null, businessStatus: 'paused', weightG: 0, missing: ['image'] }))
      .variants;
    expect(day).toMatchObject({ businessStatus: 'paused', weightG: 0, missing: ['image'] });
  });
});
