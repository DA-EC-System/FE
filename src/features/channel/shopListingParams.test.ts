import { describe, expect, it } from 'vitest';
import type { RemoteSku } from '@/types/shop';
import { readShopListingParams, resolveMatchTarget, writeShopListingParams } from './shopListingParams';

const sku = (externalSkuId: string, extra: Partial<RemoteSku> = {}) =>
  ({ externalSkuId, sellerSku: 'A', title: 'Áo', matchedVariantId: null, mode: null, pendingMapping: null, ...extra }) as RemoteSku;

describe('tham số trang gian hàng (FE#327)', () => {
  it('đọc tab, ô tìm, match, from; tab lạ về Tất cả', () => {
    expect(readShopListingParams(new URLSearchParams('tab=unmatched&q=abc&match=s-1&from=ord-1'))).toEqual({
      tab: 'unmatched',
      q: 'abc',
      match: 's-1',
      from: 'ord-1',
    });
    expect(readShopListingParams(new URLSearchParams('tab=xyz'))).toEqual({ tab: 'all', q: '', match: null, from: null });
  });

  it('ghi tab, ô tìm và giữ tham số khác; Tất cả và ô rỗng thì bỏ', () => {
    const sp = new URLSearchParams('from=ord-1&tab=unmatched&q=abc');
    expect(writeShopListingParams(sp, { tab: 'failed' }).toString()).toBe('from=ord-1&tab=failed&q=abc');
    expect(writeShopListingParams(sp, { tab: 'all', q: '' }).toString()).toBe('from=ord-1');
    expect(sp.toString()).toBe('from=ord-1&tab=unmatched&q=abc');
  });

  it('tra SKU sàn của match', () => {
    const items = [
      sku('s-1'),
      sku('s-2', { matchedVariantId: 'v1' }),
      sku('s-3', { mode: 'unmanaged' } as Partial<RemoteSku>),
      sku('s-4', { pendingMapping: { variantId: null } } as Partial<RemoteSku>),
    ];
    expect(resolveMatchTarget(items, 's-1').kind).toBe('open');
    expect(resolveMatchTarget(items, 's-2').kind).toBe('matched');
    expect(resolveMatchTarget(items, 's-3').kind).toBe('matched');
    expect(resolveMatchTarget(items, 's-4').kind).toBe('pending');
    expect(resolveMatchTarget(items, 's-9').kind).toBe('missing');
  });
});
