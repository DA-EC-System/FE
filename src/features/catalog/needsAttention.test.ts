import { describe, expect, it } from 'vitest';
import type { ProductListingRow } from '@/types/shop';
import { attentionItems } from './needsAttention';

const variant = (id: string, value: string, missing: string[] = []) =>
  ({
    id,
    sku: id.toUpperCase(),
    attributes: [{ attributeId: 'a', attributeName: 'Màu', valueId: value, value }],
    missing,
    businessStatus: 'selling',
  }) as Parameters<typeof attentionItems>[0]['variants'][number];

const row = (over: Partial<ProductListingRow>): ProductListingRow =>
  ({
    variantId: 'v1',
    sku: 'SP1-DE',
    attributesLabel: 'Đen / M',
    price: 199000,
    netReceived: 150000,
    listing: null,
    shopId: 's1',
    shopName: 'Shop A',
    platform: 'p1',
    ...over,
  }) as ProductListingRow;

const platformName = (p: string) => (p === 'p1' ? 'Sàn Một' : p);

describe('attentionItems (hộp Cần xử lý, chốt v2 câu 7)', () => {
  it('thiếu giá ở biến thể: mở hộp Thông tin SKU của biến thể đầu tiên còn thiếu', () => {
    const items = attentionItems({
      missing: [{ key: 'price', label: 'Giá muốn thực nhận', skuCount: 2, target: 'x' }],
      variants: [variant('v1', 'Đen'), variant('v2', 'Trắng', ['price']), variant('v3', 'Xanh', ['price'])],
      rows: [],
      platformName,
    });
    expect(items).toEqual([
      {
        key: 'sku:price',
        text: 'Biến thể Trắng chưa có giá muốn thực nhận (và 1 biến thể khác)',
        actionLabel: 'Mở Thông tin SKU V2',
        action: { kind: 'sku', variantId: 'v2' },
      },
    ]);
  });

  it('mục mức sản phẩm: tới ô cần điền', () => {
    const [item] = attentionItems({ missing: [{ key: 'image', label: 'Ảnh', target: 'product-images' }], variants: [], rows: [], platformName });
    expect(item).toMatchObject({ text: 'Còn thiếu ảnh', action: { kind: 'focus', target: 'product-images' } });
  });

  it('gian hàng chưa có cấu hình phí và sàn từ chối listing, mỗi sàn một mục', () => {
    const items = attentionItems({
      missing: [],
      variants: [],
      rows: [
        row({ netReceived: null }),
        row({ shopName: 'Shop B', listing: { status: 'rejected', rejectReason: 'Ảnh chính phải nền trắng', pushError: null } as never }),
        row({ sku: 'SP1-TR', listing: { status: 'push_failed', rejectReason: null, pushError: { code: 'x', message: 'Lỗi', at: '' } } as never }),
      ],
      platformName,
    });
    expect(items.map((i) => i.action.kind)).toEqual(['fee', 'tab']);
    expect(items[0]!.text).toBe('Shop A chưa có cấu hình phí sàn: chưa tính được phí, thực nhận nên chưa đăng được');
    expect(items[1]!.text).toBe('Sàn Một: Shop B chưa nhận Đen / M: "Ảnh chính phải nền trắng" (và 1 SKU khác)');
  });
});
