import { describe, expect, it } from 'vitest';
import type { SetupSuggestion, Shop } from '@/types/shop';
import {
  creatableUnmatched,
  createChoice,
  decisionErrors,
  initialChoices,
  openOrdersSkippedNote,
  setupRunning,
  takenVariants,
  toDecisions,
} from './setupDecisions';

const row = (externalSkuId: string, over: Partial<SetupSuggestion> = {}): SetupSuggestion => ({
  externalSkuId,
  title: `SP ${externalSkuId}`,
  imageUrl: null,
  status: 'live',
  match: 'sku',
  score: null,
  variantId: `var-${externalSkuId}`,
  sku: `SKU-${externalSkuId}`,
  available: 5,
  platformStock: 5,
  canCreate: false,
  cannotCreateReason: 'sku_taken',
  ...over,
});

describe('Bước 1 thiết lập: quyết định từng SKU sàn (§18.7.5)', () => {
  it('chỉ chọn sẵn dòng có variantId, mỗi biến thể một dòng', () => {
    const list = [
      row('a'),
      row('b', { match: 'name', score: 0.62, variantId: 'var-a', sku: 'SKU-a' }),
      row('c', { match: 'none', variantId: null, sku: null, available: null }),
    ];
    const c = initialChoices(list);
    expect(c.a).toEqual({ variantId: 'var-a', sku: 'SKU-a', available: 5, picked: false });
    expect(c.b).toBeNull();
    expect(c.c).toBeNull();
  });

  it('gửi một quyết định cho mọi SKU trong suggestions, bỏ qua là variantId null', () => {
    const list = [row('a'), row('b'), row('c', { match: 'none', variantId: null, sku: null, available: null })];
    const c = initialChoices(list);
    c.b = { variantId: 'var-khac', sku: 'KHAC', available: 2, picked: true };
    expect(toDecisions(list, c)).toEqual([
      { externalSkuId: 'a', variantId: 'var-a' },
      { externalSkuId: 'b', variantId: 'var-khac' },
      { externalSkuId: 'c', variantId: null },
    ]);
  });

  it('lỗi decisions.<i> gắn về đúng dòng', () => {
    const list = [row('a'), row('b')];
    expect(decisionErrors(list, { 'decisions.1': 'Biến thể đã ghép ở dòng khác', openingStock: 'x' })).toEqual({
      b: 'Biến thể đã ghép ở dòng khác',
    });
    expect(decisionErrors(list, undefined)).toEqual({});
  });
});

describe('Tiến độ thiết lập (§18.7.7)', () => {
  it('còn bước running thì còn đọc lại', () => {
    const shop = (status: 'running' | 'done' | 'blocked') =>
      ({ setup: { steps: [{ key: 'push_stock', status, blockedBy: null }], unmatchedCount: 0 } }) as unknown as Shop;
    expect(setupRunning(shop('running'))).toBe(true);
    expect(setupRunning(shop('blocked'))).toBe(false);
    expect(setupRunning({ setup: null } as unknown as Shop)).toBe(false);
    expect(setupRunning(undefined)).toBe(false);
  });
});

describe('Đơn còn mở bỏ qua vì trần môi trường (Shop.setup.openOrdersSkipped)', () => {
  const setup = (openOrdersSkipped?: number) => ({ steps: [], unmatchedCount: 0, openOrdersSkipped });

  it('có đơn bỏ qua thì nêu số', () => {
    expect(openOrdersSkippedNote(setup(3500))).toBe(
      'Bỏ qua 3500 đơn đang xử lý cũ hơn; hàng của các đơn này chưa được tạm giữ',
    );
  });

  it('0, vắng (BE trước #198) hoặc setup null thì không có câu', () => {
    expect(openOrdersSkippedNote(setup(0))).toBeNull();
    expect(openOrdersSkippedNote(setup(undefined))).toBeNull();
    expect(openOrdersSkippedNote(null)).toBeNull();
  });
});

describe('Tạo SKU kho từ SKU sàn (commerio-backend#500, §18.7.5)', () => {
  const none = (id: string, over: Partial<SetupSuggestion> = {}) =>
    row(id, { match: 'none', variantId: null, sku: null, available: null, canCreate: true, cannotCreateReason: null, ...over });

  it('dòng tạo mới gửi variantId null kèm create, dòng khác giữ như cũ', () => {
    const list = [row('a'), none('b'), none('c')];
    const c = initialChoices(list);
    c.b = createChoice();
    expect(toDecisions(list, c)).toEqual([
      { externalSkuId: 'a', variantId: 'var-a' },
      { externalSkuId: 'b', variantId: null, create: true },
      { externalSkuId: 'c', variantId: null },
    ]);
  });

  it('nút tạo hàng loạt chỉ lấy dòng tạo được mà chưa chọn gì', () => {
    const list = [
      row('a'),
      none('b'),
      none('c', { canCreate: false, cannotCreateReason: 'no_seller_sku' }),
      none('d'),
      row('e', { match: 'name', score: 0.5, canCreate: true, cannotCreateReason: null }),
    ];
    const c = initialChoices(list);
    c.d = { variantId: 'var-x', sku: 'X', available: 1, picked: true };
    expect(creatableUnmatched(list, c).map((s) => s.externalSkuId)).toEqual(['b']);
  });

  it('dòng tạo mới không chiếm biến thể nào ở ô chọn SKU kho của dòng khác', () => {
    const c = { a: { variantId: 'var-a', sku: 'A', available: 1, picked: false }, b: createChoice(), c: null };
    expect([...takenVariants(c, 'c')]).toEqual(['var-a']);
    expect([...takenVariants(c, 'a')]).toEqual([]);
  });
});
