import type { CannotCreateReason, OpeningStockMode, PendingMapping, RemoteSkusRefresh } from './shop';

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

/**
 * Gợi ý SKU kho cho một SKU sàn chưa liên kết (§18.12): trùng SKU người bán là `high` (`score` null), giống tên từ 0,7 là
 * `medium`, còn lại `low`. Gợi ý theo tên chỉ là gợi ý, FE không chọn sẵn; "Chấp nhận gợi ý chắc chắn" chỉ gom `high`
 */
export interface SkuLinkSuggestion {
  variantId: string;
  sku: string;
  productName: string;
  match: 'sku' | 'name';
  score: number | null;
  confidence: 'high' | 'medium' | 'low';
}

/** Một SKU sàn trong `GET remote-products` (§18.12) */
export interface RemoteSkuRow {
  externalSkuId: string;
  sellerSku: string | null;
  title: string;
  /** Nhãn biến thể sàn trả ("Đỏ, M"); null khi sàn không có */
  variantLabel: string | null;
  platformStock: number;
  /** Có thể bán ở Commerio của biến thể dòng đang trỏ tới; dòng `create` là null (FE tính 0) */
  available: number | null;
  matchedVariantId: string | null;
  /** Ghép đang có hiệu lực; null khi chưa ghép. Vắng ở dữ liệu cũ */
  mode?: 'mapped' | 'unmanaged' | null;
  /** Yêu cầu liên kết chờ CEO duyệt, cùng hình `ChannelListing.pendingMapping` */
  pendingMapping?: PendingMapping | null;
  /** Chỉ SKU chưa liên kết của trang đang trả mới có */
  suggestion?: SkuLinkSuggestion | null;
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
  /**
   * Đường dẫn category trên sàn để hiện ("Thời trang nam › Áo khoác"), đọc từ cây đã đồng bộ. Chờ BE thêm ở §18.12; vắng
   * (undefined) thì FE ẩn cột "Category trên sàn", null là chưa đọc được
   */
  externalCategoryPath?: string | null;
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
  /** Lượt tải SKU sàn chạy nền, cùng nghĩa `GET remote-skus` (BE#361); FE hỏi lại tới khi khác `running` */
  refresh?: RemoteSkusRefresh | null;
  /** Gian hàng quá nhiều SKU nên BE chỉ gợi ý theo SKU (§18.7.5) */
  nameMatchSkipped?: boolean;
  /**
   * Số SKU khớp cả bộ lọc, không theo trang (§18.12, Documents#251). `create`…`none`: theo lựa chọn trong nháp, chỉ gian
   * hàng `connecting` (còn lại null). `drifted`/`matched`: SKU có `available` (dòng `create` tính 0) lệch/khớp tồn sàn.
   * Vắng khi BE chưa có trường này
   */
  totals?: {
    create: number | null;
    link: number | null;
    skip: number | null;
    unmanaged: number | null;
    none: number | null;
    drifted: number;
    matched: number;
    /** Tổng tồn trên sàn và tổng có thể bán ở Commerio của các SKU khớp bộ lọc (be#587, Documents quyết định 24); null khi không có SKU hoặc không SKU nào có `available` */
    platformStockSum?: number | null;
    availableSum?: number | null;
  };
}

/** Một dòng gửi `POST sku-links` (§18.12): cùng hình `Decision`; `variantId` chỉ khác null khi `link` */
export type SkuLinkInput = Decision;

/** Kết quả từng dòng khi gian hàng `active` (áp ngay) */
export interface SkuLinkResult {
  externalSkuId: string;
  result: 'linked' | 'pending' | 'created' | 'error';
  variantId: string | null;
  productId: string | null;
  code: string | null;
  message: string | null;
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
