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

/** oauth: đăng nhập sàn rồi đồng ý cấp quyền; token: dán token lấy trên console của sàn (shop thử) */
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
  /** Phiếu kiểm kê đầu kỳ chưa ghi sổ; khác null thì trang gian hàng hiện banner dẫn tới phiếu (§18.6.2) */
  openingStocktake: ShopOpeningStocktake | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type ShopSetupStepKey = 'match' | 'opening_stock' | 'open_orders' | 'push_stock';
/** pending: chờ người làm; running: việc nền đang chạy */
export type ShopSetupStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'blocked';

export interface ShopSetupStep {
  key: ShopSetupStepKey;
  status: ShopSetupStepStatus;
  /** Khoá bước đang chặn (opening_stock, open_orders) hoặc mã issue chưa làm (§18.7.9); null khi không blocked */
  blockedBy: string | null;
}

export interface ShopSetupProgress {
  /** opening_stock chỉ có khi chọn kiểm kê đầu kỳ */
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
  status: 'draft' | 'pending' | 'rejected';
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
  | 'request_review';

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
  requestedBy: { id: string; name: string };
  requestedAt: string;
}

/** Một dòng màn hình ghép: biến thể đang bán kèm giá theo gian hàng và SKU sàn đã ghép */
export interface ListingRow {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  /** "Đen / M"; rỗng nếu sản phẩm không có thuộc tính */
  attributesLabel: string;
  thumbnailUrl: string | null;
  /** Giá sẽ đẩy: bảng giá gian hàng, thiếu thì lấy giá chuẩn (G5) */
  price: number | null;
  priceSource: 'shop' | 'standard' | null;
  listing: ChannelListing | null;
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
}

/** `POST /channel/shops/:id/listings/match` (§18.6.5): ghép theo SKU sàn */
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

/** Body đẩy: tối đa 20 biến thể một lần; `imageUrls` theo sản phẩm cho lần đầu đẩy (§18.5) */
export interface PushListingsInput {
  variantIds: string[];
  imageUrls?: Record<string, string[]>;
}

/** Kết quả đồng bộ listing với sàn (§18.5) */
export interface ListingSyncResult {
  checked: number;
  changed: number;
  pushed: number;
  errors: number;
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
}

/** Quyết định cho một SKU sàn: variantId người dùng chọn (có thể khác gợi ý), null là bỏ qua */
export interface SetupDecision {
  externalSkuId: string;
  variantId: string | null;
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
  openingStock: OpeningStockMode;
  /** Bắt buộc, số nguyên 1–60 khi capabilities.returnWindow = days */
  returnWindowDays?: number | null;
}

export interface ShopSetupResult {
  shop: Shop;
  matched: number;
  /** Số phiếu kiểm kê nháp vừa lập (khi chọn stocktake và có SKU lệch) */
  stocktakeNumber: string | null;
}

export interface ShopDisconnectInput {
  version: number;
  /** Đặt tồn trên sàn về 0 trước khi ngắt (chỉ làm được khi token còn dùng được) */
  zeroStock: boolean;
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

// ---------- Ghép danh mục với danh mục sàn (FE#146, Documents/21 §18.5) ----------

/** Danh mục lá của sàn; `name` là cả đường dẫn, vd "Thời trang nam > Áo > Áo thun" */
export interface MarketplaceCategory {
  externalId: string;
  name: string;
}

export interface MarketplaceCategoryList {
  items: MarketplaceCategory[];
}

/** Thuộc tính bắt buộc cấp sản phẩm của một danh mục sàn; `options` rỗng là nhập tự do */
export interface CategoryAttribute {
  name: string;
  label: string;
  options: string[];
}

export interface CategoryAttributeList {
  items: CategoryAttribute[];
}

/** channel.category_maps: một danh mục Commerio ghép với một danh mục lá của sàn, theo gian hàng */
export interface CategoryMap {
  categoryId: string;
  platform: Marketplace;
  externalCategoryId: string;
  /** Giá trị thuộc tính bắt buộc, theo `CategoryAttribute.name` */
  attributes: Record<string, string>;
  version: number;
  updatedAt: string;
}

export interface CategoryMapList {
  items: CategoryMap[];
}

export interface CategoryMapInput {
  externalCategoryId: string;
  attributes: Record<string, string>;
  /** `null` khi danh mục chưa ghép lần nào */
  version: number | null;
}
