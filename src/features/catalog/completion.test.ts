import { describe, expect, it } from 'vitest';
import { GROUP_FIELD_ID, MIN_QTY_FIELD_ID, missingItems, parseMinQty, publishBlocker } from './completion';
import { SHARED_TARGETS } from './productTabs';
import { specFieldDomId } from './specs/SpecFieldsInput';

describe('missingItems', () => {
  it('gộp missing của các SKU chưa lưu trữ, đếm số SKU thiếu', () => {
    const items = missingItems({
      variants: [
        { businessStatus: 'selling', missing: ['weight', 'minQty'] },
        { businessStatus: 'selling', missing: ['weight', 'image'] },
        { businessStatus: 'archived', missing: ['weight', 'price'] },
      ],
    });
    expect(items).toEqual([
      { key: 'image', label: 'Ảnh sản phẩm', target: SHARED_TARGETS.images },
      { key: 'minQty', label: 'Ngưỡng tồn', target: MIN_QTY_FIELD_ID, skuCount: 1 },
      { key: 'weight', label: 'Cân nặng', target: SHARED_TARGETS.variants, skuCount: 2 },
    ]);
  });

  it('form tạo: tự xét tên, danh mục, ảnh', () => {
    const items = missingItems({ form: { name: ' ', groupId: '', imageCount: 0 } });
    expect(items.map((i) => [i.key, i.target])).toEqual([
      ['name', SHARED_TARGETS.name],
      ['category', GROUP_FIELD_ID],
      ['image', SHARED_TARGETS.images],
    ]);
  });

  it('thuộc tính bắt buộc còn trống: mỗi ô một dòng, nhảy đúng ô; thay dòng "specs" chung của BE', () => {
    const items = missingItems({
      variants: [{ businessStatus: 'selling', missing: ['specs'] }],
      requiredSpecs: [
        { fieldId: 'a', name: 'Chất liệu', required: true },
        { fieldId: 'b', name: 'Dáng áo', required: true },
        { fieldId: 'c', name: 'Mùa', required: false },
      ],
      specDrafts: { a: { optionIds: ['o1'], newValues: [], value: '' } },
    });
    expect(items).toEqual([{ key: 'spec:b', label: 'Dáng áo', target: specFieldDomId('b') }]);
  });

  it('đủ hết thì rỗng', () => {
    expect(missingItems({ variants: [{ businessStatus: 'selling', missing: [] }], form: { name: 'A', groupId: 'g', imageCount: 1 } })).toEqual([]);
  });
});

describe('parseMinQty', () => {
  it.each([
    ['10', 10],
    [' 0 ', 0],
    ['', null],
    ['-1', null],
    ['1.5', null],
    ['abc', null],
  ])('%s → %s', (text, n) => expect(parseMinQty(text)).toBe(n));
});

describe('publishBlocker', () => {
  const ok = { isNew: false, archived: false, canPublish: true, missingCount: 0, dirty: false };
  it('bấm được khi đủ điều kiện', () => expect(publishBlocker(ok)).toBeNull());
  it.each([
    [{ isNew: true }, 'Lưu sản phẩm trước rồi mới đăng'],
    [{ archived: true }, 'Sản phẩm đã lưu trữ'],
    [{ canPublish: false }, 'Bạn không có quyền đăng sản phẩm lên gian hàng'],
    [{ missingCount: 3 }, 'Còn thiếu 3 mục để đăng'],
    [{ dirty: true }, 'Lưu thay đổi trước rồi mới đăng'],
  ])('%o → %s', (patch, reason) => expect(publishBlocker({ ...ok, ...patch })).toBe(reason));
});
