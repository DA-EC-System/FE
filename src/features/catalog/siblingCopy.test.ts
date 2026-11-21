import { describe, expect, it } from 'vitest';
import { copyFieldsText, siblingToCopy } from './siblingCopy';

const v = (id: string, over: Record<string, unknown> = {}) =>
  ({
    id,
    sku: id.toUpperCase(),
    businessStatus: 'selling',
    standardPrice: null,
    targetNetPrice: null,
    weightG: null,
    lengthMm: null,
    widthMm: null,
    heightMm: null,
    ...over,
  }) as Parameters<typeof siblingToCopy>[0];

describe('siblingToCopy (KB3 3.9: gợi ý chép từ SKU cùng sản phẩm)', () => {
  it('chọn SKU có số cho nhiều ô trống nhất; chỉ chép ô đang trống', () => {
    const me = v('hong', { targetNetPrice: 120000 });
    const red = v('do', { targetNetPrice: 149000, weightG: 50, lengthMm: 100, widthMm: 30, heightMm: 30 });
    const part = v('cam', { weightG: 60 });
    const pick = siblingToCopy(me, [me, part, red]);
    expect(pick?.from.id).toBe('do');
    expect(pick?.fields).toEqual(['weightG', 'lengthMm', 'widthMm', 'heightMm']);
    expect(copyFieldsText(pick!.fields)).toBe('cân nặng, kích thước gói');
  });

  it('bỏ SKU đã lưu trữ; không có gì chép được thì null', () => {
    const me = v('hong');
    expect(siblingToCopy(me, [me, v('do', { weightG: 50, businessStatus: 'archived' })])).toBeNull();
    expect(siblingToCopy(me, [me, v('cam')])).toBeNull();
  });
});
