import type { CreateGroup, DraftStep, RemoteProduct, RemoteSkuRow, SetupDraft } from '@/types/setupDraft';
import { DRAFT_STEPS } from '@/types/setupDraft';

/**
 * Hàm thuần cho bước 4–6 của thiết lập gian hàng ghi qua bản nháp (Documents/21 §18.7.5 "Bản nháp thiết lập", §18.12).
 * Dùng chung cho wizard onboarding và trang `/channel/shops/:id/setup`.
 */

/** Bước nào đã xác nhận (BE đặt mốc khi bấm Tiếp; đổi dữ liệu thì xoá mốc của bước đó và các bước sau) */
export function confirmedSteps(draft: SetupDraft | null): Record<DraftStep, boolean> {
  return Object.fromEntries(DRAFT_STEPS.map((s) => [s, Boolean(draft?.confirmed[s])])) as Record<DraftStep, boolean>;
}

/** Câu báo khi SKU trên sàn đổi so với lúc xác nhận bước Liên kết SKU sàn (`draft.changed`); null khi không đổi */
export function changedNotice(draft: SetupDraft | null): string | null {
  const c = draft?.changed;
  if (!c || (!c.added.length && !c.removed.length)) return null;
  const parts = [c.added.length ? `${c.added.length} SKU mới` : null, c.removed.length ? `${c.removed.length} SKU đã xoá` : null];
  return `Sàn có ${parts.filter(Boolean).join(', ')}; kiểm lại bước Liên kết SKU sàn.`;
}

// ---------- Bước 4: Danh mục sản phẩm ----------

/** user: người dùng chọn khác gợi ý; suggested: đang dùng danh mục gợi ý; none: chưa có danh mục */
export type GroupSource = 'user' | 'suggested' | 'none';

export interface GroupRow {
  externalProductId: string;
  title: string;
  /** Số SKU của sản phẩm sàn sẽ tạo thành biến thể */
  createCount: number;
  externalCategoryId: string | null;
  /** undefined: BE chưa trả trường này */
  externalCategoryPath?: string | null;
  groupId: string | null;
  suggestedGroupId: string | null;
  source: GroupSource;
}

const isCreate = (s: RemoteSkuRow) => s.decision?.action === 'create';

/** Dòng bước 4: sản phẩm sàn có ít nhất một SKU `create`; danh mục lấy từ nháp (`createGroups`) */
export function groupRows(products: RemoteProduct[], draft: SetupDraft | null): GroupRow[] {
  const chosen = new Map((draft?.createGroups ?? []).map((g) => [g.externalProductId, g.groupId]));
  return products
    .filter((p) => p.skus.some(isCreate))
    .map((p) => {
      const groupId = chosen.get(p.externalProductId) ?? null;
      const source: GroupSource = !groupId ? 'none' : groupId === p.suggestedGroupId ? 'suggested' : 'user';
      return {
        externalProductId: p.externalProductId,
        title: p.title,
        createCount: p.skus.filter(isCreate).length,
        externalCategoryId: p.externalCategoryId,
        externalCategoryPath: p.externalCategoryPath,
        groupId,
        suggestedGroupId: p.suggestedGroupId,
        source,
      };
    });
}

/**
 * Danh mục gợi ý cần ghi vào nháp khi mở bước 4: chỉ sản phẩm chưa có danh mục trong nháp mà BE có gợi ý. Không bao giờ
 * đè danh mục đã có (người dùng đã chọn, hoặc đã áp gợi ý lần trước).
 */
export function suggestedGroupsToWrite(rows: GroupRow[]): CreateGroup[] {
  return rows
    .filter((r) => r.source === 'none' && r.suggestedGroupId)
    .map((r) => ({ externalProductId: r.externalProductId, groupId: r.suggestedGroupId! }));
}

export type GroupFilter = 'all' | 'missing' | 'suggested' | 'user';

export function filterGroupRows(rows: GroupRow[], filter: GroupFilter): GroupRow[] {
  if (filter === 'missing') return rows.filter((r) => r.source === 'none');
  if (filter === 'suggested') return rows.filter((r) => r.source === 'suggested');
  if (filter === 'user') return rows.filter((r) => r.source === 'user');
  return rows;
}

export function groupCounts(rows: GroupRow[]): Record<GroupFilter, number> {
  return {
    all: rows.length,
    missing: rows.filter((r) => r.source === 'none').length,
    suggested: rows.filter((r) => r.source === 'suggested').length,
    user: rows.filter((r) => r.source === 'user').length,
  };
}

// ---------- Bước 5: Đồng bộ tồn lần đầu ----------

export interface StockRow {
  externalSkuId: string;
  label: string;
  sellerSku: string | null;
  platformStock: number;
  /** Có thể bán ở Commerio; dòng `create` là 0 (SKU kho mới chưa có tồn) */
  available: number;
  drift: boolean;
}

/**
 * Dòng xem trước tồn cho SKU có quyết định `link` hoặc `create` (§18.7.5 "Xem trước tồn"). Gian hàng đầu tiên chỉ kiểm
 * kê đầu kỳ nên sàn giữ `platformStock`; lệch là tồn trên sàn khác có thể bán.
 */
