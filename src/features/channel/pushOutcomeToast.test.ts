import { describe, expect, it } from 'vitest';
import type { ListingStatus } from '@/types/shop';
import { outcomeToast, pushOutcomes } from './usePushOutcomeToasts';

const at = '2026-11-24T00:00:00.000Z';
const ctx = { companyId: 'c1', canFix: true, shopLabel: 'Đùi Gà Store' };
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dòng rút gọn đủ trường hàm đọc
const row = (variantId: string, status: ListingStatus, extra: Record<string, unknown> = {}): any => ({
  variantId,
  productId: 'p1',
  sku: `SKU-${variantId}`,
  platform: 'lazada',
  listing: { status, ...extra },
});
const weightError = {
  pushError: {
    code: 'x',
    kind: 'data',
    message: 'Cân nặng phải là số',
    target: { kind: 'variant_field', field: 'weight' },
    platformCode: 'E',
    at,
  },
};
const keyOf = (r: { variantId: string }) => r.variantId;
const pushing = (...ids: string[]) => new Map(ids.map((id) => [id, 'pushing' as ListingStatus]));

describe('toast kết quả đăng (review PR #480)', () => {
  it('lượt nạp đầu không báo', () => {
    expect(pushOutcomes(null, [row('a', 'live')], keyOf, ctx)).toEqual([]);
  });

  it('một dòng lỗi: câu lỗi và nút sửa', () => {
    const t = outcomeToast(pushOutcomes(pushing('a'), [row('a', 'push_failed', weightError)], keyOf, ctx), ctx);
    expect(t).toEqual({
      kind: 'error',
      text: 'Chưa đăng được SKU-a lên Đùi Gà Store: Cân nặng phải là số',
      action: { label: 'Sửa cân nặng', to: '/c/c1/catalog/products/p1?spec=a&field=weightG' },
    });
  });

  it('nhiều dòng: gom một toast; đúng một lỗi thì nút sửa', () => {
    const rows = [row('a', 'live'), row('b', 'live'), row('c', 'push_failed', weightError)];
    expect(outcomeToast(pushOutcomes(pushing('a', 'b', 'c'), rows, keyOf, ctx), ctx)).toEqual({
      kind: 'error',
      text: 'Đã đăng 2 SKU, lỗi 1 SKU',
      action: { label: 'Sửa cân nặng', to: '/c/c1/catalog/products/p1?spec=c&field=weightG' },
    });
  });

  it('nhiều lỗi: lối tới tab sàn, không nút sửa từng SKU', () => {
    const rows = [row('a', 'live'), row('b', 'push_failed', weightError), row('c', 'push_failed', weightError)];
    expect(outcomeToast(pushOutcomes(pushing('a', 'b', 'c'), rows, keyOf, ctx), ctx)).toEqual({
      kind: 'error',
      text: 'Đã đăng 1 SKU, lỗi 2 SKU',
      action: {
        label: 'Xem lỗi ở tab sàn',
        to: '/c/c1/catalog/products/p1?tab=lazada',
      },
    });
    expect(outcomeToast(pushOutcomes(pushing('a', 'b'), [row('a', 'live'), row('b', 'under_review')], keyOf, ctx), ctx)).toEqual({
      kind: 'success',
      text: 'Đã đăng 1 SKU, 1 SKU chờ sàn duyệt',
    });
  });
});
