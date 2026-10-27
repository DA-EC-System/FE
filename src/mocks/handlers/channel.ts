import { http, HttpResponse, delay } from 'msw';
import { db, type MockShop } from '../db';
import type { ChannelListing, ListingMatchInput, ListingRow, Marketplace, PushResult, RemoteSku, Shop, ShopCallbackInput, ShopConnectInput } from '@/types/shop';
import * as channel from '../channelData';
import type { MockListing, MockRemoteSku } from '../channelData';
import * as pricing from '../pricingData';
import { PERMISSIONS } from '@/utils/permissions';
import { API, LATENCY, pageParams, paginate, problem, requireCompany } from './utils';
import { versionConflict, writeCompanyLog } from './identity';
import { fileUrl, rid, staleVersion, variantAttributes } from './catalog';
import { ensureStandard, sellableVariants, skuOf } from './pricing';

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
  return { ...s, listingCount: channel.listings.filter((l) => l.shopId === s.id).length };
}

export function findShop(id: unknown, companyId: string) {
  return db.shops.findIndex((s) => s.id === id && s.companyId === companyId);
}

export const MARKETPLACES: Marketplace[] = ['tiktok', 'shopee', 'lazada', 'mock'];
/** Gian hàng còn token dùng được: gọi được API sàn */
export const usable = (s: MockShop) => s.status === 'connected' || s.status === 'expiring';
export const TOKEN_TTL_MS = 90 * 24 * 3600_000;

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