export function stockRows(skus: RemoteSkuRow[]): StockRow[] {
  return skus
    .filter((s) => s.decision?.action === 'link' || s.decision?.action === 'create')
    .map((s) => {
      const available = s.decision?.action === 'create' ? 0 : (s.available ?? 0);
      return {
        externalSkuId: s.externalSkuId,
        label: s.variantLabel ?? s.title,
        sellerSku: s.sellerSku,
        platformStock: s.platformStock,
        available,
        drift: s.platformStock !== available,
      };
    });
}

/** Tổng của bước 5. Nguồn tổng để sau một giao diện (FE đọc hết trang, hoặc BE trả sẵn; chờ Thành chốt) */
export interface StockTotals {
  drifted: number;
  matched: number;
  platformTotal: number;
  availableTotal: number;
}

export function stockTotals(rows: StockRow[]): StockTotals {
  return rows.reduce<StockTotals>(
    (t, r) => ({
      drifted: t.drifted + (r.drift ? 1 : 0),
      matched: t.matched + (r.drift ? 0 : 1),
      platformTotal: t.platformTotal + r.platformStock,
      availableTotal: t.availableTotal + r.available,
    }),
    { drifted: 0, matched: 0, platformTotal: 0, availableTotal: 0 },
  );
}

// ---------- Bước 6: Hoàn tất ----------

/** Bước wizard chứa ô lỗi; `order_cutoff` là bước 6 (lỗi chung lúc hoàn tất) */
export type SetupStepKey = DraftStep | 'order_cutoff';

/** Tên bước để báo lỗi hoàn tất */
export const SETUP_STEP_NAMES: Record<SetupStepKey, string> = {
  link_skus: 'Bước 3 Liên kết SKU sàn',
  assign_groups: 'Bước 4 Danh mục sản phẩm',
  stock_sync: 'Bước 5 Đồng bộ tồn lần đầu',
  order_cutoff: 'Bước 6 Đồng bộ đơn từ thời điểm nào',
};

export interface SetupIssue {
  step: SetupStepKey;
  /** `externalSkuId` (bước 3) hoặc `externalProductId` (bước 4); null khi lỗi cả bước */
  rowKey: string | null;
  message: string;
}

const MISSING_STEP: Record<string, SetupStepKey> = {
  link_skus: 'link_skus',
  assign_groups: 'assign_groups',
  stock_sync: 'stock_sync',
};

/**
 * Đổi lỗi của `POST /setup` hoặc `PUT /setup/draft { confirm }` thành danh sách chỗ sửa (§18.7.5): 422
 * `errors["decisions.<i>"]` là dòng thứ i của `draft.decisions`, `errors["createGroups.<i>"]` là phần tử thứ i của
 * `draft.createGroups`; 409 `setup_draft_incomplete` kèm `missing` là bước chưa xác nhận.
 */
export function setupIssues(
  problem: { code?: string; errors?: Record<string, string>; missing?: string[] } | undefined,
  draft: SetupDraft | null,
): SetupIssue[] {
  if (!problem) return [];
  const issues: SetupIssue[] = [];
  if (problem.code === 'setup_draft_incomplete') {
    for (const m of problem.missing ?? []) {
      const step = MISSING_STEP[m];
      if (step) issues.push({ step, rowKey: null, message: 'Bước này chưa xác nhận. Mở lại rồi bấm Tiếp.' });
    }
  }
  for (const [key, message] of Object.entries(problem.errors ?? {})) {
    const dec = /^decisions\.(\d+)/.exec(key);
    const grp = /^createGroups\.(\d+)/.exec(key);
    if (dec) {
      issues.push({ step: 'link_skus', rowKey: draft?.decisions[Number(dec[1])]?.externalSkuId ?? null, message });
    } else if (grp) {
      issues.push({ step: 'assign_groups', rowKey: draft?.createGroups[Number(grp[1])]?.externalProductId ?? null, message });
    } else if (key === 'decisions') {
      issues.push({ step: 'link_skus', rowKey: null, message });
    } else if (key === 'createGroups') {
      issues.push({ step: 'assign_groups', rowKey: null, message });
    } else if (key === 'openingStock') {
      issues.push({ step: 'stock_sync', rowKey: null, message });
    } else if (key === 'returnWindowDays') {
      // Ô Hạn trả hàng nằm ở bước 5 (dữ liệu của `stock_sync`, §18.7.5; Thành duyệt 24/11/2026)
      issues.push({ step: 'stock_sync', rowKey: null, message });
    }
  }
  return issues;
}

/** Ba việc "Bấm Hoàn tất, Commerio sẽ" (design v2.html s6), đếm từ nháp */
export interface FinishSummary {
  /** Sản phẩm sẽ tạo (mỗi sản phẩm sàn có dòng `create` một sản phẩm) */
  productsToCreate: number;
  skusToCreate: number;
  /** SKU sàn sẽ liên kết, gồm cả SKU tạo mới */
  skusToLink: number;
  unmanaged: number;
}

export function finishSummary(draft: SetupDraft | null): FinishSummary {
  const d = draft?.decisions ?? [];
  const skusToCreate = d.filter((x) => x.action === 'create').length;
  return {
    productsToCreate: draft?.createGroups.length ?? 0,
    skusToCreate,
    skusToLink: skusToCreate + d.filter((x) => x.action === 'link').length,
    unmanaged: d.filter((x) => x.action === 'unmanaged').length,
  };
}
