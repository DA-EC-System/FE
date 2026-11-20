import { describe, expect, it } from 'vitest';
import type { ListingRow, PlatformAttribute } from '@/types/shop';
import {
  applyCategoryError,
  attributeGroup,
  categoryDrift,
  categoryPollDelay,
  CATEGORY_POLL_MAX_MS,
  CATEGORY_POLL_MS,
  columnParents,
  groupAttributes,
  hasCondition,
  inputSummary,
  isPlatformTab,
  parentPath,
  pathSegments,
} from './platformCategory';

const attr = (over: Partial<PlatformAttribute>): PlatformAttribute => ({
  code: 'x',
  label: 'X',
  kind: 'property',
  input: 'text',
  options: [],
  allowCustom: true,
  required: false,
  requiredWhen: null,
  isKey: false,
  tier: 'category',
  defaultValue: null,
  ...over,
});

describe('Nhóm attribute của leaf (commerio-backend#400)', () => {
  it('trục phân loại trước, rồi tier, rồi mức bắt buộc', () => {
    expect(attributeGroup(attr({ kind: 'sales', required: true }))).toBe('sales');
    expect(attributeGroup(attr({ tier: 'company', required: true }))).toBe('company');
    expect(attributeGroup(attr({ tier: 'product' }))).toBe('product');
    expect(attributeGroup(attr({ required: true, isKey: true }))).toBe('required');
    expect(attributeGroup(attr({ requiredWhen: [{ code: '101734', optionIds: ['1'] }] }))).toBe('conditional');
    expect(attributeGroup(attr({ isKey: true }))).toBe('key');
    expect(attributeGroup(attr({}))).toBe('optional');
  });

  it('bỏ nhóm rỗng, giữ thứ tự nhóm', () => {
    const groups = groupAttributes([attr({ code: 'o' }), attr({ code: 'r', required: true }), attr({ code: 's', kind: 'sales' })]);
    expect(groups.map((g) => [g.key, g.items.map((a) => a.code)])).toEqual([
      ['sales', ['s']],
      ['required', ['r']],
      ['optional', ['o']],
    ]);
  });

  it('điều kiện rỗng không tính là bắt buộc theo điều kiện', () => {
    expect(hasCondition({ requiredWhen: null })).toBe(false);
    expect(hasCondition({ requiredWhen: [] })).toBe(false);
    expect(hasCondition({ requiredWhen: [{ code: '101734', optionIds: ['1'] }] })).toBe(true);
  });
});

describe('Mô tả ô nhập', () => {
  it('nêu số lựa chọn và có cho giá trị riêng không', () => {
    const options = [
      { id: '1', label: 'Đỏ' },
      { id: '2', label: 'Xanh' },
    ];
    expect(inputSummary({ input: 'select', options, allowCustom: true })).toBe('Chọn một · 2 lựa chọn · cho nhập giá trị riêng');
    expect(inputSummary({ input: 'multiselect', options, allowCustom: false })).toBe('Chọn nhiều · 2 lựa chọn');
    expect(inputSummary({ input: 'text', options: [], allowCustom: true })).toBe('Nhập chữ');
  });

  it('tab sàn, đường dẫn cha', () => {
    expect(isPlatformTab('lazada')).toBe(true);
    expect(isPlatformTab('shopee')).toBe(false);
    expect(parentPath('Thời trang nam > Áo > Áo thun')).toBe('Thời trang nam > Áo');
    expect(parentPath('Gốc')).toBe('');
  });
});

describe('đường dẫn và cột category (commerio-backend#467)', () => {
  it('tách đường dẫn thành các cấp', () => {
    expect(pathSegments('A > B > C')).toEqual(['A', 'B', 'C']);
    expect(pathSegments('')).toEqual([]);
  });

  it('cột cần mở: gốc rồi các tổ tiên, không mở cột cho category cấp cuối', () => {
    expect(columnParents(['1', '2', '3'])).toEqual([null, '1', '2']);
    expect(columnParents(['1'])).toEqual([null]);
    expect(columnParents([])).toEqual([null]);
  });
});

