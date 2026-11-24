import { describe, expect, it } from 'vitest';
import type { RemoteProduct, RemoteSkuRow, SetupDraft } from '@/types/setupDraft';
import {
  changedNotice,
  confirmedSteps,
  filterGroupRows,
  finishSummary,
  groupCounts,
  groupRows,
  setupIssues,
  stockRows,
  stockTotals,
  suggestedGroupsToWrite,
} from './setupDraft';

const draft = (over: Partial<SetupDraft> = {}): SetupDraft => ({
  decisions: [],
  createGroups: [],
  openingStock: null,
  returnWindowDays: null,
  baseline: null,
  confirmed: { link_skus: null, assign_groups: null, stock_sync: null },
  ...over,
});

const sku = (id: string, over: Partial<RemoteSkuRow> = {}): RemoteSkuRow => ({
  externalSkuId: id,
  sellerSku: id.toUpperCase(),
  title: `Sản phẩm ${id}`,
  variantLabel: null,
  platformStock: 0,
  available: null,
  matchedVariantId: null,
  canCreate: true,
  cannotCreateReason: null,
  decision: null,
  ...over,
});

const product = (id: string, skus: RemoteSkuRow[], suggestedGroupId: string | null = null): RemoteProduct => ({
  externalProductId: id,
  title: `SP ${id}`,
  titleEn: null,
  imageUrl: null,
  externalCategoryId: null,
  suggestedGroupId,
  skus,
});

const create = { action: 'create' as const, variantId: null, groupId: null };

describe('confirmedSteps, changedNotice', () => {
  it('đọc mốc xác nhận', () => {
    expect(confirmedSteps(null)).toEqual({ link_skus: false, assign_groups: false, stock_sync: false });
    expect(confirmedSteps(draft({ confirmed: { link_skus: '2026-11-24T10:00:00Z', assign_groups: null, stock_sync: null } }))).toEqual({
      link_skus: true,
      assign_groups: false,
      stock_sync: false,
    });
  });

  it('báo SKU sàn đổi, null khi không đổi', () => {
    expect(changedNotice(draft({ changed: null }))).toBeNull();
    expect(changedNotice(draft({ changed: { added: ['a', 'b'], removed: [] } }))).toBe(
      'Sàn có 2 SKU mới; kiểm lại bước Liên kết SKU sàn.',
    );
    expect(changedNotice(draft({ changed: { added: ['a'], removed: ['x'] } }))).toBe(
      'Sàn có 1 SKU mới, 1 SKU đã xoá; kiểm lại bước Liên kết SKU sàn.',
    );
  });
});

describe('bước 4: danh mục', () => {
  const products = [
    product('p1', [sku('a', { decision: create }), sku('b', { decision: create })], 'g-sug'),
    product('p2', [sku('c', { decision: create })], 'g-sug2'),
    product('p3', [sku('d', { decision: create })]),
    product('p4', [sku('e', { decision: { action: 'link', variantId: 'v1', groupId: null } })]),
  ];

  it('chỉ sản phẩm có dòng create, nguồn danh mục đúng', () => {
    const rows = groupRows(products, draft({ createGroups: [{ externalProductId: 'p2', groupId: 'g-mine' }] }));
    expect(rows.map((r) => [r.externalProductId, r.createCount, r.source])).toEqual([
      ['p1', 2, 'none'],
      ['p2', 1, 'user'],
      ['p3', 1, 'none'],
    ]);
  });

  it('gợi ý chỉ ghi cho dòng chưa có danh mục, không đè lựa chọn', () => {
    const rows = groupRows(products, draft({ createGroups: [{ externalProductId: 'p2', groupId: 'g-mine' }] }));
    expect(suggestedGroupsToWrite(rows)).toEqual([{ externalProductId: 'p1', groupId: 'g-sug' }]);
    const after = groupRows(products, draft({ createGroups: [{ externalProductId: 'p1', groupId: 'g-sug' }] }));
    expect(after[0].source).toBe('suggested');
    expect(suggestedGroupsToWrite(after)).toEqual([{ externalProductId: 'p2', groupId: 'g-sug2' }]);
  });

  it('lọc và đếm', () => {
    const rows = groupRows(
      products,
      draft({
        createGroups: [
          { externalProductId: 'p1', groupId: 'g-sug' },
          { externalProductId: 'p2', groupId: 'g-mine' },
        ],
      }),
    );
    expect(groupCounts(rows)).toEqual({ all: 3, missing: 1, suggested: 1, user: 1 });
    expect(filterGroupRows(rows, 'missing').map((r) => r.externalProductId)).toEqual(['p3']);
  });
});

describe('bước 5: xem trước tồn', () => {
  const skus = [
    sku('a', { platformStock: 5, available: 5, decision: { action: 'link', variantId: 'v', groupId: null } }),
    sku('b', { platformStock: 3, available: 1, decision: { action: 'link', variantId: 'v2', groupId: null } }),
    sku('c', { platformStock: 4, available: null, decision: create }),
    sku('d', { platformStock: 9, decision: { action: 'skip', variantId: null, groupId: null } }),
    sku('e', { platformStock: 2 }),
  ];

  it('chỉ dòng link, create; create tính 0', () => {
    const rows = stockRows(skus);
    expect(rows.map((r) => [r.externalSkuId, r.available, r.drift])).toEqual([
      ['a', 5, false],
      ['b', 1, true],
      ['c', 0, true],
    ]);
  });

  it('tổng', () => {
    expect(stockTotals(stockRows(skus))).toEqual({ drifted: 2, matched: 1, platformTotal: 12, availableTotal: 6 });
  });
});

describe('bước 6: lỗi hoàn tất, tóm tắt', () => {
  const d = draft({
    decisions: [
      { externalSkuId: 'a', action: 'create', variantId: null },
      { externalSkuId: 'b', action: 'link', variantId: 'v' },
      { externalSkuId: 'c', action: 'unmanaged', variantId: null },
    ],
    createGroups: [{ externalProductId: 'p1', groupId: 'g' }],
  });

  it('đổi khoá lỗi thành bước và dòng', () => {
    expect(
      setupIssues(
        {
          errors: {
            'decisions.1': 'SKU kho đã liên kết SKU sàn khác',
            'createGroups.0': 'Danh mục đã bị ẩn',
            returnWindowDays: 'Từ 1 tới 60 ngày',
          },
        },
        d,
      ),
    ).toEqual([
      { step: 'link_skus', rowKey: 'b', message: 'SKU kho đã liên kết SKU sàn khác' },
      { step: 'assign_groups', rowKey: 'p1', message: 'Danh mục đã bị ẩn' },
      { step: 'stock_sync', rowKey: null, message: 'Từ 1 tới 60 ngày' },
    ]);
  });

  it('409 setup_draft_incomplete theo missing', () => {
    expect(setupIssues({ code: 'setup_draft_incomplete', missing: ['assign_groups', 'unknown'] }, d)).toEqual([
      { step: 'assign_groups', rowKey: null, message: 'Bước này chưa xác nhận. Mở lại rồi bấm Tiếp.' },
    ]);
    expect(setupIssues(undefined, d)).toEqual([]);
  });

  it('đếm việc sẽ làm', () => {
    expect(finishSummary(d)).toEqual({ productsToCreate: 1, skusToCreate: 1, skusToLink: 2, unmanaged: 1 });
    expect(finishSummary(null)).toEqual({ productsToCreate: 0, skusToCreate: 0, skusToLink: 0, unmanaged: 0 });
  });
});
