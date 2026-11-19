import { describe, expect, it } from 'vitest';
import type { ListingRow, ListingStatus } from '@/types/shop';
import { UNMANAGED, variantMatchOptions } from './matchOptions';

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

  it('đổi ghép: có biến thể đang ghép với chính SKU này; gợi ý theo SKU người bán', () => {
    const opts = variantMatchOptions(items, { sellerSku: 'V-DELISTED', currentVariantId: 'v-live', isCeo: false });
    expect(opts.map((o) => o.id)).toEqual(['v-none', 'v-live', 'v-delisted', UNMANAGED]);
    expect(opts.find((o) => o.id === 'v-delisted')!.suggested).toBe(true);
    expect(opts.find((o) => o.id === 'v-live')!.subtitle).toBe('V-LIVE');
  });

  it('Không quản tồn: CEO áp ngay, vai trò khác cần CEO duyệt', () => {
    const ceo = variantMatchOptions(items, { sellerSku: null, isCeo: true }).at(-1)!;
    const sale = variantMatchOptions(items, { sellerSku: null, isCeo: false }).at(-1)!;
    expect(ceo.subtitle).toContain('Áp ngay (ghi là tự duyệt)');
    expect(ceo.subtitle).not.toContain('Cần CEO duyệt');
    expect(sale.subtitle).toContain('Cần CEO duyệt');
  });
});
