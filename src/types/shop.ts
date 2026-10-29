/**
 * Shop (Channel) types — khớp với channel.shops, channel.channel_listings trong DBML.
 * Mỗi shop là một gian hàng kết nối sàn thuộc về một company (UC-CH-01, UC-CH-02).
 * Hợp đồng API đề xuất ở FE#8, chờ commerio-backend#19 chốt.
 */

export type Marketplace = 'tiktok' | 'shopee' | 'lazada' | 'mock';

/** Sàn được BE công bố theo adapter và cấu hình (Documents/21 §18.1). */
export interface ShopPlatform {
  platform: string;
  name: string;
  connectable: boolean;
}

export interface ShopList { items: Shop[] }
export interface ShopPlatformList { items: ShopPlatform[] }

/**
 * Sơ đồ Gian hàng (C1, FE#58): connecting (đã uỷ quyền, đang chạy thiết lập lần đầu) → active;
 * active → needs_reauth khi sàn thu hồi quyền hoặc token hết hạn; → disconnected khi người dùng ngắt.
 */
export type ShopStatus = 'connecting' | 'active' | 'needs_reauth' | 'disconnected';

export type ShopAction = 'finish_setup' | 'lose_auth' | 'reconnect' | 'disconnect';

export interface Shop {
  id: string;
  companyId: string;
  platform: Marketplace;
  externalShopId: string;
  shopName: string;
  region: string;
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
  version: number;
  createdAt: string;
  updatedAt: string;
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
  code: string;
  state: string;
}

export interface ShopCallbackResult {
  shop: Shop;
  /** false: gian hàng đã có, chỉ cấp lại token */
  created: boolean;
  /** Có khi kết nối lại gian hàng đã có */
  reconnect: ShopReconnectSummary | null;
}

/**
 * Sơ đồ Listing (C2, FE#58). Chưa có bản ghi là `not_listed`.
 * pushing → under_review (Lazada, TikTok) hoặc live (Shopee, sàn giả lập); lỗi đẩy → push_failed;
 * sàn từ chối → rejected; sàn khoá → platform_hold; SKU tạm ngừng → hidden; gỡ khỏi sàn → delisted.
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
  | 'delist';

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
  externalProductId: string;
  externalSkuId: string;
  /** SKU người bán đặt trên sàn */
  sellerSku: string;
  status: ListingStatus;
  /** Sàn từ chối: lý do sàn trả về */
  rejectReason: string | null;
  /** Đẩy lỗi hoặc đang thử lại: câu báo của lần gần nhất */
  pushError: string | null;
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
  version: number;
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

/** SKU đang có trên sàn, BE lấy từ API của sàn */
export interface RemoteSku {
  externalProductId: string;
  externalSkuId: string;
  title: string;
  sellerSku: string;
  price: number;
  /** Biến thể đã ghép với SKU này; null là chưa ghép */
  matchedVariantId: string | null;
}

export interface ListingMatchInput {
  externalSkuId: string;
  /** version của ghép hiện có; null khi ghép mới */
  version: number | null;
}

export interface PushResult {
  variantId: string;
  sku: string;
  outcome: 'updated' | 'created' | 'failed';
  /** Trạng thái listing sau lần đẩy */
  status?: ListingStatus;
  externalSkuId?: string;
  code?: string;
  message?: string;
}

/** Gỡ, đẩy lại: thao tác người dùng trên một listing */
export interface ListingActionInput {
  action: Extract<ListingAction, 'delist'>;
  version: number;
}

/** Gợi ý ghép ở bước 1 thiết lập lần đầu: SKU sàn có SKU người bán trùng SKU biến thể */
export interface SetupSuggestion {
  externalSkuId: string;
  title: string;
  variantId: string;
  sku: string;
  /** Khả dụng ở Commerio và số đang có trên sàn, cho bước kiểm kê đầu kỳ */
  available: number;
  platformStock: number;
}

export interface ShopSetupPreview {
  suggestions: SetupSuggestion[];
  /** SKU sàn không gợi ý được, ghép tay sau ở trang ghép SKU */
  unmatchedRemote: number;
}

/** push: đẩy khả dụng của Commerio lên sàn; stocktake: lập phiếu kiểm kê nháp cho các SKU lệch */
export type OpeningStockMode = 'push' | 'stocktake';

export interface ShopSetupInput {
  externalSkuIds: string[];
  openingStock: OpeningStockMode;
  orderCutoffAt: string;
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

export interface ShopReconnectSummary {
  /** Kéo đơn từ mốc này (lần kéo cuối trước khi mất kết nối) */
  pulledFrom: string | null;
  /** Listing tạo lại trên sàn sau khi ngắt */
  relisted: number;
  /** Việc trong hàng chờ đã chạy */
  jobsRun: number;
}
