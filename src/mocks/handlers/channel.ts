import { http, HttpResponse, delay } from 'msw';
import { db, type MockSetupRun, type MockShop } from '../db';
import type {
  ChannelListing,
  ListingMatchInput,
  ListingRow,
  Marketplace,
  PushResult,
  RemoteSku,
  SetupDecision,
  SetupSuggestion,
  Shop,
  ShopList,
  ShopPlatformList,
  ShopCallbackInput,
  ShopAuthorizeUrl,
  ShopCallbackResult,
  ShopConnectionResult,
  ShopDisconnectInput,
  ShopOpenOrder,
  ShopReconnectSummary,
  ShopSetupInput,
  ShopSetupProgress,
  ShopSetupStep,
  ShopSetupPreview,
  ShopSetupResult,
  ShopTokenInput,
} from '@/types/shop';
import * as channel from '../channelData';
import type { MockListing, MockRemoteSku } from '../channelData';
import * as pricing from '../pricingData';
import * as inventory from '../inventoryData';
import { orders as salesOrders } from '../salesData';
import type { MockStockDoc } from '../inventoryData';
import { availableOf } from '../engine/stock';
import { PERMISSIONS } from '@/utils/permissions';
import { API, LATENCY, checkTransition, problem, requireCompany, type CompanyActor } from './utils';
import { versionConflict, writeCompanyLog } from './identity';
import { fileUrl, rid, staleVersion, variantAttributes } from './catalog';
import { ensureStandard, sellableVariants, skuOf } from './pricing';
import { nextDocNumber, variantLabel } from './inventory';
import { hidesListings } from '@/lib/machines/product';
import { listingMachine, onPlatform, shopMachine, shopUsable } from '@/lib/machines/channel';
import { DEFAULT_OAUTH_DENY, mockAllowsMethod, mockCapabilities, mockOAuthReturn, mockPlatforms } from '../shopPlatforms';
import { appPath } from '@/utils/env';
import { registerMarketplaceEvent } from '../engine/marketplace';
import type { ListingStatus } from '@/types/shop';

// ---------- Channel: gian hàng và ghép SKU của công ty đang chọn (UC-CH-01, UC-CH-02) ----------
export const shopEntity = (s: MockShop) => ({ type: 'channel.shops', id: s.id, label: s.shopName });
export function shopSnapshot(s: MockShop): Record<string, unknown> {
  return {
    shopName: s.shopName,
    platform: s.platform,
    externalShopId: s.externalShopId,
    status: s.status,
  };
}

export function toShop(s: MockShop): Shop {
  const { outage: _outage, openingStocktakeDocId: _doc, setupRun: _run, ...shop } = s;
  return {
    ...shop,
    returnWindowDays: s.returnWindowDays ?? null,
    openingStocktake: openingStocktakeOf(s),
    listingCount: channel.listings.filter((l) => l.shopId === s.id && onPlatform(l.status)).length,
    orders7d: salesOrders.filter((o) => o.shopId === s.id && Date.now() - Date.parse(o.createdAt) < WEEK_MS).length,
    pendingOrderCount: openOrdersOf(s.id).length,
    // Mock không giữ lịch sử trạng thái: mất quyền, đã ngắt lấy lần sửa cuối; chưa đổi lần nào thì bằng createdAt
    statusChangedAt:
      s.statusChangedAt ?? (s.status === 'needs_reauth' || s.status === 'disconnected' ? s.updatedAt : s.createdAt),
    // BE#230 chưa có bản cấu hình phí theo gian hàng
    feeConfigVersion: null,
    setup: setupProgressOf(s),
  };
}

/** Việc nền giả của mock: kéo đơn còn mở và đẩy tồn đầu tiên, mỗi việc chạy vài giây */
export const SETUP_JOB_MS = 2500;
const DAY_MS = 24 * 60 * 60 * 1000;

