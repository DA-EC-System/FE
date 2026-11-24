import type { CannotCreateReason, OpeningStockMode } from './shop';

/**
 * Kiểu của bản nháp thiết lập gian hàng và danh sách SKU sàn gom theo sản phẩm sàn (Documents/21 §18.7.5 "Bản nháp
 * thiết lập", §18.12). Để file riêng, không trộn vào `shop.ts`, vì danh sách Liên kết SKU (FE#460) cũng dùng
 * `RemoteProduct`, `RemoteSkuRow`.
 */

/** Phần tử quyết định cho một SKU sàn (§18.7.5); `variantId` chỉ khác null khi `link` */
export type DecisionAction = 'link' | 'create' | 'skip' | 'unmanaged';
export interface Decision {
  externalSkuId: string;
  action: DecisionAction;
  variantId: string | null;
}

/** Danh mục sản phẩm cho sản phẩm cha sắp tạo từ một sản phẩm sàn */
export interface CreateGroup {
  externalProductId: string;
  groupId: string;
}

/** Ba bước wizard ghi vào nháp, theo thứ tự; đổi dữ liệu một bước thì BE xoá mốc của bước đó và các bước sau */
export const DRAFT_STEPS = ['link_skus', 'assign_groups', 'stock_sync'] as const;
export type DraftStep = (typeof DRAFT_STEPS)[number];

export interface SetupDraft {
  decisions: Decision[];
  createGroups: CreateGroup[];
  openingStock: OpeningStockMode | null;
  returnWindowDays: number | null;
  /** Tập SKU sàn lúc xác nhận `link_skus`; null khi chưa xác nhận */
  baseline: string[] | null;
  /** Mốc ISO lúc xác nhận từng bước; null là chưa xác nhận */
  confirmed: Record<DraftStep, string | null>;
  /** SKU sàn đổi so với `baseline` (chỉ có ở GET /setup); null khi không khác hoặc chưa có baseline */
  changed?: { removed: string[]; added: string[] } | null;
}

/** GET /channel/shops/:id/setup sau khi có nháp (§18.7.5): bỏ `suggestions`, `unmatchedRemote`, `nameMatchSkipped` */
export interface ShopSetupDraftView {
  proposedCutoffAt: string;
  firstShopOfCompany: boolean;
  draft: SetupDraft | null;
  /** `setup_draft_version`; gửi kèm mọi lần ghi nháp và lúc hoàn tất */
  draftVersion: number;
}

/** PUT /channel/shops/:id/setup/draft */
export interface SetupDraftInput {
  openingStock?: OpeningStockMode;
  returnWindowDays?: number;
  confirm?: DraftStep;
  draftVersion: number;
}

export interface SetupDraftSaved {
  draft: SetupDraft;
  draftVersion: number;
}

/** Lựa chọn của một SKU trong nháp, trả kèm dòng SKU sàn khi gian hàng `connecting` (§18.12) */
export interface RowDecision {
  action: DecisionAction;
  variantId: string | null;
  groupId: string | null;
}

/** Một SKU sàn trong `GET remote-products` (§18.12); chỉ các trường wizard đọc */
export interface RemoteSkuRow {
  externalSkuId: string;
  sellerSku: string | null;
  title: string;
  variantLabel: string | null;
  platformStock: number;
  /** Có thể bán ở Commerio của biến thể dòng đang trỏ tới; dòng `create` là null (FE tính 0) */
  available: number | null;
  matchedVariantId: string | null;
  canCreate: boolean;
  cannotCreateReason: CannotCreateReason | null;
  decision: RowDecision | null;
}

export interface RemoteProduct {
  externalProductId: string;
  title: string;
  titleEn: string | null;
  imageUrl: string | null;
  externalCategoryId: string | null;
  /** Danh mục gợi ý qua bảng ánh xạ category sàn; null khi không ánh xạ được hoặc cây chưa có */
  suggestedGroupId: string | null;
  skus: RemoteSkuRow[];
}

export type RemoteProductStatus = 'unlinked' | 'linked' | 'pending' | 'all';
export type DecisionFilter = DecisionAction | 'none';

export interface RemoteProductList {
  items: RemoteProduct[];
  /** Số sản phẩm sàn khớp lọc */
  total: number;
  page: number;
  pageSize: number;
  counts: { unlinked: number; linked: number; pending: number };
  syncedAt: string | null;
}

/** POST /channel/shops/:id/sku-links khi gian hàng `connecting` (ghi nháp) */
export interface SkuLinkDraftResult {
  draft: SetupDraft;
  draftVersion: number;
  results: { externalSkuId: string; result: 'saved' | 'error'; code: string | null; message: string | null }[];
}

/** GET /channel/shops/:id/category-sync (§18.5) */
export interface CategorySyncState {
  tree: {
    state: 'ready' | 'queued' | 'running' | 'failed' | 'unsupported';
    syncedAt: string | null;
    leafCount: number;
    error: string | null;
  };
  permissions: {
    state: 'ready' | 'queued' | 'running' | 'failed';
    checkedAt: string | null;
    availableCount: number;
    error: string | null;
  } | null;
}

/** POST /channel/shops/:id/setup { draftVersion } */
export interface FinishSetupInput {
  draftVersion: number;
}