export function toListing(l: MockListing): ChannelListing {
  const r = channel.remoteSkus[l.shopId]?.find((x) => x.externalSkuId === l.externalSkuId);
  return {
    id: l.id,
    externalProductId: l.externalProductId,
    externalSkuId: l.externalSkuId,
    sellerSku: r?.sellerSku ?? '',
    lastPushedAt: l.lastPushedAt,
    lastPushedPrice: l.lastPushedPrice,
    version: l.version,
  };
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

export function sellableVariant(companyId: string, variantId: unknown) {
  return sellableVariants(companyId).find(({ variant }) => variant.id === variantId);
}

export const shopHandlers = [
  http.get(`${API}/channel/shops`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    const search = (url.searchParams.get('search') ?? '').toLowerCase();
    const platform = url.searchParams.get('platform') ?? '';
    const status = url.searchParams.get('status') ?? '';

    let items = db.shops.filter((s) => s.companyId === guard.value.companyId);
    if (search) {
      items = items.filter(
        (s) =>
          s.shopName.toLowerCase().includes(search) ||
          s.externalShopId.toLowerCase().includes(search),
      );
    }
    if (platform) items = items.filter((s) => s.platform === platform);
    if (status) items = items.filter((s) => s.status === status);
    return HttpResponse.json(paginate(items.map(toShop), page, pageSize));
  }),

  http.post(`${API}/channel/shops/connect`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopConnect);
    if (!guard.ok) return guard.response;
    const body = (await request.json()) as ShopConnectInput;
    let shop: MockShop | null = null;
    if (body.shopId) {
      const found = ownShop(body.shopId, guard.value.companyId);
      if (!found.ok) return found.response;
      shop = found.value;
    }
    const platform = shop?.platform ?? body.platform;
    if (!MARKETPLACES.includes(platform)) {
      return problem(422, 'Sàn không hợp lệ', { errors: { platform: 'Chọn sàn để kết nối' } });
    }
    const state = rid('st');
    channel.oauthStates.set(state, {
      companyId: guard.value.companyId,
      accountId: guard.value.account.id,
      platform,
      shopId: shop?.id ?? null,
    });
    // Sàn thật trả trang uỷ quyền của sàn; mock dùng trang sàn giả lập trong SPA
    const params = new URLSearchParams({
      platform,
      state,
      redirect_uri: `${window.location.origin}/channel/oauth/callback`,
    });
    if (shop) {
      params.set('shop_id', shop.externalShopId);
      params.set('shop_name', shop.shopName);
    }
    return HttpResponse.json({ authorizeUrl: `/mock-oauth/authorize?${params}` });
  }),

  http.post(`${API}/channel/shops/oauth/callback`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopConnect);
    if (!guard.ok) return guard.response;
    const body = (await request.json()) as ShopCallbackInput;
    const pending = channel.oauthStates.get(body.state);
    const companyId = guard.value.companyId;
    if (!pending || pending.companyId !== companyId || pending.accountId !== guard.value.account.id) {
      return problem(400, 'Phiên kết nối không hợp lệ', {
        code: 'invalid_state',
        detail: 'Phiên kết nối đã hết hạn hoặc không thuộc công ty đang chọn.',
      });
    }
    channel.oauthStates.delete(body.state);
    const granted = decodeMockCode(body.code);
    if (!granted) return problem(400, 'Mã uỷ quyền không hợp lệ', { code: 'invalid_code' });

    const platform = pending.platform as Marketplace;
    if (pending.shopId) {
      const target = db.shops.find((s) => s.id === pending.shopId && s.companyId === companyId);
      if (target && target.externalShopId !== granted.externalShopId) {
        return problem(409, 'Gian hàng không khớp', {
          code: 'shop_mismatch',
          detail: `Bạn vừa uỷ quyền gian hàng ${granted.shopName}, không phải ${target.shopName}.`,
        });
      }
    }
    const idx = db.shops.findIndex(
      (s) => s.companyId === companyId && s.externalShopId === granted.externalShopId,
    );
    const expires = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
    if (idx !== -1) {
      const before = shopSnapshot(db.shops[idx]);
      db.shops[idx] = {
        ...db.shops[idx],
        status: 'connected',
        accessExpiresAt: expires,
        updatedAt: db.now(),
        version: db.shops[idx].version + 1,
      };
      writeCompanyLog(guard.value, 'update', shopEntity(db.shops[idx]), before, shopSnapshot(db.shops[idx]));
      return HttpResponse.json({ shop: toShop(db.shops[idx]), created: false });
    }
    const shop: MockShop = {
      id: rid('shp'),
      companyId,
      platform,
      externalShopId: granted.externalShopId,
      shopName: granted.shopName,
      region: 'VN',
      status: 'connected',
      accessExpiresAt: expires,
      createdAt: db.now(),
      updatedAt: db.now(),
      version: 1,
    };
    db.shops.unshift(shop);
    channel.remoteSkus[shop.id] ??= [];
    writeCompanyLog(guard.value, 'create', shopEntity(shop), null, shopSnapshot(shop));
    return HttpResponse.json({ shop: toShop(shop), created: true }, { status: 201 });
  }),

  http.get(`${API}/channel/shops/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopView);
    if (!guard.ok) return guard.response;
    const found = ownShop(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    return HttpResponse.json(toShop(found.value));
  }),

  http.post(`${API}/channel/shops/:id/disconnect`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopDisconnect);
    if (!guard.ok) return guard.response;
    const idx = findShop(params.id, guard.value.companyId);
    if (idx === -1) return problem(404, 'Không tìm thấy gian hàng');
    const { version } = (await request.json()) as { version: number };
    const current = db.shops[idx];
    if (version !== current.version) {
      return versionConflict(toShop(current), 'Gian hàng vừa được người khác sửa.');
    }
    if (current.status === 'disconnected') return HttpResponse.json(toShop(current));
    const before = shopSnapshot(current);
    // Ngắt mềm: giữ gian hàng, đơn và ghép SKU để xem lại; xoá token
    db.shops[idx] = {
      ...current,
      status: 'disconnected',
      accessExpiresAt: null,
      updatedAt: db.now(),
      version: current.version + 1,
    };
    writeCompanyLog(guard.value, 'update', shopEntity(db.shops[idx]), before, shopSnapshot(db.shops[idx]));
    return HttpResponse.json(toShop(db.shops[idx]));
  }),

  http.post(`${API}/channel/shops/:id/sync`, async ({ params, request }) => {
    await delay(LATENCY * 2);
    const guard = requireCompany(request, PERMISSIONS.shopSync);
    if (!guard.ok) return guard.response;
    const idx = findShop(params.id, guard.value.companyId);
    if (idx === -1) return problem(404, 'Không tìm thấy gian hàng');
    if (!usable(db.shops[idx])) return shopNotConnected(db.shops[idx]);
    db.shops[idx] = { ...db.shops[idx], lastOrderSyncAt: db.now(), updatedAt: db.now() };
    return HttpResponse.json({ ok: true, lastOrderSyncAt: db.shops[idx].lastOrderSyncAt });
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
    return HttpResponse.json(rows);
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
    return HttpResponse.json(skus);
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
    const next: MockListing = {
      id: existing?.id ?? rid('lst'),
      companyId: shop.companyId,
      shopId: shop.id,
      variantId: target.variant.id,
      externalProductId: sku.externalProductId,
      externalSkuId: sku.externalSkuId,
      lastPushedAt: existing?.externalSkuId === sku.externalSkuId ? existing.lastPushedAt : null,
      lastPushedPrice: existing?.externalSkuId === sku.externalSkuId ? existing.lastPushedPrice : null,
      version: (existing?.version ?? 0) + 1,
    };
    if (existing) channel.listings[idx] = next;
    else channel.listings.push(next);
    writeCompanyLog(
      guard.value,
      existing ? 'update' : 'create',
      listingEntity(shop, target.variant.sku, next.id),
      existing ? { externalSkuId: existing.externalSkuId } : null,
      { externalSkuId: next.externalSkuId, sellerSku: sku.sellerSku },
    );
    return HttpResponse.json(toListing(next));
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
      const { price } = shopPrice(shop, variantId);
      if (price === null) {
        return {
          variantId,
          sku,
          outcome: 'failed',
          code: 'price_missing',
          message: 'Chưa có giá: bảng giá gian hàng và bảng giá chuẩn đều trống',
        };
      }
      const l = channel.listings.find((x) => x.shopId === shop.id && x.variantId === variantId);
      if (l) {
        const r = remoteList.find((x) => x.externalSkuId === l.externalSkuId);
        if (r) r.price = price;
        Object.assign(l, { lastPushedAt: db.now(), lastPushedPrice: price, version: l.version + 1 });
        return { variantId, sku, outcome: 'updated', externalSkuId: l.externalSkuId };
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
      channel.listings.push({
        id: rid('lst'),
        companyId: shop.companyId,
        shopId: shop.id,
        variantId,
        externalProductId: created.externalProductId,
        externalSkuId: created.externalSkuId,
        lastPushedAt: db.now(),
        lastPushedPrice: price,
        version: 1,
      });
      return { variantId, sku, outcome: 'created', externalSkuId: created.externalSkuId };
    });
    const done = results.filter((r) => r.outcome !== 'failed');
    if (done.length) {
      writeCompanyLog(guard.value, 'update', shopEntity(shop), null, {
        pushed: done.map((r) => `${r.sku}${r.outcome === 'created' ? ' (tạo mới)' : ''}`),
      });
    }
    return HttpResponse.json({ results });
  }),
];