const row = (over: {
  shop?: string;
  product?: string;
  status?: string;
  path?: string | null;
  id?: string | null;
  source?: 'app' | 'platform';
  change?: 'queued' | 'failed' | 'mismatch' | null;
}) =>
  ({
    shopId: over.shop ?? 's1',
    row: {
      variantId: `v-${Math.random()}`,
      externalCategoryPath: over.path === undefined ? 'Áo > Áo thun' : over.path,
      externalCategoryId: over.id === undefined ? 'c-thun' : over.id,
      categoryChange: over.change ? { status: over.change } : null,
      listing: {
        externalProductId: over.product === undefined ? 'p1' : over.product,
        status: over.status ?? 'live',
        contentSource: over.source ?? 'app',
        categoryChange: over.change ? { status: over.change } : null,
      },
    } as unknown as ListingRow,
  }) as { shopId: string; row: ListingRow };

const SPEC = { id: 'c-crop', path: 'Áo > Áo croptop' };

describe('categoryDrift', () => {
  it('gom SKU cùng sản phẩm sàn, chỉ lấy live/hidden có mã sàn và đường dẫn khác spec', () => {
    const drift = categoryDrift(
      [
        row({}),
        row({ status: 'hidden' }),
        row({ product: 'p2', status: 'hidden' }),
        row({ product: 'p3', status: 'delisted' }),
        row({ product: null as unknown as string }),
        row({ product: 'p4', path: 'Áo > Áo croptop', id: 'c-crop' }),
        row({ product: 'p5', path: null, id: null }),
      ],
      SPEC,
    );
    expect(drift.map((d) => d.externalProductId)).toEqual(['p1', 'p2']);
    expect(drift[0]).toMatchObject({ status: 'live', fromPath: 'Áo > Áo thun', platformOwned: false });
    expect(drift[0]!.rows).toHaveLength(2);
    expect(drift[1]!.status).toBe('hidden');
  });

  it('đánh dấu sản phẩm người bán tự đăng (chỉ CEO đổi được)', () => {
    const drift = categoryDrift([row({ source: 'platform' })], SPEC);
    expect(drift[0]!.platformOwned).toBe(true);
  });

  it('cùng category thì không lệch', () => {
    expect(categoryDrift([row({})], { id: 'c-thun', path: 'Áo > Áo thun' })).toEqual([]);
  });

  it('id khác mà đường dẫn null vẫn là lệch', () => {
    const drift = categoryDrift([row({ path: null })], SPEC);
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatchObject({ fromPath: null, fromId: 'c-thun' });
  });

  it('cùng id thì không lệch dù đường dẫn khác chữ', () => {
    expect(categoryDrift([row({ path: 'Khác > Chữ', id: 'c-crop' })], SPEC)).toEqual([]);
  });

  it('không có id thì so đường dẫn', () => {
    expect(categoryDrift([row({ id: null })], SPEC)).toHaveLength(1);
    expect(categoryDrift([row({ id: null, path: 'Áo > Áo croptop' })], SPEC)).toEqual([]);
  });
});

describe('categoryPollDelay', () => {
  const queued = [row({ change: 'queued' }).row];
  it('hỏi lại mỗi 5 giây khi còn queued, dừng sau 30 phút', () => {
    expect(categoryPollDelay(queued, 0, 1000)).toBe(CATEGORY_POLL_MS);
    expect(categoryPollDelay(queued, 0, CATEGORY_POLL_MAX_MS)).toBe(false);
  });
  it('failed, mismatch không hỏi lại', () => {
    expect(categoryPollDelay([row({ change: 'failed' }).row, row({ change: 'mismatch' }).row], 0, 1000)).toBe(false);
  });
});

describe('applyCategoryError', () => {
  it('có câu cho từng mã của apply-category', () => {
    for (const code of ['category_unmapped', 'spec_incomplete', 'version_conflict', 'category_in_sync', 'size_chart_missing', 'category_change_in_progress', 'shared_remote_product', 'forbidden', 'marketplace_unsupported']) {
      expect(applyCategoryError(code, 'TikTok Shop')).toBeTruthy();
    }
    expect(applyCategoryError('forbidden', 'TikTok Shop')).toBe('Chỉ CEO đổi được category của sản phẩm người bán tự đăng trên sàn');
    expect(applyCategoryError('lạ', 'TikTok Shop')).toBeNull();
  });
});
