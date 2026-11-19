import { describe, expect, it } from 'vitest';
import type { ListingRow, ListingStatus } from '@/types/shop';
import { matchScore, UNMANAGED, variantMatchOptions } from './matchOptions';

const row = (variantId: string, status: ListingStatus | null): ListingRow =>
  ({
    variantId,
    sku: variantId.toUpperCase(),
    productName: 'Áo thun',
    attributesLabel: variantId,
    listing: status ? { status, externalSkuId: `ext-${variantId}` } : null,
  }) as unknown as ListingRow;

const items = [row('v-none', null), row('v-live', 'live'), row('v-delisted', 'delisted'), row('v-failed', 'push_failed')];

describe('variantMatchOptions (FE#310)', () => {
  it('có biến thể chưa có listing và biến thể đã gỡ (kèm "Đã gỡ"), không có biến thể đang có listing khác delisted', () => {
    const opts = variantMatchOptions(items, { sellerSku: null, isCeo: false });
    expect(opts.map((o) => o.id)).toEqual(['v-none', 'v-delisted', UNMANAGED]);
    expect(opts.find((o) => o.id === 'v-delisted')!.subtitle).toBe('V-DELISTED · Đã gỡ');
    expect(opts.find((o) => o.id === 'v-none')!.subtitle).toBe('V-NONE');
  });

  it('không có listing delisted: chỉ biến thể chưa có listing', () => {
    const opts = variantMatchOptions([row('v-none', null), row('v-live', 'live')], { sellerSku: null, isCeo: false });
    expect(opts.map((o) => o.id)).toEqual(['v-none', UNMANAGED]);
  });

  it('đổi ghép: biến thể đang ghép đứng đầu kèm "(đang ghép)", rồi biến thể trùng SKU người bán (gợi ý)', () => {
    const opts = variantMatchOptions(items, { sellerSku: 'V-DELISTED', currentVariantId: 'v-live', isCeo: false });
    expect(opts.map((o) => o.id)).toEqual(['v-live', 'v-delisted', 'v-none', UNMANAGED]);
    expect(opts[0].title).toContain('(đang ghép)');
    expect(opts[0].suggested).toBe(false);
    expect(opts.find((o) => o.id === 'v-delisted')!.suggested).toBe(true);
    expect(opts.find((o) => o.id === 'v-none')!.suggested).toBe(false);
  });

  it('FE#326: xếp theo tên trên sàn, biến thể đã gỡ vẫn có trong danh sách', () => {
    const ds = [
      { ...row('v-a', null), productName: 'Quần jean', attributesLabel: 'Xanh' },
      { ...row('v-b', 'delisted'), productName: 'Áo thun', attributesLabel: 'Đỏ, L' },
      { ...row('v-c', null), productName: 'Áo thun', attributesLabel: 'Trắng, M' },
    ] as ListingRow[];
    const opts = variantMatchOptions(ds, { title: 'Ao thun do size L', sellerSku: null, isCeo: false });
    expect(opts.map((o) => o.id)).toEqual(['v-b', 'v-c', 'v-a', UNMANAGED]);
    expect(opts[0].suggested).toBe(true);
    expect(opts[0].subtitle).toContain('Đã gỡ');
  });

  it('matchScore: trùng SKU người bán cao nhất, không giống là 0', () => {
    expect(matchScore({ title: 'x', sellerSku: 'tee-01' }, { name: 'y', sku: 'TEE-01' })).toBe(1000);
    expect(matchScore({ title: 'Mũ len', sellerSku: null }, { name: 'Áo thun', sku: 'TEE' })).toBe(0);
  });

  it('Không quản tồn: CEO áp ngay, vai trò khác cần CEO duyệt', () => {
    const ceo = variantMatchOptions(items, { sellerSku: null, isCeo: true }).at(-1)!;
    const sale = variantMatchOptions(items, { sellerSku: null, isCeo: false }).at(-1)!;
    expect(ceo.subtitle).toContain('Áp ngay (ghi là tự duyệt)');
    expect(ceo.subtitle).not.toContain('Cần CEO duyệt');
    expect(sale.subtitle).toContain('Cần CEO duyệt');
  });
});
