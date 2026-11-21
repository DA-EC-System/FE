/**
 * Shop (Channel) types — khớp với channel.shops, channel.channel_listings trong DBML.
 * Mỗi shop là một gian hàng kết nối sàn thuộc về một company (UC-CH-01, UC-CH-02).
 * Hợp đồng API đề xuất ở FE#8, chờ commerio-backend#19 chốt.
 */

export type Marketplace = string;

/**
 * Khác biệt giữa các sàn (Documents/21 §18.6.3). FE rẽ nhánh theo các trường này, không theo mã sàn.
 * splitLevel: sàn tách đơn tới đâu (unit: từng món, sku: theo SKU, none: không tách).
 * returnWindow: hạn đổi trả tính theo số ngày người bán đặt (days) hay theo trạng thái sàn báo (platform_status).
 */
export interface ShopCapabilities {
  listingReview: boolean;
  hideBy: 'deactivate' | 'zero_stock';
  splitLevel: 'unit' | 'sku' | 'none';
  returnWindow: 'days' | 'platform_status';
}

/** Sàn được BE công bố theo adapter và cấu hình (Documents/21 §18.1). */
export interface ShopPlatform {
  platform: string;
  name: string;
  connectable: boolean;
  capabilities: ShopCapabilities;
  /** Cách kết nối sàn cho phép; rỗng khi connectable = false. BE cũ chưa trả thì coi như chỉ có oauth */
  methods?: ShopConnectMethod[];
  /** Câu cho người đọc khi connectable = false; null khi kết nối được (§18.7.3) */
  reason?: string | null;
}

/** oauth: đăng nhập sàn rồi đồng ý cấp quyền; token: dán token lấy ở trang nhà phát triển của sàn (shop thử) */
export type ShopConnectMethod = 'oauth' | 'token';

export interface ShopList { items: Shop[] }
export interface ShopPlatformList { items: ShopPlatform[] }

/**
 * Sơ đồ Gian hàng (C1, FE#58): connecting (đã uỷ quyền, đang chạy thiết lập lần đầu) → active;
 * active → needs_reauth khi sàn thu hồi quyền hoặc token hết hạn; → disconnected khi người dùng ngắt.
 */
export type ShopStatus = 'connecting' | 'active' | 'needs_reauth' | 'disconnected';

export type ShopAction = 'finish_setup' | 'lose_auth' | 'reconnect' | 'disconnect' | 'resume_setup';

