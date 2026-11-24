import { describe, expect, it } from 'vitest';
import type { RemoteSku } from '@/types/shop';
import { groupRemote, remoteTableRows } from './remoteGroups';

const sku = (externalSkuId: string, externalProductId: string, title = `SP ${externalProductId}`): RemoteSku => ({
  externalProductId,
  externalSkuId,
  title,
  sellerSku: externalSkuId.toUpperCase(),
  matchedVariantId: null,
  mode: null,
  listingId: null,
  listingVersion: null,
  pendingMapping: null,
});

describe('groupRemote', () => {
  it('gom theo sản phẩm, giữ thứ tự xuất hiện đầu', () => {
    const groups = groupRemote([sku('a1', 'A'), sku('b1', 'B'), sku('a2', 'A')]);
    expect(groups.map((g) => [g.key, g.skus.map((s) => s.externalSkuId)])).toEqual([
      ['A', ['a1', 'a2']],
      ['B', ['b1']],
    ]);
  });

  it('thiếu mã sản phẩm thì mỗi SKU đứng riêng', () => {
    expect(groupRemote([sku('x', ''), sku('y', '')])).toHaveLength(2);
  });
});

describe('remoteTableRows', () => {
  const groups = groupRemote([sku('a1', 'A'), sku('a2', 'A'), sku('b1', 'B')]);

  it('sản phẩm nhiều SKU có dòng cha rồi các SKU con; một SKU giữ một dòng', () => {
    const rows = remoteTableRows(groups, new Set());
    expect(rows.map((r) => r.externalSkuId)).toEqual(['product:A', 'a1', 'a2', 'b1']);
    expect(rows[0].group).toEqual({ key: 'A', count: 2, open: true });
    expect(rows[1].child).toBe(true);
    expect(rows[3].group).toBeUndefined();
    expect(rows[3].child).toBeUndefined();
  });

  it('gập thì chỉ còn dòng cha', () => {
    const rows = remoteTableRows(groups, new Set(['A']));
    expect(rows.map((r) => r.externalSkuId)).toEqual(['product:A', 'b1']);
    expect(rows[0].group?.open).toBe(false);
  });
});