/** §18.7.7: tiến độ thiết lập suy từ lượt thiết lập đã gửi và phiếu kiểm kê đầu kỳ */
function setupProgressOf(s: MockShop): ShopSetupProgress | null {
  const run = s.setupRun;
  if (!run) {
    if (s.status !== 'connecting') return null;
    return {
      steps: [
        { key: 'match', status: 'pending', blockedBy: null },
        { key: 'open_orders', status: 'pending', blockedBy: null },
        { key: 'push_stock', status: 'pending', blockedBy: null },
      ],
      unmatchedCount: setupSuggestions(s).unmatchedRemote,
      openOrdersSkipped: 0,
    };
  }
  const now = Date.now();
  const steps: ShopSetupStep[] = [{ key: 'match', status: 'done', blockedBy: null }];
  const stocktakeOpen = run.mode === 'stocktake' && openingStocktakeOf(s) !== null;
  if (run.mode === 'stocktake') steps.push({ key: 'opening_stock', status: stocktakeOpen ? 'pending' : 'done', blockedBy: null });
  const pulling = now - run.at < SETUP_JOB_MS;
  steps.push({ key: 'open_orders', status: pulling ? 'running' : 'done', blockedBy: null });
  if (stocktakeOpen || pulling) {
    steps.push({ key: 'push_stock', status: 'blocked', blockedBy: stocktakeOpen ? 'opening_stock' : 'open_orders' });
  } else {
    run.pushStartedAt ??= now;
    const pushing = now - run.pushStartedAt < SETUP_JOB_MS;
    steps.push({ key: 'push_stock', status: pushing ? 'running' : 'done', blockedBy: null });
    // Mọi bước xong quá 24 giờ thì thôi trả tiến độ
    if (!pushing && now - run.pushStartedAt - SETUP_JOB_MS > DAY_MS) return null;
  }
  // Mock không đặt trần OPEN_ORDER_PULL_MAX nên không bỏ đơn nào
  return { steps, unmatchedCount: run.unmatchedCount, openOrdersSkipped: 0 };
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Đơn của gian hàng chưa xong: chưa hoàn tất, chưa huỷ */
function openOrdersOf(shopId: string) {
  return salesOrders.filter((o) => o.shopId === shopId && o.status !== 'completed' && o.status !== 'cancelled');
}

/** §18.6.2: phiếu kiểm kê đầu kỳ còn chưa ghi sổ (nháp, chờ duyệt, bị từ chối); ghi sổ hoặc huỷ thì thôi */
function openingStocktakeOf(s: MockShop): Shop['openingStocktake'] {
  if (!s.openingStocktakeDocId) return null;
  const doc = inventory.docs.find((d) => d.id === s.openingStocktakeDocId);
  if (!doc || (doc.status !== 'draft' && doc.status !== 'pending' && doc.status !== 'rejected')) return null;
  return { documentId: doc.id, number: doc.number, status: doc.status };
}

/**
 * Gian hàng đầu tiên của công ty (§18.6.2): công ty chưa có gian hàng nào khác đã qua thiết lập lần đầu
 * (mock coi gian hàng mẫu là đã kiểm kê đầu kỳ). Gian hàng khác còn phiếu kiểm kê đầu kỳ chưa ghi sổ thì chưa tính.
 */
export function firstShopOfCompany(shop: MockShop) {
  return !db.shops.some(
    (s) => s.id !== shop.id && s.companyId === shop.companyId && s.status !== 'connecting' && !openingStocktakeOf(s),
  );
}

export function findShop(id: unknown, companyId: string) {
  return db.shops.findIndex((s) => s.id === id && s.companyId === companyId);
}

export const MARKETPLACES: Marketplace[] = ['tiktok', 'shopee', 'lazada', 'mock'];
/** Gian hàng còn token dùng được: gọi được API sàn */
export const usable = (s: MockShop) => shopUsable(s.status);
export const TOKEN_TTL_MS = 7 * 24 * 3600_000;
/** Refresh token (Lazada khoảng 30 ngày); sàn giả lập không có */
export const REFRESH_TTL_MS = 30 * 24 * 3600_000;

const marketplaceUnsupported = (platform: string) =>
  problem(422, 'Sàn chưa hỗ trợ', { code: 'marketplace_unsupported', detail: `Chưa hỗ trợ kết nối sàn ${platform}.` });

export function shopNotConnected(s: MockShop) {
  return problem(409, 'Gian hàng chưa kết nối', {
    code: 'shop_not_connected',
    detail: `${s.shopName} cần kết nối lại trước khi thao tác với sàn.`,
  });
}

/** Mã uỷ quyền giả: sàn giả lập gói mã và tên gian hàng người dùng đồng ý */
export function decodeMockCode(code: string): { externalShopId: string; shopName: string } | null {
  try {
    const value = JSON.parse(decodeURIComponent(atob(code)));
    return typeof value?.externalShopId === 'string' && typeof value?.shopName === 'string' ? value : null;
  } catch {
    return null;
  }
}

/** Giá đẩy lên sàn: bảng giá của gian hàng, thiếu thì lấy giá chuẩn (G5) */
export function shopPrice(shop: MockShop, variantId: string) {
  const own = pricing.pricelists.find((p) => p.shopId === shop.id)?.prices[variantId];
  if (own !== undefined) return { price: own, priceSource: 'shop' as const };
  const standard = ensureStandard(shop.companyId).prices[variantId];
  if (standard !== undefined) return { price: standard, priceSource: 'standard' as const };
  return { price: null, priceSource: null };
}

/** Khả dụng của biến thể: số đẩy lên sàn (không đẩy tồn thực) */
export const availableFor = (companyId: string, variantId: string) =>
  availableOf(inventory.levelOf(companyId, variantId));

/** Lệch tồn sàn của SKU: lần đẩy tồn gần nhất lỗi, sàn còn số khác */
export const stockDrift = (companyId: string, variantId: string) =>
  channel.listings.some(
    (l) => l.companyId === companyId && l.variantId === variantId && onPlatform(l.status) && l.stockSync === 'error',
  );

export function toListing(l: MockListing): ChannelListing {
  const r = channel.remoteSkus[l.shopId]?.find((x) => x.externalSkuId === l.externalSkuId);
  const shop = db.shops.find((x) => x.id === l.shopId);
  const price = shop ? shopPrice(shop, l.variantId).price : null;
  return {
    id: l.id,
    externalProductId: l.externalProductId,
    externalSkuId: l.externalSkuId,
    sellerSku: r?.sellerSku ?? '',
    status: l.status,
    rejectReason: l.rejectReason,
    pushError: l.pushError,
    pushAttempts: l.pushAttempts,
    hiddenBy: l.hiddenBy,
    stockSync: l.stockSync,
    // Giá: tính so với giá đã đẩy; chưa đẩy lần nào hoặc giá đổi là đang chờ
    priceSync: l.status === 'push_failed' ? 'error' : price !== null && price === l.lastPushedPrice ? 'synced' : 'pending',
    stockSyncError: l.stockSync === 'error' ? (l.stockSyncError ?? null) : null,
    priceSyncError: l.priceSyncError ?? null,
    qcAlert: l.qcAlert ?? null,
    platformStock: l.platformStock,
    lastPushedAt: l.lastPushedAt,
    lastPushedPrice: l.lastPushedPrice,
    version: l.version,
  };
}

/** Sàn nhận bản đẩy: Shopee, sàn giả lập bán ngay; Lazada, TikTok chờ duyệt cả sản phẩm (mọi SKU cùng mã sản phẩm sàn) */
export function settlePush(shop: MockShop, l: MockListing, paused: boolean) {
  l.pushError = null;
  l.pushAttempts = 0;
  l.rejectReason = null;
  if (shop.capabilities.listingReview) {
    l.status = 'under_review';
    for (const sib of channel.listings) {
      if (sib !== l && sib.shopId === shop.id && sib.externalProductId === l.externalProductId && sib.status === 'live') {
        sib.status = 'under_review';
        sib.version += 1;
      }
    }
  } else {
    l.status = 'live';
  }
  if (paused) hideListing(shop, l);
  else syncStock(l);
}

/** Đẩy khả dụng lên sàn cho listing (ẩn bằng tồn 0 thì giữ 0) */
function syncStock(l: MockListing) {
  l.platformStock = l.hiddenBy === 'zero_stock' ? 0 : availableFor(l.companyId, l.variantId);
  l.stockSync = 'synced';
  l.stockSyncError = null;
}

/** Ẩn listing khi SKU tạm ngừng: sàn ẩn riêng SKU, hoặc đẩy tồn 0 khi sàn không ẩn riêng phân loại */
export function hideListing(shop: MockShop, l: MockListing) {
  if (l.status === 'live') l.status = 'hidden';
  l.hiddenBy = shop.capabilities.hideBy === 'zero_stock' ? 'zero_stock' : 'platform';
  if (l.hiddenBy === 'zero_stock') l.platformStock = 0;
}

/** Ẩn hoặc hiện listing của SKU theo trạng thái kinh doanh; gian hàng chưa gọi được sàn thì xếp vào hàng chờ */
export function setListingsHidden(companyId: string, variantId: string, hide: boolean) {
  for (const l of channel.listings) {
    if (l.companyId !== companyId || l.variantId !== variantId || !onPlatform(l.status)) continue;
    const shop = db.shops.find((x) => x.id === l.shopId);
    if (!shop) continue;
    if (hide) hideListing(shop, l);
    else {
      if (l.status === 'hidden') l.status = 'live';
      l.hiddenBy = null;
    }
    if (usable(shop)) {
      if (!hide) syncStock(l);
    } else {
      l.stockSync = 'pending';
      shop.pendingJobs += 1;
    }
    l.version += 1;
  }
}

/** Gỡ mọi listing của SKU khỏi sàn (lưu trữ SKU) */
export function delistVariant(companyId: string, variantId: string) {
  for (const l of channel.listings) {
    if (l.companyId !== companyId || l.variantId !== variantId || !onPlatform(l.status)) continue;
    l.status = 'delisted';
    l.hiddenBy = null;
    l.platformStock = 0;
    l.version += 1;
  }
}

function newListing(shop: MockShop, variantId: string, r: MockRemoteSku, over: Partial<MockListing> = {}): MockListing {
  return {
    id: rid('lst'),
    companyId: shop.companyId,
    shopId: shop.id,
    variantId,
    externalProductId: r.externalProductId,
    externalSkuId: r.externalSkuId,
    status: 'live',
    rejectReason: null,
    pushError: null,
    pushAttempts: 0,
    hiddenBy: null,
    stockSync: 'synced',
    platformStock: r.stock ?? null,
    lastPushedAt: null,
    lastPushedPrice: null,
    version: 1,
    ...over,
  };
}

const shopRecord = (s: MockShop) => ({ createdBy: null as string | null, id: s.id });

/** Bộ ba ký tự theo cách của pg_trgm: chữ thường, mỗi từ đệm hai dấu cách đầu và một dấu cách cuối */
function trigrams(text: string): Set<string> {
  const set = new Set<string>();
  for (const word of text.toLowerCase().normalize('NFC').match(/[\p{L}\p{N}]+/gu) ?? []) {
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i += 1) set.add(padded.slice(i, i + 3));
  }
  return set;
}

