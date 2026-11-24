import { describe, expect, it, vi } from 'vitest';

const post = vi.hoisted(() => vi.fn());
vi.mock('./client', () => ({ apiClient: { post } }));

import { fetchPushPreview, PUSH_PREVIEW_BATCH } from './readiness.api';

describe('fetchPushPreview (FE#458)', () => {
  it('chia lô 200 biến thể, mỗi lô chỉ gửi giá của biến thể trong lô, gộp dòng theo thứ tự', async () => {
    post.mockImplementation((_url: string, body: { variantIds: string[] }) =>
      Promise.resolve({ data: { rows: body.variantIds.map((variantId) => ({ variantId })), summary: { ready: 0, blocked: 0 } } }),
    );
    const ids = Array.from({ length: PUSH_PREVIEW_BATCH + 5 }, (_, i) => `v${i}`);
    const rows = await fetchPushPreview({ shopId: 's1', variantIds: ids, listPrices: { v0: 1000, v202: 2000 } });
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0]![0]).toBe('/channel/shops/s1/listings/push-preview');
    expect(post.mock.calls[0]![1].variantIds).toHaveLength(200);
    expect(post.mock.calls[0]![1].listPrices).toEqual({ v0: 1000 });
    expect(post.mock.calls[1]![1]).toEqual({ variantIds: ids.slice(200), listPrices: { v202: 2000 } });
    expect(rows.map((r) => r.variantId)).toEqual(ids);
  });

  it('không có giá gõ thì không gửi listPrices', async () => {
    post.mockClear();
    await fetchPushPreview({ shopId: 's1', variantIds: ['v1'] });
    expect(post.mock.calls[0]![1]).toEqual({ variantIds: ['v1'] });
  });
});