export interface Shop {
  id: string;
  companyId: string;
  platform: Marketplace;
  platformName?: string;
  capabilities: ShopCapabilities;
  authExpiresAt?: string | null;
  tokenExpiringSoon: boolean;
  externalShopId: string;
  shopName: string;
  region: string | null;
  status: ShopStatus;
  /** Hạn của access token sàn; null khi đã ngắt. BE tự làm mới khi còn dưới 24 giờ */
  accessExpiresAt: string | null;
  /** Hạn của refresh token: quá hạn thì chỉ người dùng kết nối lại được. Null khi đã ngắt hoặc sàn giả lập (§18.4) */
  refreshExpiresAt: string | null;
  lastOrderSyncAt?: string;
  /** Mốc kéo đơn đặt ở thiết lập lần đầu: chỉ kéo đơn tạo từ mốc này */
  orderCutoffAt: string | null;
  /** Việc đang chờ trong hàng đợi vì chưa gọi được sàn (đẩy tồn, đẩy giá, ẩn listing) */
  pendingJobs: number;
  /** Số biến thể đã ghép SKU sàn */
  listingCount: number;
  /** Đơn tạo trong 7 ngày gần nhất (§18.7.1). BE chưa trả thì vắng, FE hiện "—" */
  orders7d?: number;
  /** Đơn chưa completed hoặc cancelled: còn thì không ngắt được (§18.7.1) */
  pendingOrderCount?: number;
  /** Lần đổi status gần nhất; chưa đổi lần nào thì bằng createdAt (§18.7.1) */
  statusChangedAt?: string;
  /** Số phiên bản cấu hình phí đang áp; null tới khi có BE#230 (§18.7.1) */
  feeConfigVersion?: number | null;
  /** Tiến độ thiết lập lần đầu; null khi thiết lập trước BE#198 hoặc mọi bước xong quá 24 giờ (§18.7.7) */
  setup: ShopSetupProgress | null;
  /** Số ngày đổi trả đặt ở thiết lập; null khi sàn tự báo hạn (capabilities.returnWindow = platform_status) */
  returnWindowDays: number | null;
  /** Số listing có `categoryChange` failed hoặc mismatch (BE chưa trả thì vắng): điều kiện thứ sáu của Cần xử lý (§18.7.2, commerio-backend#467) */
  categoryChangeIssues?: number;
  /**
   * Phiếu kiểm kê đầu kỳ; khác null là gian hàng còn chờ kiểm kê, trang gian hàng hiện banner dẫn tới phiếu (§18.6.2).
   * Phiếu rejected, cancelled giữ tới khi lập lại phiếu (§18.6.11)
   */
  openingStocktake: ShopOpeningStocktake | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** allocate: chia hàng sau khi phiếu kiểm kê đầu kỳ ghi sổ, chỉ có khi chọn kiểm kê (§18.6.11, §18.7.7) */
export type ShopSetupStepKey = 'match' | 'opening_stock' | 'open_orders' | 'allocate' | 'push_stock';
/** pending: chờ người làm; running: việc nền đang chạy */
export type ShopSetupStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'blocked';

export interface ShopSetupStep {
  key: ShopSetupStepKey;
  status: ShopSetupStepStatus;
  /** Khoá bước đang chặn (opening_stock, open_orders, allocate) hoặc mã issue chưa làm (§18.7.9); null khi không blocked */
  blockedBy: string | null;
}

export interface ShopSetupProgress {
  /** opening_stock, allocate chỉ có khi chọn kiểm kê đầu kỳ */
  steps: ShopSetupStep[];
  /** SKU sàn chưa ghép sau thiết lập, gồm SKU người dùng bỏ qua */
  unmatchedCount: number;
  /**
   * Số đơn còn mở đặt trước mốc không kéo về vì vượt trần OPEN_ORDER_PULL_MAX của môi trường; 0 khi không cắt
   * (commerio-backend#198). Vắng khi BE chưa lên #198
   */
  openOrdersSkipped?: number;
}

export interface ShopOpeningStocktake {
  documentId: string;
  number: string;
  /** posted chỉ thấy trong lúc BE xử lý phiếu, hoặc khi bước chốt lỗi lặp lại (§18.6.11) */
  status: 'draft' | 'pending' | 'rejected' | 'cancelled' | 'posted';
}

/** POST /channel/shops/:id/opening-stocktake (§18.6.11) */
export interface ShopOpeningStocktakeRestart {
  shop: Shop;
  stocktakeNumber: string;
}

/** Bắt đầu OAuth; shopId khi kết nối lại một gian hàng đã có */
export interface ShopConnectInput {
  platform: string;
  shopId?: string;
}

/** GET /channel/shops/:platform/authorize-url */
export interface ShopAuthorizeUrl {
  url: string;
}

export interface ShopCallbackInput {
  state: string;
  params: Record<string, string>;
}

/** POST /channel/shops/:platform/token. Có refreshToken thì BE tự gia hạn, không có thì hết hạn phải kết nối lại */
export interface ShopTokenInput {
  accessToken: string;
  refreshToken?: string;
  /**
   * Gian hàng đang kết nối lại (commerio-backend#398): token của seller khác thì 409 `shop_mismatch`, không ghi gì.
   * Không gửi khi Thêm gian hàng.
   */
  shopId?: string;
}

/**
 * POST /channel/shops/:platform/callback và /token. `shop`, `created`, `reconnect` ở gốc là của shops[0];
 * `previousStatus`, `remoteProductCount`, `remoteSkuCount` chỉ có trong từng phần tử shops[] (§18.7.4)
 */
export interface ShopCallbackResult {
  shop: Shop;
  created: boolean;
  reconnect: ShopReconnectSummary | null;
  shops: ShopConnectionResult[];
}

export interface ShopConnectionResult {
  shop: Shop;
  /** false: gian hàng đã có, chỉ cấp lại token */
  created: boolean;
  /** Có khi kết nối lại gian hàng đã có */
  reconnect: ShopReconnectSummary | null;
  /** Trạng thái ngay trước lần nối này; null khi tạo mới. BE chưa trả thì vắng */
  previousStatus?: ShopStatus | null;
  /** Số sản phẩm trên sàn lúc nối, không tính đã xoá; sàn nào cũng có. null khi sàn lỗi hoặc quá 10 giây (§18.7.4) */
  remoteProductCount?: number | null;
  /** Số phân loại (SKU của sàn) lúc nối. null khi sàn chưa cho biết: Lazada lúc nối luôn null, TikTok khi hơn 100 sản phẩm */
  remoteSkuCount?: number | null;
}

/**
 * Sơ đồ Listing (C2, FE#58). Chưa có bản ghi là `not_listed`.
 * pushing → under_review hoặc live theo capabilities.listingReview; lỗi đẩy → push_failed;
 * sàn từ chối → rejected; sàn khoá → platform_hold; SKU tạm ngừng → hidden; gỡ khỏi sàn → delisted (kết thúc).
 */
export type ListingStatus =
  | 'pushing'
  | 'under_review'
  | 'live'
  | 'push_failed'
  | 'rejected'
  | 'platform_hold'
  | 'hidden'
  | 'delisted';

export type ListingAction =
  | 'push'
  | 'go_live'
  | 'send_review'
  | 'fail'
  | 'approve'
  | 'reject'
  | 'hold'
  | 'release'
  | 'hide'
  | 'unhide'
  | 'delist'
  | 'request_review'
  | 'outside_hold'
  | 'outside_resolve'
  | 'update_content';

/**
 * Sàn đổi listing ngoài app (21 §18.3, commerio-backend#360): sàn tắt SKU (`disabled`) hoặc giá gốc trên sàn khác giá
 * app đẩy lần trước (`price_changed`). Listing giữ `hidden`, thôi đẩy tồn, chờ CEO quyết
 */
export interface OutsideChange {
  kind: 'disabled' | 'price_changed';
  /** Giá đang có trên sàn; null khi `disabled` */
  platformPrice: number | null;
  detectedAt: string;
}

/** CEO quyết thay đổi ngoài app: `restore` đẩy lại giá app và bật SKU, `accept-price` nhận giá sàn (chỉ `price_changed`) */
export type OutsideChangeAction = 'restore' | 'accept-price';

/**
 * Bản sửa nội dung chờ sàn duyệt (21 §18.3, commerio-backend#293): sửa tên, mô tả, thuộc tính mà sàn vẫn bán bản cũ
 * (TikTok). `failed` kèm lý do sàn trả. Giữ khi listing sang `hidden`, `platform_hold`; gỡ khỏi sàn thì xoá
 */
export interface PendingRevision {
  status: 'auditing' | 'failed';
  rejectReason: string | null;
  at: string;
}

/**
 * Đổi category trên sàn (`apply-category`, §18.5, commerio-backend#467): `queued` đã xếp việc; `failed` sàn từ chối;
 * `mismatch` sàn nhận nhưng đọc lại lệch SKU, giá, ảnh. Sàn nhận và không lệch thì listing về null
 */
export interface CategoryChange {
  status: 'queued' | 'failed' | 'mismatch';
  toCategoryId: string;
  toCategoryPath: string | null;
  code: string | null;
  message: string | null;
  attempts: number;
  at: string;
}

/** Đồng bộ tồn, đồng bộ giá: trường riêng, không đổi trạng thái listing */
export type SyncState = 'synced' | 'pending' | 'error';

/** Lỗi lần đẩy gần nhất của riêng một SKU (đẩy theo lô, SKU lỗi không đánh lỗi cả lô). `message` là câu của sàn */
export interface SyncError {
  code: string;
  message: string;
  at: string;
}

/** Sàn báo lỗi QC cho sản phẩm (Lazada `GetQCAlertProducts`) */
export interface QcAlert {
  reason: string;
  at: string;
}

/** channel.channel_listings: biến thể đã ghép với SKU trên sàn */
export interface ChannelListing {
  id: string;
  /** null khi listing đang đẩy lần đầu, sàn chưa trả mã (§18.5) */
  externalProductId: string | null;
  externalSkuId: string | null;
  /** SKU người bán đặt trên sàn; null khi sàn chưa trả */
  sellerSku: string | null;
  status: ListingStatus;
  /** Sàn từ chối: lý do sàn trả về */
  rejectReason: string | null;
  /**
   * Lỗi lần đẩy gần nhất (§18.6.4): `code` gồm `marketplace_rejected`, `marketplace_unavailable`,
   * `shop_not_connected` và các mã chặn ở 21 §18.5 (Documents#105). FE chỉ hiện `message`. Còn `pushing` mà có lỗi là việc nền đang thử lại
   */
  pushError: SyncError | null;
  /** Số lần đã thử khi sàn lỗi tạm (tối đa 5, quá 30 phút thì báo lỗi đẩy) */
  pushAttempts: number;
  /** Ẩn bằng cách nào: sàn ẩn riêng SKU, hoặc đẩy tồn 0 khi sàn không ẩn riêng phân loại */
  hiddenBy: 'platform' | 'zero_stock' | null;
  /** Sàn đổi listing ngoài app, chờ CEO quyết; null khi không có (§18.3) */
  outsideChange: OutsideChange | null;
  /** Bản sửa nội dung đang chờ sàn duyệt hoặc bị từ chối; null khi không có (§18.3) */
  pendingRevision: PendingRevision | null;
  /** Ai làm chủ tên, mô tả, ảnh trên sàn: `platform` là người bán tự đăng rồi ghép (§18.3) */
  contentSource?: 'app' | 'platform';
  /** Lượt đổi category trên sàn chưa xong hoặc lỗi; null khi không có (§18.5, commerio-backend#467) */
  categoryChange?: CategoryChange | null;
  stockSync: SyncState;
  priceSync: SyncState;
  stockSyncError: SyncError | null;
  priceSyncError: SyncError | null;
  qcAlert: QcAlert | null;
  /** Số trên sàn sau lần đẩy tồn gần nhất */
  platformStock: number | null;
  lastPushedAt: string | null;
  lastPushedPrice: number | null;
  /** Ghép chờ CEO duyệt (§18.6.5); null khi không có */
  pendingMapping: PendingMapping | null;
  version: number;
}

/** Yêu cầu ghép chờ CEO duyệt: "không quản tồn", hoặc đổi ghép SKU sàn đã có đơn (§18.6.5) */
export interface PendingMapping {
  /** Biến thể xin ghép; null là "không quản tồn" */
  variantId: string | null;
  /** SKU sàn xin ghép vào listing đẩy lỗi chưa có mã sàn; null khi listing đã có mã */
  externalSkuId: string | null;
  requestedBy: { id: string; name: string };
  requestedAt: string;
}

/** CEO duyệt hoặc từ chối ghép chờ (§18.6.5) */
export type MappingDecision = 'approve' | 'reject';

/** Một dòng màn hình ghép: biến thể đang bán kèm giá theo gian hàng và SKU sàn đã ghép */
export interface ListingRow {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  /** "Đen / M"; rỗng nếu sản phẩm không có thuộc tính */
  attributesLabel: string;
  thumbnailUrl: string | null;
  /** Giá đang bán, giá sẽ đẩy: giá ghi đè tay, giá theo gian hàng đã xác nhận, hoặc giá chuẩn (BE#225) */
  price: number | null;
  /** `override`: giá ghi đè tay của listing (kể cả nhận giá sàn đổi ngoài app); `shop`: giá theo gian hàng (FE#274) */
  priceSource: 'standard' | 'shop' | 'override' | null;
  /** Giá theo bộ lọc giá của gian hàng đã xác nhận; null khi chưa có */
  shopPrice: number | null;
  /** Giá mới chờ xác nhận (trang Giá chờ xác nhận); null khi không có */
  pendingPrice: number | null;
  /** Phiên bản phí sinh ra giá chờ */
  configVersionId: string | null;
  /** Thực nhận mỗi món theo giá đang bán; null khi gian hàng chưa có phí */
  netReceived: number | null;
  /** Giá đang bán dưới giá thấp nhất; null khi chưa có giá vốn */
  belowFloor: boolean | null;
  /** Tổng phí và thuế của gian hàng trên 50% */
  feeWarning: 'over_50' | null;
  /**
   * Số tồn lần đẩy tồn tới sẽ gửi cho SKU này ở gian hàng này (Documents/21 §18.9 R3); null khi chưa đẩy được tồn, lý do
   * (nếu có) ở `stockHeldReason`
   */
  stockToPush: number | null;
  stockHeldReason: 'shop_waiting_opening' | 'not_counted' | null;
  /** Giờ lần đẩy lỗi hoặc bị giữ gần nhất; null khi không có lỗi (Documents/21 §18.5, 21/11/2026) */
  lastSyncFailedAt: string | null;
  listing: ChannelListing | null;
  /** Đường dẫn category của listing trên sàn, tra trong cây đã đồng bộ; null khi chưa rõ (§18.5, commerio-backend#467) */
  externalCategoryPath?: string | null;
  /** Id category của listing trên sàn; so với `externalCategoryId` của spec để biết lệch (PR #475) */
  externalCategoryId?: string | null;
  /** Bằng `listing.categoryChange`; null khi chưa có listing */
  categoryChange?: CategoryChange | null;
  /**
   * Thông tin sàn (spec) của sản phẩm với sàn của gian hàng: `missing` chưa có, `incomplete` còn thiếu (Documents/21
   * §18.5, thêm 19/11/2026). FE dùng để hiện Bổ sung thông tin sàn và quyết định Đẩy sản phẩm mới
   */
  specStatus: SpecStatus;
}

export type SpecStatus = 'complete' | 'incomplete' | 'missing';

/** Listing của một biến thể ở một gian hàng, cho trang sản phẩm (Documents/21 §18.5 `GET /channel/products/:productId/listings`, commerio-backend#467) */
export interface ProductListingRow extends ListingRow {
  shopId: string;
  shopName: string;
  platform: Marketplace;
}

/**
 * Gian hàng mà các listing chưa gỡ của sản phẩm nằm ở hơn một sản phẩm sàn (Documents/21 §18.8.4); chỉ có khi
 * `productCount` > 1
 */
export interface SeparateProducts {
  shopId: string;
  platform: Marketplace;
  productCount: number;
}

/** `GET /channel/products/:productId/listings` */
export interface ProductListingsResponse {
  items: ProductListingRow[];
  /** BE cũ chưa trả thì thiếu */
  separateProducts?: SeparateProducts[];
}

/** SKU đang có trên sàn, BE lấy từ API của sàn (§18.3 `remote-skus`) */
export interface RemoteSku {
  externalProductId: string;
  externalSkuId: string;
  title: string;
  sellerSku: string;
  /** Biến thể đã ghép với SKU này; null là chưa ghép hoặc "không quản tồn" */
  matchedVariantId: string | null;
  /** Ghép đang có hiệu lực; null khi chưa ghép (kể cả đang chờ CEO duyệt "không quản tồn") */
  mode: 'mapped' | 'unmanaged' | null;
  /** Listing chưa gỡ của SKU này, kể cả dòng chỉ chờ duyệt "không quản tồn" */
  listingId: string | null;
  listingVersion: number | null;
  pendingMapping: PendingMapping | null;
  /**
   * Gợi ý SKU kho, cùng hàm gợi ý của `/setup` (Documents/21 §18.9 R2). `match: 'name'` chỉ là gợi ý, FE không chọn sẵn;
   * liên kết hàng loạt chỉ gom cặp `match: 'sku'`. BE chưa có R2 thì vắng
   */
  suggestion?: RemoteSkuSuggestion | null;
  /** Tạo được SKU kho từ SKU sàn này (`create-variant`); BE chưa có R2 thì vắng */
  canCreate?: boolean;
  cannotCreateReason?: CannotCreateReason | null;
}

export interface RemoteSkuSuggestion {
  variantId: string;
  sku: string;
  productName: string;
  match: 'sku' | 'name';
  /** Độ giống tên 0..1, chỉ có khi match = name; match = sku thì null */
  score: number | null;
}

/** `POST /channel/shops/:id/listings/match-bulk` (§18.9 R2): mỗi cặp một giao dịch, thành công được một phần */
export interface MatchBulkPair {
  externalSkuId: string;
  variantId: string;
}

export interface MatchBulkResult {
  externalSkuId: string;
  variantId: string;
  /** matched: đã liên kết; pending: chờ CEO duyệt; failed: lỗi, xem `code` (mã lỗi của `listings/match`) */
  outcome: 'matched' | 'pending' | 'failed';
  /** Chỉ dòng failed: mã và câu lỗi của `listings/match` (vd `mapping_pending`, `shop_not_active`) */
  code: string | null;
  message: string | null;
}

/**
 * `POST remote-skus/:externalSkuId/create-variant` (§18.9 R2). `created: true` (201): tạo SKU kho mới; `false` (200): SKU
 * người bán trùng SKU kho có sẵn nên liên kết vào SKU đó; `pending: true` (202): chờ CEO duyệt như `listings/match`
 */
export interface CreateVariantResult {
  variantId: string;
  created: boolean;
  pending: boolean;
  listing: ChannelListing;
}

/** Lỗi của lần đọc trọn SKU sàn gần nhất (§18.3, BE#361) */
export interface RemoteSkusRefreshError {
  code: string;
  platformCode: string | null;
  message: string;
}

/**
 * Lượt tải SKU sàn của gian hàng (§18.3, BE#361). `running`: lượt đang chờ hoặc chạy, `requestedAt` là lúc xếp lượt;
 * `failed`: lần đọc trọn lỗi gần nhất chưa quá 10 phút (hoặc lượt quá 15 phút, `refresh_stale`); `idle`: không có lượt
 * nào. `retryAfterSeconds`: số giây còn phải chờ trước khi Tải lại, null khi bấm được ngay (FE#315)
 */
export interface RemoteSkusRefresh {
  status: 'idle' | 'running' | 'failed';
  requestedAt: string | null;
  error: RemoteSkusRefreshError | null;
  retryAfterSeconds: number | null;
}

/**
 * `GET remote-skus` và `POST remote-skus/refresh` (§18.3, §18.6.5). `syncedAt`: lần đọc trọn gần nhất; lần mở đầu chưa có
 * bản sao thì `syncedAt: null`, `items: []` và `refresh.status = 'running'`. POST trả 202 khi xếp lượt (hoặc đang chạy)
 */
export interface RemoteSkuList {
  syncedAt: string | null;
  items: RemoteSku[];
  refresh?: RemoteSkusRefresh | null;
}

/** `POST /channel/shops/:id/listings/match` (§18.6.5): ghép theo SKU sàn */
/**
 * Xem trước khi lưu ghép (Documents/21 §18.3 `listings/match-preview`, commerio-backend#460): số trên sàn lấy từ bản sao
 * SKU sàn, số của app là số sẽ đẩy. `app.stock` null khi SKU chưa có số tồn (chưa nhập, chưa kiểm kê)
 */
export interface ListingMatchPreview {
  platform: { stock: number; price: string | null; syncedAt: string };
  app: { stock: number | null; price: string | null };
  stockWillPush: boolean;
  stockHeldReason: 'shop_waiting_opening' | 'not_counted' | null;
  priceWillPush: boolean;
  /**
   * Trường lưu cặp này sẽ ghi vào sản phẩm vì ở app đang trống mà sàn có (Documents/21 §18.9 R4); `value` là chữ hiển thị.
   * BE chưa có R4 thì vắng
   */
  fillBack?: { field: FillBackField; value: string | null }[];
  /** Không đọc được sản phẩm trên sàn để lấy giá trị (mọi `value` null); vẫn liên kết được (be#543) */
  fillBackError?: { code: string; message: string } | null;
}

export type FillBackField = 'originCountry' | 'brand' | 'description' | 'weight' | 'dimensions' | 'platformSpec';

export interface ListingMatchInput {
  externalSkuId: string;
  /** null là "không quản tồn", luôn cần CEO duyệt */
  variantId: string | null;
}

/**
 * Kết quả từng dòng của lần đẩy (§18.6.4). Đẩy chạy nền: dòng được xếp việc có `status = 'pushing'`, `code = null`;
 * dòng bị chặn có `code` (bảng §18.5, `sku_not_ready`) và `status` là trạng thái listing hiện có, null nếu chưa có
 */
export interface PushResult {
  variantId: string;
  listingId: string | null;
  status: ListingStatus | null;
  code: string | null;
  message: string | null;
}

/** Body đẩy: tối đa 20 biến thể một lần. Ảnh BE tự lấy từ catalog (§18.5, commerio-backend#303) */
export interface PushListingsInput {
  variantIds: string[];
  /**
   * Giá niêm yết người bán gõ ở màn Đăng sản phẩm (Documents/21 §18.9 R1): thành giá ghi đè tay, áp ngay, BE kiểm
   * `below_floor`, không chờ duyệt; lần tính lại theo phí không đổi giá này cho tới khi bỏ ghi đè
   */
  listPrices?: Record<string, number>;
}

/** Một dòng tính thử giá (Documents/21 §18.9 R1); thiếu `listPrice` thì BE tính theo giá muốn bán */
export interface PriceQuoteItem {
  shopId: string;
  variantId: string;
  listPrice?: number;
}

/**
 * Kết quả tính thử giá, cùng nghĩa với `ListingRow` (§18.6.7). `marginPct` chỉ có khi người gọi có
 * `inventory.cost.view`. `blocked.code`: `price_missing`, `fee_config_invalid`, `fee_not_configured` (ba số null)
 */
export interface PriceQuoteRow {
  shopId: string;
  variantId: string;
  listPrice: number | null;
  netReceived: number | null;
  belowFloor: boolean | null;
  feeWarning: 'over_50' | null;
  feeConfigId: string | null;
  blocked: { code: string } | null;
  marginPct?: number | null;
}

/**
 * Nút Đồng bộ (§18.5, commerio-backend#223): BE chỉ xếp một lượt đồng bộ chạy nền rồi trả 202. `queued = false` khi gian
 * hàng đã có lượt chờ. BE chưa phát sự kiện khi lượt chạy xong: FE tải lại listing ngay và thêm một lần sau khoảng 15 giây.
 */
/** `POST …/listings/sync` (Documents/21 §18.5, đổi 21/11/2026): `runId` là lượt người bấm (lượt mới hoặc lượt đang chờ) */
export interface ListingSyncResult {
  queued: boolean;
  runId: string;
}

/** Chỗ sửa của một dòng lỗi đồng bộ (Documents/21 §18.5 `SyncFix`) */
export type SyncFix = 'variant_price' | 'stocktake' | 'platform' | 'shop_reconnect';

export interface SyncRunError {
  listingId: string;
  variantId: string | null;
  productId: string | null;
  productName: string | null;
  attributesLabel: string | null;
  /** SKU người bán của listing */
  sku: string | null;
  code: string;
  /** Câu tiếng Việt cho người bán do app viết */
  message: string;
  /** Câu sàn trả, nguyên văn; null khi lỗi do app giữ */
  platformMessage: string | null;
  at: string;
  fix: SyncFix | null;
}

/** Một lượt đồng bộ người bấm (`GET …/listings/sync-runs/:runId`, `…/latest`). Quá 30 phút thì `failed` + `run_stale` */
export interface SyncRun {
  id: string;
  shopId: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** `total` null khi đang đọc trạng thái trên sàn */
  progress: { processed: number; total: number | null };
  succeeded: number;
  failed: number;
  /** Tối đa 200 dòng; số đủ ở `failed` */
  errors: SyncRunError[];
  /** Lỗi cả lượt */
  error: { code: string; message: string } | null;
}

/** Gỡ, đẩy lại: thao tác người dùng trên một listing */
export interface ListingActionInput {
  action: Extract<ListingAction, 'delist'>;
  version: number;
}

/** sku: SKU người bán trùng SKU Commerio; name: tên gần giống; none: không tìm được */
export type SetupMatch = 'sku' | 'name' | 'none';

/** Trạng thái sản phẩm trên sàn đã chuẩn hoá ở bước ghép (§18.7.5); SKU đã xoá không có trong gợi ý */
export type RemoteSkuStatus = 'live' | 'review' | 'rejected' | 'hold' | 'inactive';

/** Một SKU người bán trên sàn ở bước 1 thiết lập lần đầu, kèm biến thể gợi ý (§18.7.5) */
export interface SetupSuggestion {
  externalSkuId: string;
  title: string;
  /** Ảnh đầu tiên của sản phẩm trên sàn, chỉ để hiện (URL TikTok có ký, có thể hết hạn); null là không có */
  imageUrl: string | null;
  status: RemoteSkuStatus;
  match: SetupMatch;
  /** Độ giống tên 0..1, chỉ có khi match = name */
  score: number | null;
  /** Biến thể gợi ý; null khi match = none */
  variantId: string | null;
  sku: string | null;
  /** Khả dụng ở Commerio (null khi match = none) và số đang có trên sàn */
  available: number | null;
  platformStock: number;
  /** Tạo được SKU kho từ SKU sàn này (commerio-backend#500, §18.7.5) */
  canCreate: boolean;
  /** Có khi và chỉ khi canCreate = false */
  cannotCreateReason: CannotCreateReason | null;
}

/** no_seller_sku: sàn chưa có SKU người bán; sku_too_long: quá 50 ký tự; sku_taken: đã là SKU kho; no_permission: thiếu catalog.product.manage */
/** already_matched: dòng remote-skus đã liên kết hoặc đang chờ duyệt (§18.9 R2) */
export type CannotCreateReason = 'no_seller_sku' | 'sku_too_long' | 'sku_taken' | 'no_permission' | 'already_matched';

/** Quyết định cho một SKU sàn: variantId người dùng chọn (có thể khác gợi ý), null là bỏ qua */
export interface SetupDecision {
  externalSkuId: string;
  variantId: string | null;
  /** true: tạo SKU kho từ SKU sàn rồi liên kết, kèm variantId null (§18.7.5) */
  create?: boolean;
}

export interface ShopSetupPreview {
  /** Mọi SKU người bán đọc được trên sàn, kể cả match = none */
  suggestions: SetupSuggestion[];
  /** Số dòng match = none */
  unmatchedRemote: number;
  /**
   * true khi BE bỏ ghép theo tên vì gian hàng quá nhiều SKU hoặc so tên quá lâu: dòng không trùng SKU đều match = none
   * (§18.7.5, commerio-backend#198). Vắng khi BE chưa lên #198
   */
  nameMatchSkipped?: boolean;
  /** Mốc kéo đơn BE đề xuất (lúc kết nối); FE chỉ hiển thị, không gửi lại */
  proposedCutoffAt: string;
  /** Gian hàng đầu tiên của công ty: tồn đầu kỳ chỉ được chọn kiểm kê */
  firstShopOfCompany: boolean;
}

/** push: đẩy khả dụng của Commerio lên sàn; stocktake: lập phiếu kiểm kê nháp cho các SKU lệch */
export type OpeningStockMode = 'push' | 'stocktake';

export interface ShopSetupInput {
  /** SKU có trong suggestions mà không có ở đây coi như bỏ qua. Không gửi kèm externalSkuIds cũ */
  decisions: SetupDecision[];
  /** Nhóm hàng cho SKU kho tạo từ SKU sàn; bắt buộc khi có dòng create */
  createGroupId?: string;
  openingStock: OpeningStockMode;
  /** Bắt buộc, số nguyên 1–60 khi capabilities.returnWindow = days */
  returnWindowDays?: number | null;
}

export interface ShopSetupResult {
  shop: Shop;
  matched: number;
  /** Số SKU kho vừa tạo từ SKU sàn, đã tính trong matched */
  created: number;
  /** Số phiếu kiểm kê nháp vừa lập (khi chọn stocktake và có SKU lệch) */
  stocktakeNumber: string | null;
}

/** PATCH /channel/shops/:id (§18.4, BE#377): sửa hạn trả hàng khi capabilities.returnWindow = days */
export interface ShopUpdateInput {
  version: number;
  /** Số nguyên 1–60 */
  returnWindowDays: number;
}

export interface ShopDisconnectInput {
  version: number;
  /** Đặt tồn trên sàn về 0 trước khi ngắt (chỉ làm được khi token còn dùng được) */
  zeroStock: boolean;
}

/** Xoá gian hàng đã ngắt (commerio-backend#398): phải gửi đúng chữ XOA */
export interface ShopDeleteInput {
  confirm: 'XOA';
  version: number;
}

/** 200 của DELETE /channel/shops/:id: số dòng đã xoá theo nhóm (BE có thể trả thêm nhóm khác) */
export interface ShopDeleteResult {
  deleted: {
    orders: number;
    packages: number;
    returns: number;
    listings: number;
    ledgerEntries: number;
    [group: string]: number;
  };
}

/** Một đơn chưa xong trả kèm lỗi 409 shop_has_open_orders (tối đa 20 đơn, cũ nhất trước; §18.7.8) */
export interface ShopOpenOrder {
  id: string;
  code: string;
  externalOrderId: string | null;
}

export interface ShopReconnectSummary {
  /** Kéo đơn từ mốc này (lần kéo cuối trước khi mất kết nối) */
  pulledFrom: string | null;
  /** Listing tạo lại trên sàn sau khi ngắt */
  relisted: number;
  /** Việc trong hàng chờ đã chạy */
  jobsRun: number;
}

/** Phần listing mà danh sách giá chờ cần dùng (§21.4); không phụ thuộc trường mô tả chưa chốt. */
export interface PendingPrice {
  listing: Pick<ChannelListing, 'id' | 'version'> & Partial<Pick<ChannelListing, 'sellerSku'>>;
  price: number; pendingPrice: number; belowFloor: boolean; configVersionId: string;
}

export type SizeChartRule = 'required' | 'optional' | 'unsupported';

// ---------- Category và attribute của sàn (commerio-backend#400, Documents/21 §18.5) ----------

/** Một dòng cây category của sàn; dữ liệu tham chiếu của nền tảng, không theo công ty */
export interface PlatformCategory {
  externalId: string;
  parentExternalId: string | null;
  name: string;
  /** Cả đường dẫn, vd "Thời trang nam > Áo > Áo thun" */
  path: string;
  /** `externalId` từ gốc tới chính category, cùng thứ tự với `path` (commerio-backend#467) */
  pathIds?: string[];
  isLeaf: boolean;
  status: 'active' | 'removed';
}

/** `syncedAt: null` khi chưa đồng bộ cây của sàn lần nào (`items` rỗng) */
export interface PlatformCategoryList {
  items: PlatformCategory[];
  syncedAt?: string | null;
}

export type PlatformAttributeInput = 'select' | 'multiselect' | 'text' | 'number' | 'date' | 'image' | 'cascade';

/** `tier` quyết định tab của form đẩy: category (theo category), product (trang sản phẩm), company (hồ sơ công ty) */
export interface PlatformAttribute {
  code: string;
  label: string;
  kind: 'sales' | 'property';
  input: PlatformAttributeInput;
  options: { id: string; label: string }[];
  allowCustom: boolean;
  required: boolean;
  /**
   * Bắt buộc khi có ít nhất một điều kiện đúng: attribute `code` chọn một trong `optionIds` (TikTok
   * `requirement_conditions`); null là không có điều kiện (mọi attribute Lazada)
   */
  requiredWhen: RequiredWhen[] | null;
  isKey: boolean;
  tier: 'category' | 'product' | 'company';
  defaultValue: string | null;
}

/** Một điều kiện bắt buộc của `PlatformAttribute.requiredWhen` (Documents/21 §18.5, chốt 18/11/2026) */
export interface RequiredWhen {
  code: string;
  optionIds: string[];
}

export interface PlatformCategoryProduct {
  productId: string;
  code: string;
  name: string;
  source: 'push' | 'match';
}

export interface PlatformCategoryDetail {
  category: PlatformCategory & { sizeChartRule: SizeChartRule | null };
  attributes: PlatformAttribute[];
  fetchedAt: string | null;
  stale: boolean;
  products: PlatformCategoryProduct[];
}

export interface PlatformCategorySyncResult {
  queued: boolean;
}

// ---------- Thông tin sàn của sản phẩm: ProductSpec (commerio-backend#400, Documents/21 §18.5) ----------

/** Quyền bán category của gian hàng TikTok; Lazada luôn `null` */
export type CategoryPermission = 'available' | 'invite_only' | 'non_main_category' | 'prohibited';

export interface CategorySuggestion {
  externalId: string;
  path: string;
  permission: CategoryPermission | null;
  /** Công ty đã có spec ở category này trên sàn (chỉ ở `items`) */
  usedByCompany?: boolean;
}

/** Category đọc từ spec của công ty (`group`: sản phẩm cùng nhóm hàng; `recent`: công ty dùng gần đây) */
export interface UsedCategory extends CategorySuggestion {
  /** Số sản phẩm đang dùng; `group` không đếm chính sản phẩm đang đẩy */
  productCount: number;
}

/** Sàn không gợi ý được: route vẫn 200, `items: []`, còn `group`, `recent` (Documents/21 §18.5, §18.8.5) */
export interface SuggestError {
  code: 'product_name_too_short' | 'images_missing' | 'marketplace_unavailable';
  message: string;
  min?: number;
}

/**
 * `items`: gợi ý của sàn (Lazada tối đa 5, TikTok 1 leaf). `group`, `recent` đọc DB, tối đa 5, BE đã bỏ trùng
 * (`recent` không trùng `items`, `group`). `cached` luôn false tới khi có Redis
 */
export interface CategorySuggestionList {
  items: CategorySuggestion[];
  group?: UsedCategory[];
  recent?: UsedCategory[];
  suggestError?: SuggestError | null;
  cached: boolean;
}

/** Giá trị attribute: select lưu mã lựa chọn, multiselect mảng mã, text/number/date chuỗi */
export type SpecValue = string | string[];

export interface ProductSpec {
  productId: string;
  platform: Marketplace;
  externalCategoryId: string;
  categoryPath: string;
  categoryStatus: 'ok' | 'changed' | 'removed';
  attributes: Record<string, SpecValue>;
  /** Mỗi trục phân loại (id thuộc tính Commerio) → `code` sales attribute của leaf hoặc `__custom` */
  axisMap: Record<string, string>;
  /** Id giá trị thuộc tính Commerio → `options[].id` của sales attribute đã ánh xạ; thiếu khoá là gửi custom value */
  valueMap: Record<string, string>;
  /** `push`: lưu ở trang đẩy; `match`: đọc từ sàn lúc ghép SKU */
  source: 'push' | 'match';
  /**
   * Nguồn của từng attribute trong `attributes` (Documents/21 §18.5, commerio-backend#497): đẩy, đọc từ sàn khi ghép,
   * người dùng sửa. BE cũ chưa trả thì thiếu
   */
  fieldSources?: Record<string, 'push' | 'match' | 'user'>;
  version: number;
  updatedAt: string;
}

export type SpecMissingReason =
  | 'required'
  | 'required_when'
  | 'axis_unmapped'
  | 'sales_required'
  | 'axis_shape'
  | 'category_changed'
  | 'category_removed';

export interface SpecMissing {
  code: string;
  label: string;
  reason: SpecMissingReason;
}

/** Cân nặng, kích thước sàn đang ghi của một SKU đã ghép (chỉ SKU sàn có số) */
export interface RemoteVariantFacts {
  variantId: string;
  weightG: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
}

/**
 * Bản sàn đang ghi ở lần đọc gần nhất khi ghép SKU (Documents/21 §18.5, commerio-backend#497). `brand` null là sàn ghi
 * "No Brand" hoặc không có; `description` chữ trơn đã bỏ HTML; `shopId` null khi gian hàng đã xoá
 */
export interface RemoteProductFacts {
  shopId: string | null;
  shopName: string;
  readAt: string;
  originCountry: string | null;
  brand: string | null;
  description: string | null;
  sizeChartUrl: string | null;
  imageUrls: string[];
  variants: RemoteVariantFacts[];
}

/** `spec: null`, `missing: []` khi sản phẩm chưa có thông tin của sàn */
/** Luật trục của sàn theo leaf, adapter khai (Documents/21 §18.8.2, §18.8.3) */
export interface VariantCapabilities {
  /** Số trục tối đa sàn nhận ở leaf này */
  maxAxes: number;
  /** Sàn nhận tên trục tự đặt (`__custom`); không thì chỉ sales attribute của leaf */
  customAxisName: boolean;
  /** Mã sales attribute leaf bắt buộc có trục ánh xạ tới */
  salesRequired: string[];
}

/** Giá trị đã tính của một attribute và nguồn của nó (Documents/21 §18.8.2) */
export interface ResolvedAttribute {
  /** Cùng quy ước với `attributes`: select là id lựa chọn của sàn, nhãn khi tự gõ */
  value: SpecValue;
  source: 'override' | 'catalog' | 'company' | 'default';
  /** Thông số catalog sinh ra giá trị (nguồn `catalog`); null với thương hiệu, xuất xứ và nguồn khác */
  fieldId: string | null;
}

export interface ProductSpecResult {
  spec: ProductSpec | null;
  missing: SpecMissing[];
  /** null khi chưa đọc từ sàn; BE cũ chưa trả thì thiếu */
  remote?: RemoteProductFacts | null;
  /**
   * Giá trị tự điền của mọi attribute không phải sales, theo thứ tự ghi đè > thông số catalog > hồ sơ công ty > mặc định
   * sàn. `spec.attributes` chỉ còn phần ghi đè
   */
  resolved?: Record<string, ResolvedAttribute>;
  /** Trục ↔ sales attribute, giá trị ↔ lựa chọn chuẩn BE dựng theo `platform_kind` và ánh xạ của công ty */
  suggestedAxisMap?: Record<string, string>;
  suggestedValueMap?: Record<string, string>;
  /** null khi chưa có leaf */
  variantCapabilities?: VariantCapabilities | null;
}

/** `version: null` khi tạo mới. Chỉ attribute `tier = 'category'` và `company` khác `defaultValue` được lưu */
export interface ProductSpecInput {
  externalCategoryId: string;
  attributes: Record<string, SpecValue>;
  axisMap: Record<string, string>;
  valueMap: Record<string, string>;
  version: number | null;
}

/** Một giá trị của cấp kế attribute cascade; `leaf` là cấp cuối (Documents/21 §18.5, chốt 19/11/2026) */
export interface CascadeOption {
  id: string;
  label: string;
  leaf: boolean;
}

/** `GET …/cascade?code&path&shopId`: `prop` là attribute của cấp kế (Lazada GetNextCascadeProp), null khi sàn không trả */
export interface CascadeOptionList {
  prop: { id: string; label: string; required: boolean } | null;
  items: CascadeOption[];
}

/** Một sản phẩm trên sàn sẽ đổi category; `code = shop_not_connected` là không xếp việc (§18.5 `apply-category`) */
export interface ApplyCategoryItem {
  shopId: string;
  shopName: string;
  externalProductId: string;
  listingIds: string[];
  fromCategoryId: string;
  fromCategoryPath: string | null;
  toCategoryId: string;
  toCategoryPath: string | null;
  code: 'shop_not_connected' | null;
}

export interface ApplyCategoryResult {
  items: ApplyCategoryItem[];
}