/** similarity() của pg_trgm: số bộ ba chung chia số bộ ba của cả hai */
export function trigramSimilarity(a: string, b: string): number {
  const x = trigrams(a);
  const y = trigrams(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared += 1;
  return shared / (x.size + y.size - shared);
}

const NAME_MATCH_MIN = 0.4;

/**
 * Gợi ý ghép lần đầu (§18.7.5): mọi SKU sàn chưa ghép, kể cả không tìm được (`none`).
 * SKU người bán trùng SKU Commerio thắng; không thì so tên sàn với tên sản phẩm kèm nhãn biến thể, nhận khi ≥ 0,4.
 * Biến thể đã ghép listing khác của gian hàng không được gợi ý.
 */
function setupSuggestions(shop: MockShop): Pick<ShopSetupPreview, 'suggestions' | 'unmatchedRemote'> {
  const listed = new Set(channel.listings.filter((l) => l.shopId === shop.id).map((l) => l.variantId));
  const variants = sellableVariants(shop.companyId).filter(({ variant }) => !listed.has(variant.id));
  const suggestions: SetupSuggestion[] = [];
  for (const r of channel.remoteSkus[shop.id] ?? []) {
    if (channel.listings.some((l) => l.shopId === shop.id && l.externalSkuId === r.externalSkuId)) continue;
    const base = {
      externalSkuId: r.externalSkuId,
      title: r.title,
      imageUrl: r.imageUrl ?? null,
      status: r.status ?? ('live' as const),
      platformStock: r.stock ?? 0,
    };
    const bySku = variants.find(({ variant }) => r.sellerSku && variant.sku === r.sellerSku);
    let best: { id: string; sku: string; score: number } | null = null;
    if (!bySku) {
      for (const { variant } of variants) {
        const label = variantLabel(shop.companyId, variant.id);
        const score = trigramSimilarity(r.title, `${label.productName} ${label.attributesLabel}`);
        if (score >= NAME_MATCH_MIN && (!best || score > best.score)) best = { id: variant.id, sku: variant.sku, score };
      }
    }
    if (bySku) {
      const v = bySku.variant;
      suggestions.push({ ...base, match: 'sku', score: null, variantId: v.id, sku: v.sku, available: availableFor(shop.companyId, v.id) });
    } else if (best) {
      suggestions.push({
        ...base,
        match: 'name',
        score: Math.round(best.score * 100) / 100,
        variantId: best.id,
        sku: best.sku,
        available: availableFor(shop.companyId, best.id),
      });
    } else {
      suggestions.push({ ...base, match: 'none', score: null, variantId: null, sku: null, available: null });
    }
  }
  return { suggestions, unmatchedRemote: suggestions.filter((x) => x.match === 'none').length };
}

/** Một dòng đã quyết ghép: SKU sàn, biến thể người dùng chọn và số tồn hai bên */
interface DecidedLine {
  externalSkuId: string;
  variantId: string;
  sku: string;
  available: number;
  platformStock: number;
}

/** Kiểm kê đầu kỳ: phiếu kiểm kê nháp cho các SKU mà số trên sàn khác khả dụng, kho đếm lại rồi gửi duyệt */
function openingStocktake(actor: CompanyActor, shop: MockShop, lines: DecidedLine[], at: string): MockStockDoc {
  const doc: MockStockDoc = {
    id: rid('sd'),
    companyId: shop.companyId,
    number: nextDocNumber(shop.companyId, 'stocktake'),
    type: 'stocktake',
    kind: 'manual',
    status: 'draft',
    area: 'stock',
    note: `Kiểm kê đầu kỳ khi kết nối ${shop.shopName}: ${lines
      .map((l) => `${l.sku} sàn ${l.platformStock}, Commerio ${l.available}`)
      .join('; ')}`,
    orderId: null,
    source: null,
    claimFlag: false,
    lines: lines.map((l) => {
      const bookQty = inventory.levelOf(shop.companyId, l.variantId).onHand;
      return { variantId: l.variantId, quantity: 0, counted: bookQty, bookQty, unitCost: null };
    }),
    createdBy: actor.account.id,
    createdAt: at,
    postedBy: null,
    postedAt: null,
    version: 1,
    statusHistory: [
      { at, from: null, to: 'draft', by: { id: actor.account.id, name: actor.account.fullName }, source: 'user' },
    ],
    followUps: [],
    rejectDecision: null,
  };
  inventory.docs.push(doc);
  return doc;
}

/** Kết nối lại: tạo lại listing bị gỡ do ngắt, chạy việc trong hàng chờ, kéo đơn từ lần kéo cuối */
function catchUp(shop: MockShop): ShopReconnectSummary {
  let relisted = 0;
  for (const l of channel.listings) {
    if (l.shopId !== shop.id) continue;
    if (l.status === 'delisted' && l.delistedByDisconnect) {
      const variant = sellableVariant(shop.companyId, l.variantId);
      l.delistedByDisconnect = false;
      if (!variant || variant.variant.businessStatus === 'archived') continue;
      settlePush(shop, l, hidesListings(variant.variant.businessStatus));
      l.version += 1;
      relisted += 1;
    } else if (onPlatform(l.status) && l.stockSync === 'pending') {
      syncStock(l);
      l.version += 1;
    }
  }
  const summary = { pulledFrom: shop.lastOrderSyncAt ?? null, relisted, jobsRun: shop.pendingJobs };
  shop.pendingJobs = 0;
  shop.lastOrderSyncAt = db.now();
  return summary;
}

export const listingEntity = (shop: MockShop, sku: string, id: string) => ({
  type: 'channel.channel_listings',
  id,
  label: `${shop.shopName}: ${sku}`,
});

/** Gian hàng của công ty theo :id, 404 nếu không có (công ty khác cũng là 404) */
export function ownShop(id: unknown, companyId: string): { ok: true; value: MockShop } | { ok: false; response: Response } {
  const shop = db.shops.find((s) => s.id === id && s.companyId === companyId);
  return shop ? { ok: true, value: shop } : { ok: false, response: problem(404, 'Không tìm thấy gian hàng') };
}

/** Danh mục Commerio đã ghép với danh mục sàn ở gian hàng chưa (FE#146) */
export function categoryMapped(shopId: string, categoryId: string) {
  return channel.categoryMaps.some((m) => m.shopId === shopId && m.categoryId === categoryId);
}

export function sellableVariant(companyId: string, variantId: unknown) {
  return sellableVariants(companyId).find(({ variant }) => variant.id === variantId);
}

// ---------- Sàn giả lập: sự kiện gian hàng và listing (FE#58) ----------

const SKU_PARAM = { key: 'sku', label: 'SKU', placeholder: 'Bỏ trống: mọi listing hợp lệ' };

/** Listing của gian hàng đang ở một trong các trạng thái, lọc theo SKU (Commerio hoặc SKU người bán trên sàn) */
function pickListings(shop: MockShop | null, sku: string | undefined, statuses: ListingStatus[], what: string) {
  if (!shop) throw new Error('Chọn gian hàng');
  const key = sku?.trim().toLowerCase();
  const found = channel.listings.filter((l) => {
    if (l.shopId !== shop.id || !statuses.includes(l.status)) return false;
    if (!key) return true;
    const sellerSku = channel.remoteSkus[shop.id]?.find((r) => r.externalSkuId === l.externalSkuId)?.sellerSku;
    return skuOf(shop.companyId, l.variantId).toLowerCase() === key || sellerSku?.toLowerCase() === key;
  });
  if (!found.length) throw new Error(`Không có listing ${what}${key ? ` với SKU ${sku}` : ''}`);
  return { shop, found };
}

/** Sàn duyệt theo sản phẩm: mọi SKU cùng mã sản phẩm sàn đang chờ duyệt đi cùng */
function withSiblings(shop: MockShop, picked: MockListing[]) {
  const products = new Set(picked.map((l) => l.externalProductId));
  return channel.listings.filter(
    (l) => l.shopId === shop.id && l.status === 'under_review' && products.has(l.externalProductId),
  );
}

const skusOf = (shop: MockShop, ls: MockListing[]) => ls.map((l) => skuOf(shop.companyId, l.variantId)).join(', ');

function bump(l: MockListing, patch: Partial<MockListing>) {
  Object.assign(l, patch, { version: l.version + 1 });
}

// Sàn thu hồi quyền: Shopee/Lazada refresh token hết hạn, Shopify webhook app/uninstalled
registerMarketplaceEvent({
  type: 'shop.deauthorized',
  label: 'Sàn thu hồi quyền',
  description: 'Token hết hạn hoặc chủ shop gỡ ứng dụng trên sàn. Việc đẩy tồn xếp vào hàng chờ đến khi kết nối lại.',
  group: 'Gian hàng',
  needsShop: true,
  run({ shop }) {
    if (!shop) throw new Error('Chọn gian hàng');
    if (!shopUsable(shop.status)) throw new Error('Chỉ gian hàng đang kết nối mới mất quyền được');
    shop.status = 'needs_reauth';
    shop.tokenExpiringSoon = false;
    shop.accessExpiresAt = new Date().toISOString();
    if (shop.refreshExpiresAt) shop.refreshExpiresAt = shop.accessExpiresAt;
    for (const l of channel.listings) {
      if (l.shopId !== shop.id || !onPlatform(l.status) || l.stockSync === 'pending') continue;
      bump(l, { stockSync: 'pending' });
      shop.pendingJobs += 1;
    }
    shop.version += 1;
    shop.updatedAt = new Date().toISOString();
    return `${shop.shopName} chuyển sang cần kết nối lại, ${shop.pendingJobs} việc đang chờ`;
  },
});

registerMarketplaceEvent({
  type: 'shop.outage',
  label: 'Sàn lỗi tạm (bật/tắt)',
  description: 'Bật: đẩy listing nằm ở Đang đẩy và thử lại. Tắt: các listing đang đẩy được sàn nhận.',
  group: 'Listing',
  needsShop: true,
  run({ shop }) {
    if (!shop) throw new Error('Chọn gian hàng');
    shop.outage = !shop.outage;
    if (shop.outage) return `${shop.shopName}: sàn đang lỗi tạm`;
    const pending = channel.listings.filter((l) => l.shopId === shop.id && l.status === 'pushing');
    for (const l of pending) {
      const variant = sellableVariant(shop.companyId, l.variantId)?.variant;
      settlePush(shop, l, variant ? hidesListings(variant.businessStatus) : false);
      l.version += 1;
    }
    return `${shop.shopName}: sàn hoạt động lại${pending.length ? `, sàn nhận ${pending.length} listing đang đẩy` : ''}`;
  },
});

registerMarketplaceEvent({
  type: 'listing.push_timeout',
  label: 'Hết thời gian thử lại',
  description: 'Thử lại 5 lần trong 30 phút vẫn lỗi: listing chuyển Lỗi đẩy.',
  group: 'Listing',
  needsShop: true,
  param: SKU_PARAM,
  run({ shop, params }) {
    const { found } = pickListings(shop, params.sku, ['pushing'], 'đang đẩy');
    for (const l of found) {
      bump(l, { status: 'push_failed', pushAttempts: 5, pushError: 'Sàn không phản hồi sau 5 lần thử trong 30 phút' });
    }
    return `${skusOf(shop!, found)}: lỗi đẩy`;
  },
});

registerMarketplaceEvent({
  type: 'listing.approved',
  label: 'Sàn duyệt listing',
  description: 'Lazada QC, TikTok duyệt sản phẩm: mọi SKU cùng sản phẩm chuyển Đang bán.',
  group: 'Listing',
  needsShop: true,
  platforms: ['lazada', 'tiktok'],
  param: SKU_PARAM,
  run({ shop, params }) {
    const { found } = pickListings(shop, params.sku, ['under_review'], 'chờ duyệt');
    const all = withSiblings(shop!, found);
    for (const l of all) bump(l, { status: 'live' });
    return `${skusOf(shop!, all)}: sàn đã duyệt`;
  },
});

registerMarketplaceEvent({
  type: 'listing.rejected',
  label: 'Sàn từ chối listing',
  description: 'Sàn từ chối sản phẩm kèm lý do; sửa rồi đẩy lại.',
  group: 'Listing',
  needsShop: true,
  platforms: ['lazada', 'tiktok'],
  param: SKU_PARAM,
  run({ shop, params }) {
    const { found } = pickListings(shop, params.sku, ['under_review'], 'chờ duyệt');
    const all = withSiblings(shop!, found);
    for (const l of all) bump(l, { status: 'rejected', rejectReason: 'Thiếu thông tin chất liệu trong mô tả sản phẩm' });
    return `${skusOf(shop!, all)}: sàn từ chối`;
  },
});

registerMarketplaceEvent({
  type: 'listing.hold',
  label: 'Sàn khoá listing',
  description: 'Sàn tạm khoá vì nghi vi phạm; không đẩy được cho đến khi sàn gỡ khoá.',
  group: 'Listing',
  needsShop: true,
  param: SKU_PARAM,
  run({ shop, params }) {
    const { found } = pickListings(shop, params.sku, ['live', 'hidden'], 'đang bán');
    for (const l of found) bump(l, { status: 'platform_hold', hiddenBy: null });
    return `${skusOf(shop!, found)}: sàn khoá`;
  },
});

registerMarketplaceEvent({
  type: 'listing.release',
  label: 'Sàn gỡ khoá listing',
  description: 'Sàn gỡ khoá: listing bán lại.',
  group: 'Listing',
  needsShop: true,
  param: SKU_PARAM,
  run({ shop, params }) {
    const { found } = pickListings(shop, params.sku, ['platform_hold'], 'bị khoá');
    for (const l of found) {
      bump(l, { status: 'live' });
      const variant = sellableVariant(shop!.companyId, l.variantId)?.variant;
      if (variant && hidesListings(variant.businessStatus)) hideListing(shop!, l);
    }
    return `${skusOf(shop!, found)}: sàn gỡ khoá`;
  },
});

/** Sàn đã cấp token (qua OAuth hoặc dán token): nối vào gian hàng cũ (200) hoặc tạo mới (201) */
function attachGranted(
  actor: CompanyActor,
  platform: Marketplace,
  granted: { externalShopId: string; shopName: string },
  targetShopId: string | null,
) {
  const companyId = actor.companyId;
  if (targetShopId) {
    const target = db.shops.find((s) => s.id === targetShopId && s.companyId === companyId);
    if (target && target.externalShopId !== granted.externalShopId) {
      // §18.4: kèm gian hàng đang kết nối lại (expected) và gian hàng vừa đăng nhập (actual)
      return problem(409, 'Gian hàng không khớp', {
        code: 'shop_mismatch',
        detail: `Bạn vừa uỷ quyền gian hàng ${granted.shopName}, không phải ${target.shopName}.`,
        expected: { name: target.shopName, externalShopId: target.externalShopId },
        actual: { name: granted.shopName, externalShopId: granted.externalShopId },
      });
    }
  }
  const elsewhere = db.shops.find(
    (s) =>
      s.companyId !== companyId &&
      s.platform === platform &&
      s.externalShopId === granted.externalShopId &&
      s.status !== 'disconnected',
  );
  if (elsewhere) {
    return problem(409, 'Gian hàng đã kết nối ở công ty khác', { code: 'shop_connected_elsewhere' });
  }
  const idx = db.shops.findIndex(
    (s) => s.companyId === companyId && s.externalShopId === granted.externalShopId,
  );
  const expires = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const refreshExpires = platform === 'mock' ? null : new Date(Date.now() + REFRESH_TTL_MS).toISOString();
  if (idx !== -1) {
    const current = db.shops[idx];
    const before = shopSnapshot(current);
    const previousStatus = current.status;
    let reconnect: ShopReconnectSummary | null = null;
    // Dùng lại bản ghi cũ: active, connecting chỉ gia hạn token; mất quyền hoặc đã ngắt thì đi qua kết nối lại
    if (current.status === 'needs_reauth' || current.status === 'disconnected') {
      const step = checkTransition(shopMachine, current.status, 'reconnect', actor, shopRecord(current));
      if (!step.ok) return step.response;
      current.status = step.value;
      reconnect = catchUp(current);
    }
    Object.assign(current, {
      accessExpiresAt: expires,
      refreshExpiresAt: refreshExpires,
      authExpiresAt: null,
      tokenExpiringSoon: false,
      updatedAt: db.now(),
      version: current.version + 1,
    });
    writeCompanyLog(actor, 'update', shopEntity(current), before, shopSnapshot(current));
    return HttpResponse.json<ShopConnectionResult>({
      shop: toShop(current),
      created: false,
      reconnect,
      previousStatus,
      remoteSkuCount: channel.remoteSkus[current.id]?.length ?? 0,
    });
  }
  const shop: MockShop = {
    id: rid('shp'),
    companyId,
    platform,
    capabilities: mockCapabilities[platform],
    authExpiresAt: null,
    tokenExpiringSoon: false,
    externalShopId: granted.externalShopId,
    shopName: granted.shopName,
    region: 'VN',
    // Chưa bán được cho đến khi xong thiết lập lần đầu
    status: 'connecting',
    accessExpiresAt: expires,
    refreshExpiresAt: refreshExpires,
    orderCutoffAt: null,
    pendingJobs: 0,
    createdAt: db.now(),
    updatedAt: db.now(),
    version: 1,
  };
  db.shops.unshift(shop);
  channel.seedRemoteForNewShop(shop.id, platform);
  writeCompanyLog(actor, 'create', shopEntity(shop), null, shopSnapshot(shop));
  return HttpResponse.json<ShopConnectionResult>(
    {
      shop: toShop(shop),
      created: true,
      reconnect: null,
      previousStatus: null,
      remoteSkuCount: channel.remoteSkus[shop.id]?.length ?? 0,
    },
    { status: 201 },
  );
}

export const shopHandlers = [
  http.get(`${API}/channel/shops/platforms`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopView);
    if (!guard.ok) return guard.response;
    return HttpResponse.json<ShopPlatformList>({ items: mockPlatforms });
  }),
  http.get(`${API}/channel/shops`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopView);
    if (!guard.ok) return guard.response;
    const items = db.shops.filter((s) => s.companyId === guard.value.companyId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return HttpResponse.json<ShopList>({ items: items.map(toShop) });
  }),

  http.get(`${API}/channel/shops/:platform/authorize-url`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopConnect);
    if (!guard.ok) return guard.response;
    const platform = params.platform as Marketplace;
    if (!MARKETPLACES.includes(platform)) return marketplaceUnsupported(platform);
    const shopId = new URL(request.url).searchParams.get('shopId');
    let shop: MockShop | null = null;
    if (shopId) {
      const found = ownShop(shopId, guard.value.companyId);
      if (!found.ok) return found.response;
      shop = found.value;
      if (shop.platform !== platform) return marketplaceUnsupported(platform);
    }
    const state = rid('st');
    channel.oauthStates.set(state, {
      companyId: guard.value.companyId,
      accountId: guard.value.account.id,
      platform,
      shopId: shop?.id ?? null,
    });
    // Sàn thật trả trang uỷ quyền của sàn; mock dùng trang sàn giả lập trong SPA
    const search = new URLSearchParams({
      platform,
      state,
      redirect_uri: `${window.location.origin}${appPath(`channel/${platform}/callback`)}`,
    });
    if (shop) {
      search.set('shop_id', shop.externalShopId);
      search.set('shop_name', shop.shopName);
    }
    // Trang giả lập trả về redirect_uri đúng tham số của sàn thật (TikTok: app_key, locale, shop_region; auth_denied)
    const quirks = mockOAuthReturn[platform];
    search.set('deny_params', new URLSearchParams(quirks?.deny ?? DEFAULT_OAUTH_DENY).toString());
    if (quirks) search.set('approve_params', new URLSearchParams(quirks.approve).toString());
    return HttpResponse.json<ShopAuthorizeUrl>({ url: `${appPath('mock-oauth/authorize')}?${search}` });
  }),

  http.post(`${API}/channel/shops/:platform/callback`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopConnect);
    if (!guard.ok) return guard.response;
    const body = (await request.json()) as ShopCallbackInput;
    const pending = channel.oauthStates.get(body.state);
    const companyId = guard.value.companyId;
    // §18.7.4: state hợp lệ nhưng đang mở công ty khác công ty bắt đầu kết nối: bỏ token, không ghi gian hàng
    if (pending && pending.companyId !== companyId && pending.accountId === guard.value.account.id && pending.platform === params.platform) {
      channel.oauthStates.delete(body.state);
      const ref = (id: string) => ({ id, name: db.companies.find((c) => c.id === id)?.name ?? id });
      return problem(409, 'Đang mở công ty khác', {
        code: 'company_mismatch',
        expected: ref(pending.companyId),
        actual: ref(companyId),
      });
    }
    if (
      !pending ||
      pending.accountId !== guard.value.account.id ||
      pending.platform !== params.platform
    ) {
      return problem(422, 'Phiên kết nối không hợp lệ', {
        code: 'oauth_state_invalid',
        detail: 'Phiên kết nối đã hết hạn hoặc không thuộc công ty đang chọn.',
      });
    }
    channel.oauthStates.delete(body.state);
    const granted = decodeMockCode(body.params?.code ?? '');
    if (!granted) return problem(400, 'Mã uỷ quyền không hợp lệ', { code: 'invalid_code' });

    const platform = pending.platform as Marketplace;
    const grants = body.params.main_account_id && !pending.shopId
      ? [granted, { externalShopId: `${granted.externalShopId}-2`, shopName: `${granted.shopName} 2` }]
      : [granted];
    const shops: ShopConnectionResult[] = [];
    for (const grant of grants) {
      const response = attachGranted(guard.value, platform, grant, pending.shopId);
      if (!response.ok) return response;
      shops.push(await response.json() as ShopConnectionResult);
    }
    // §18.7.4: gốc là shop, created, reconnect của shops[0]; previousStatus, remoteSkuCount chỉ ở shops[]
    const { shop, created, reconnect } = shops[0];
    return HttpResponse.json<ShopCallbackResult>({ shop, created, reconnect, shops }, { status: shops.some((s) => s.created) ? 201 : 200 });
  }),

  // Shop thử không đi OAuth được: dán token lấy trên console của sàn. Mock: token "sai" bị sàn từ chối
  http.post(`${API}/channel/shops/:platform/token`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopConnect);
    if (!guard.ok) return guard.response;
    const platform = params.platform as Marketplace;
    // Sàn nào cho dán token theo `methods` của danh sách sàn, không viết cứng mã sàn
    if (!mockAllowsMethod(platform, 'token')) return marketplaceUnsupported(platform);
    const body = (await request.json()) as Partial<ShopTokenInput>;
    const accessToken = body.accessToken?.trim() ?? '';
    if (!accessToken || accessToken.length > 2000) {
      return problem(422, 'Dữ liệu không hợp lệ', {
        code: 'validation_failed',
        errors: { accessToken: 'Nhập access token' },
      });
    }
    if (accessToken === 'sai') return problem(409, 'Sàn từ chối yêu cầu', { code: 'marketplace_rejected' });
    const seller = accessToken.slice(-6).toUpperCase();
    const response = attachGranted(guard.value, platform, { externalShopId: `TKN-${seller}`, shopName: `Shop thử ${seller}` }, null);
    if (!response.ok) return response;
    // §18.4: kết quả dán token cùng dạng với callback, có shops[]
    const result = (await response.json()) as ShopConnectionResult;
    return HttpResponse.json<ShopCallbackResult>(
      { shop: result.shop, created: result.created, reconnect: result.reconnect, shops: [result] },
      { status: response.status },
    );
  }),

  http.get(`${API}/channel/shops/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopView);
    if (!guard.ok) return guard.response;
    const found = ownShop(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    return HttpResponse.json<Shop>(toShop(found.value));
  }),

  http.post(`${API}/channel/shops/:id/disconnect`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopDisconnect);
    if (!guard.ok) return guard.response;
    const idx = findShop(params.id, guard.value.companyId);
    if (idx === -1) return problem(404, 'Không tìm thấy gian hàng');
    const { version, zeroStock = false } = (await request.json()) as ShopDisconnectInput;
    const current = db.shops[idx];
    if (version !== current.version) {
      return versionConflict(toShop(current), 'Gian hàng vừa được người khác sửa.');
    }
    if (current.status === 'disconnected') return HttpResponse.json<Shop>(toShop(current));
    const step = checkTransition(shopMachine, current.status, 'disconnect', guard.value, shopRecord(current));
    if (!step.ok) return step.response;
    // §18.6.1, commerio-backend#207: còn đơn chưa xong thì không cho ngắt, kèm số đơn
    const pending = openOrdersOf(current.id);
    if (pending.length > 0) {
      // §18.7.8: tối đa 20 đơn, cũ nhất trước
      const orders: ShopOpenOrder[] = [...pending]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, 20)
        .map((o) => ({ id: o.id, code: o.code, externalOrderId: o.externalOrderId ?? null }));
      return problem(409, 'Gian hàng còn đơn chưa xong', {
        code: 'shop_has_open_orders',
        openOrders: pending.length,
        orders,
      });
    }
    if (zeroStock && !usable(current)) {
      return problem(422, 'Không đặt tồn về 0 được', {
        code: 'zero_stock_unavailable',
        errors: { zeroStock: 'Gian hàng mất uỷ quyền, không gọi được sàn để đặt tồn về 0' },
      });
    }
    const before = shopSnapshot(current);
    // Ngắt mềm: giữ gian hàng, đơn và ghép SKU để xem lại; listing coi như gỡ, kết nối lại thì tạo lại
    for (const l of channel.listings) {
      if (l.shopId !== current.id || !onPlatform(l.status)) continue;
      l.status = 'delisted';
      l.delistedByDisconnect = true;
      l.hiddenBy = null;
      if (zeroStock) l.platformStock = 0;
      l.version += 1;
    }
    db.shops[idx] = {
      ...current,
      status: step.value,
      accessExpiresAt: null,
      refreshExpiresAt: null,
      authExpiresAt: null,
      tokenExpiringSoon: false,
      pendingJobs: 0,
      updatedAt: db.now(),
      version: current.version + 1,
    };
    writeCompanyLog(guard.value, 'update', shopEntity(db.shops[idx]), before, {
      ...shopSnapshot(db.shops[idx]),
      zeroStock,
    });
    return HttpResponse.json<Shop>(toShop(db.shops[idx]));
  }),

  http.post(`${API}/channel/shops/:id/orders/pull`, async ({ params, request }) => {
    await delay(LATENCY * 2);
    const guard = requireCompany(request, PERMISSIONS.shopSync);
    if (!guard.ok) return guard.response;
    const idx = findShop(params.id, guard.value.companyId);
    if (idx === -1) return problem(404, 'Không tìm thấy gian hàng');
    if (!usable(db.shops[idx])) return shopNotConnected(db.shops[idx]);
    db.shops[idx] = { ...db.shops[idx], lastOrderSyncAt: db.now(), updatedAt: db.now() };
    return HttpResponse.json<{ pulled: number; created: number; updated: number }>({ pulled: 0, created: 0, updated: 0 });
  }),

  /** Thiết lập lần đầu (sơ đồ C1): gợi ý ghép listing có sẵn và số tồn hai bên */
  http.get(`${API}/channel/shops/:id/setup`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopConnect);
    if (!guard.ok) return guard.response;
    const found = ownShop(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    const shop = found.value;
    if (shop.status !== 'connecting') {
      return problem(409, 'Gian hàng đã thiết lập', { code: 'invalid_transition', current: shop.status });
    }
    return HttpResponse.json<ShopSetupPreview>({
      ...setupSuggestions(shop),
      // Mock: mốc đề xuất là lúc kết nối gian hàng
      proposedCutoffAt: shop.createdAt,
      firstShopOfCompany: firstShopOfCompany(shop),
      // Gian hàng mẫu ít SKU nên luôn so tên được
      nameMatchSkipped: false,
    });
  }),

  http.post(`${API}/channel/shops/:id/setup`, async ({ params, request }) => {
    await delay(LATENCY * 2);
    const guard = requireCompany(request, PERMISSIONS.shopConnect);
    if (!guard.ok) return guard.response;
    const found = ownShop(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    const shop = found.value;
    const step = checkTransition(shopMachine, shop.status, 'finish_setup', guard.value, shopRecord(shop));
    if (!step.ok) return step.response;
    const body = (await request.json()) as Partial<ShopSetupInput>;
    const errors: Record<string, string> = {};
    // §18.6.2: mốc kéo đơn do BE đặt (orderCutoffAt trong body bị bỏ qua)
    if (body.openingStock !== 'push' && body.openingStock !== 'stocktake') errors.openingStock = 'Chọn cách xử lý tồn đầu kỳ';
    else if (body.openingStock === 'push' && firstShopOfCompany(shop)) {
      errors.openingStock = 'Gian hàng đầu tiên của công ty phải kiểm kê đầu kỳ';
    }
    const days = body.returnWindowDays;
    if (shop.capabilities.returnWindow === 'days' && (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 60)) {
      errors.returnWindowDays = 'Số ngày đổi trả là số nguyên từ 1 đến 60';
    }
    const { suggestions } = setupSuggestions(shop);
    const legacy = (body as { externalSkuIds?: unknown }).externalSkuIds;
    const picked: DecidedLine[] = [];
    if (legacy !== undefined && body.decisions !== undefined) {
      errors.decisions = 'Chỉ gửi decisions, không gửi kèm externalSkuIds';
    } else if (!Array.isArray(body.decisions)) {
      errors.decisions = 'Thiếu quyết định ghép cho các SKU sàn';
    } else {
      // §18.7.5: SKU có trong gợi ý; biến thể thuộc công ty, chưa ghép listing khác của gian hàng, không lặp
      const listed = new Set(channel.listings.filter((l) => l.shopId === shop.id).map((l) => l.variantId));
      const seenSku = new Set<string>();
      const seenVariant = new Set<string>();
      body.decisions.forEach((d: SetupDecision, i) => {
        const key = `decisions.${i}`;
        const row = suggestions.find((x) => x.externalSkuId === d?.externalSkuId);
        if (!row || seenSku.has(row.externalSkuId)) {
          errors[key] = row ? 'SKU sàn này bị lặp' : 'SKU sàn không còn để ghép';
          return;
        }
        seenSku.add(row.externalSkuId);
        if (d.variantId === null) return;
        const target = sellableVariant(shop.companyId, d.variantId);
        if (!target) errors[key] = 'Không tìm thấy biến thể';
        else if (listed.has(d.variantId)) errors[key] = 'Biến thể đã ghép với SKU sàn khác của gian hàng';
        else if (seenVariant.has(d.variantId)) errors[key] = 'Biến thể đã chọn ở dòng khác';
        else {
          seenVariant.add(d.variantId);
          picked.push({
            externalSkuId: row.externalSkuId,
            variantId: d.variantId,
            sku: target.variant.sku,
            available: availableFor(shop.companyId, d.variantId),
            platformStock: row.platformStock,
          });
        }
      });
    }
    if (Object.keys(errors).length) return problem(422, 'Dữ liệu không hợp lệ', { code: 'validation_failed', errors });
    // §18.6.2, R13: BE#198 chưa có createOpeningStocktake (commerio-backend#245) nên kiểm kê đầu kỳ trả 501, không ghi gì.
    // Mock chỉ trả 501 ở gian hàng đầu tiên của công ty để vẫn diễn được luồng kiểm kê ở gian hàng sau
    if (body.openingStock === 'stocktake' && firstShopOfCompany(shop)) {
      return problem(501, 'Chưa làm', {
        code: 'not_implemented',
        detail: 'createOpeningStocktake chưa làm (commerio-backend#245, Bình)',
        issue: 'commerio-backend#245',
        owner: 'Bình',
      });
    }

    const at = db.now();
    const remote = channel.remoteSkus[shop.id] ?? [];
    for (const x of picked) {
      const r = remote.find((y) => y.externalSkuId === x.externalSkuId)!;
      const variant = sellableVariant(shop.companyId, x.variantId)!.variant;
      const l = newListing(shop, x.variantId, r, { platformStock: x.platformStock });
      // Listing có sẵn đang bán; đẩy tồn ngay, hoặc chờ phiếu kiểm kê ghi sổ
      if (body.openingStock === 'push') syncStock(l);
      else l.stockSync = x.platformStock === x.available ? 'synced' : 'pending';
      if (hidesListings(variant.businessStatus)) hideListing(shop, l);
      channel.listings.push(l);
    }
    const drifted = picked.filter((x) => x.platformStock !== x.available);
    const doc = body.openingStock === 'stocktake' && drifted.length ? openingStocktake(guard.value, shop, drifted, at) : null;
    const before = shopSnapshot(shop);
    const setupRun: MockSetupRun = {
      mode: body.openingStock as MockSetupRun['mode'],
      at: Date.now(),
      unmatchedCount: suggestions.length - picked.length,
    };
    Object.assign(shop, {
      setupRun,
      statusChangedAt: at,
      status: step.value,
      orderCutoffAt: shop.createdAt,
      returnWindowDays: shop.capabilities.returnWindow === 'days' ? days : null,
      openingStocktakeDocId: doc?.id ?? null,
      lastOrderSyncAt: at,
      updatedAt: at,
      version: shop.version + 1,
    });
    writeCompanyLog(guard.value, 'update', shopEntity(shop), before, {
      ...shopSnapshot(shop),
      matched: picked.map((x) => x.sku),
      orderCutoffAt: shop.orderCutoffAt,
      stocktake: doc?.number ?? null,
    });
    const result: ShopSetupResult = { shop: toShop(shop), matched: picked.length, stocktakeNumber: doc?.number ?? null };
    return HttpResponse.json<ShopSetupResult>(result);
  }),

  http.get(`${API}/channel/shops/:id/listings`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopView);
    if (!guard.ok) return guard.response;
    const found = ownShop(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    const shop = found.value;
    const rows: ListingRow[] = sellableVariants(shop.companyId).map(({ product, variant }) => {
      const l = channel.listings.find((x) => x.shopId === shop.id && x.variantId === variant.id);
      return {
        variantId: variant.id,
        productId: product.id,
        productName: product.name,
        sku: variant.sku,
        attributesLabel: variantAttributes(shop.companyId, variant.valueIds)
          .map((a) => a.value)
          .join(' / '),
        thumbnailUrl: product.imageFileIds[0] ? fileUrl(product.imageFileIds[0]) : null,
        ...shopPrice(shop, variant.id),
        listing: l ? toListing(l) : null,
      };
    });
    return HttpResponse.json<{ items: ListingRow[] }>({ items: rows });
  }),

  http.get(`${API}/channel/shops/:id/remote-skus`, async ({ params, request }) => {
    await delay(LATENCY * 2);
    const guard = requireCompany(request, PERMISSIONS.shopView);
    if (!guard.ok) return guard.response;
    const found = ownShop(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    const shop = found.value;
    if (!usable(shop)) return shopNotConnected(shop);
    const skus: RemoteSku[] = (channel.remoteSkus[shop.id] ?? []).map((r) => ({
      ...r,
      matchedVariantId:
        channel.listings.find((l) => l.shopId === shop.id && l.externalSkuId === r.externalSkuId)?.variantId ??
        null,
    }));
    return HttpResponse.json<{ items: RemoteSku[] }>({ items: skus });
  }),

  http.put(`${API}/channel/shops/:id/listings/:variantId`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.listingManage);
    if (!guard.ok) return guard.response;
    const found = ownShop(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    const shop = found.value;
    const target = sellableVariant(shop.companyId, params.variantId);
    if (!target) return problem(404, 'Không tìm thấy biến thể');
    if (!usable(shop)) return shopNotConnected(shop);
    const body = (await request.json()) as ListingMatchInput;
    const sku = (channel.remoteSkus[shop.id] ?? []).find((r) => r.externalSkuId === body.externalSkuId);
    if (!sku) {
      return problem(422, 'SKU sàn không hợp lệ', {
        errors: { externalSkuId: 'Không tìm thấy SKU này trên sàn' },
      });
    }
    const idx = channel.listings.findIndex((l) => l.shopId === shop.id && l.variantId === target.variant.id);
    const existing = idx === -1 ? null : channel.listings[idx];
    if ((existing?.version ?? null) !== (body.version ?? null)) {
      return versionConflict(existing && toListing(existing), 'Ghép SKU của biến thể vừa được người khác sửa.');
    }
    // Ràng buộc unique(company_id, external_sku_id)
    const taken = channel.listings.find(
      (l) =>
        l.companyId === shop.companyId &&
        l.externalSkuId === sku.externalSkuId &&
        l.variantId !== target.variant.id,
    );
    if (taken) {
      return problem(409, 'SKU sàn đã được ghép', {
        code: 'sku_taken',
        detail: `SKU sàn ${sku.sellerSku || sku.externalSkuId} đang ghép với biến thể ${skuOf(shop.companyId, taken.variantId)}.`,
      });
    }
    const same = existing?.externalSkuId === sku.externalSkuId;
    // SKU sàn đã có sẵn trên sàn: ghép xong là đang bán (sơ đồ C2)
    const next: MockListing =
      same && existing
        ? { ...existing, version: existing.version + 1 }
        : newListing(shop, target.variant.id, sku, {
            id: existing?.id ?? rid('lst'),
            version: (existing?.version ?? 0) + 1,
          });
    if (!same && hidesListings(target.variant.businessStatus)) hideListing(shop, next);
    if (existing) channel.listings[idx] = next;
    else channel.listings.push(next);
    writeCompanyLog(
      guard.value,
      existing ? 'update' : 'create',
      listingEntity(shop, target.variant.sku, next.id),
      existing ? { externalSkuId: existing.externalSkuId } : null,
      { externalSkuId: next.externalSkuId, sellerSku: sku.sellerSku },
    );
    return HttpResponse.json<ChannelListing>(toListing(next));
  }),

  /** Gỡ khỏi sàn: giữ ghép để đẩy lại sau */
  http.post(`${API}/channel/shops/:id/listings/:variantId/delist`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.listingManage);
    if (!guard.ok) return guard.response;
    const found = ownShop(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    const shop = found.value;
    if (!usable(shop)) return shopNotConnected(shop);
    const l = channel.listings.find((x) => x.shopId === shop.id && x.variantId === params.variantId);
    if (!l) return problem(404, 'Biến thể chưa ghép SKU sàn');
    const { version } = (await request.json()) as { version: number };
    if (version !== l.version) return versionConflict(toListing(l), 'Listing vừa được người khác sửa.');
    const step = checkTransition(listingMachine, l.status, 'delist', guard.value, { createdBy: null, id: l.id });
    if (!step.ok) return step.response;
    const before = { status: l.status };
    Object.assign(l, { status: step.value, hiddenBy: null, platformStock: 0, version: l.version + 1 });
    writeCompanyLog(guard.value, 'update', listingEntity(shop, skuOf(shop.companyId, l.variantId), l.id), before, {
      status: l.status,
    });
    return HttpResponse.json<ChannelListing>(toListing(l));
  }),

  http.delete(`${API}/channel/shops/:id/listings/:variantId`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.listingManage);
    if (!guard.ok) return guard.response;
    const found = ownShop(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    const shop = found.value;
    if (!usable(shop)) return shopNotConnected(shop);
    const idx = channel.listings.findIndex((l) => l.shopId === shop.id && l.variantId === params.variantId);
    if (idx === -1) return problem(404, 'Biến thể chưa ghép SKU sàn');
    const existing = channel.listings[idx];
    if (staleVersion(new URL(request.url), existing.version)) {
      return versionConflict(toListing(existing), 'Ghép SKU của biến thể vừa được người khác sửa.');
    }
    channel.listings.splice(idx, 1);
    writeCompanyLog(
      guard.value,
      'delete',
      listingEntity(shop, skuOf(shop.companyId, existing.variantId), existing.id),
      { externalSkuId: existing.externalSkuId },
      null,
    );
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${API}/channel/shops/:id/listings/push`, async ({ params, request }) => {
    await delay(LATENCY * 2);
    const guard = requireCompany(request, PERMISSIONS.listingManage);
    if (!guard.ok) return guard.response;
    const found = ownShop(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    const shop = found.value;
    if (!usable(shop)) return shopNotConnected(shop);
    if (openingStocktakeOf(shop)) {
      return problem(409, 'Gian hàng chờ kiểm kê đầu kỳ', { code: 'shop_awaiting_stocktake' });
    }
    const { variantIds } = (await request.json()) as { variantIds: string[] };
    if (!Array.isArray(variantIds) || !variantIds.length) {
      return problem(422, 'Chưa chọn biến thể', { errors: { variantIds: 'Chọn ít nhất một biến thể' } });
    }
    const remoteList = (channel.remoteSkus[shop.id] ??= []);
    const results: PushResult[] = variantIds.map((variantId) => {
      const target = sellableVariant(shop.companyId, variantId);
      if (!target) {
        return { variantId, sku: variantId, outcome: 'failed', code: 'not_found', message: 'Biến thể không còn bán' };
      }
      const sku = target.variant.sku;
      const paused = hidesListings(target.variant.businessStatus);
      const { price } = shopPrice(shop, variantId);
      const l = channel.listings.find((x) => x.shopId === shop.id && x.variantId === variantId);
      if (l?.status === 'pushing') {
        return { variantId, sku, outcome: 'failed', status: l.status, code: 'push_in_progress', message: 'Đang đẩy, chờ sàn trả kết quả' };
      }
      if (l?.status === 'platform_hold') {
        return { variantId, sku, outcome: 'failed', status: l.status, code: 'platform_hold', message: 'Sàn đang khoá listing này' };
      }
      // FE#146: Lazada cần danh mục lá, danh mục Commerio của sản phẩm phải ghép trước (§18.5)
      if (shop.platform === 'lazada' && !categoryMapped(shop.id, target.product.categoryId)) {
        return { variantId, sku, outcome: 'failed', status: l?.status, code: 'category_unmapped', message: 'Danh mục chưa ghép với danh mục sàn' };
      }
      if (price === null) {
        const message = 'Chưa có giá: bảng giá gian hàng và bảng giá chuẩn đều trống';
        // Listing đã có: ghi lỗi đẩy lên listing; biến thể chưa lên sàn thì chỉ báo lại
        if (l && l.status !== 'hidden') Object.assign(l, { status: 'push_failed', pushError: message, version: l.version + 1 });
        return { variantId, sku, outcome: 'failed', status: l?.status, code: 'price_missing', message };
      }
      if (l) {
        const r = remoteList.find((x) => x.externalSkuId === l.externalSkuId);
        if (r) r.price = price;
        Object.assign(l, { lastPushedAt: db.now(), lastPushedPrice: price, version: l.version + 1 });
        // Đang ẩn: chỉ cập nhật giá, giữ ẩn
        if (l.status !== 'hidden') {
          l.status = 'pushing';
          if (shop.outage) Object.assign(l, { pushAttempts: 1, pushError: 'Sàn lỗi tạm, đang thử lại' });
          else settlePush(shop, l, paused);
        }
        return { variantId, sku, outcome: 'updated', status: l.status, externalSkuId: l.externalSkuId };
      }
      // Biến thể chưa có SKU sàn: sàn tạo sản phẩm mới và trả SKU, lưu ghép luôn
      const created: MockRemoteSku = {
        externalProductId: `${shop.id}-${target.product.id}`,
        externalSkuId: rid(`${shop.id}-sku`),
        title: [target.product.name, variantAttributes(shop.companyId, target.variant.valueIds).map((a) => a.value).join(', ')]
          .filter(Boolean)
          .join(' - '),
        sellerSku: sku,
        price,
      };
      remoteList.push(created);
      const fresh = newListing(shop, variantId, created, {
        status: 'pushing',
        lastPushedAt: db.now(),
        lastPushedPrice: price,
      });
      if (shop.outage) Object.assign(fresh, { pushAttempts: 1, pushError: 'Sàn lỗi tạm, đang thử lại' });
      else settlePush(shop, fresh, paused);
      channel.listings.push(fresh);
      return { variantId, sku, outcome: 'created', status: fresh.status, externalSkuId: created.externalSkuId };
    });
    const done = results.filter((r) => r.outcome !== 'failed');
    if (done.length) {
      writeCompanyLog(guard.value, 'update', shopEntity(shop), null, {
        pushed: done.map((r) => `${r.sku}${r.outcome === 'created' ? ' (tạo mới)' : ''}`),
      });
    }
    return HttpResponse.json<{ results: PushResult[] }>({ results });
  }),
];
