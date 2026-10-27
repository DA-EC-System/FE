import { http, HttpResponse, delay } from 'msw';
import { db } from '../db';
import * as pricing from '../pricingData';
import type { MockPricelist } from '../pricingData';
import { formatCurrency } from '@/utils/format';
import type { Pricelist, PricelistCreateInput, PricelistItem, PricelistItemsInput, PricelistUpdateInput } from '@/types/pricing';
import { PERMISSIONS } from '@/utils/permissions';
import { API, LATENCY, problem, requireCompany } from './utils';
import { versionConflict, writeCompanyLog } from './identity';
import { companyProducts, fileUrl, findOwned, rid, sameText, staleVersion, variantAttributes } from './catalog';

// ---------- Bảng giá (UC-CP-03, QT-12) ----------
export const MAX_PRICE = 10_000_000_000;
export const MAX_PRICE_ITEMS = 2000;

/** Mỗi công ty luôn có một bảng giá chuẩn (tạo cùng công ty) */
export function ensureStandard(companyId: string): MockPricelist {
  let standard = pricing.pricelists.find((p) => p.companyId === companyId && p.type === 'standard');
  if (!standard) {
    standard = {
      id: rid('pl'),
      companyId,
      name: 'Bảng giá chuẩn',
      type: 'standard',
      shopId: null,
      prices: {},
      version: 1,
      updatedAt: db.now(),
    };
    pricing.pricelists.unshift(standard);
  }
  return standard;
}

/** Biến thể đang bán của sản phẩm đang bán: các dòng của lưới giá */
export function sellableVariants(companyId: string) {
  return companyProducts(companyId)
    .filter((p) => !p.archivedAt)
    .flatMap((p) => p.variants.filter((v) => !v.archivedAt).map((v) => ({ product: p, variant: v })));
}

export function toPricelist(pl: MockPricelist): Pricelist {
  const shop = pl.shopId ? db.shops.find((s) => s.id === pl.shopId) : undefined;
  const sellable = sellableVariants(pl.companyId);
  return {
    id: pl.id,
    name: pl.name,
    type: pl.type,
    shop: shop ? { id: shop.id, shopName: shop.shopName, platform: shop.platform } : null,
    pricedCount: sellable.filter(({ variant }) => variant.id in pl.prices).length,
    variantCount: sellable.length,
    version: pl.version,
    updatedAt: pl.updatedAt,
  };
}

export const pricelistEntity = (pl: MockPricelist) => ({ type: 'pricing.pricelists', id: pl.id, label: pl.name });
export function pricelistSnapshot(pl: MockPricelist) {
  const shop = pl.shopId ? db.shops.find((s) => s.id === pl.shopId) : undefined;
  return { name: pl.name, type: pl.type, shop: shop?.shopName ?? null };
}

export function skuOf(companyId: string, variantId: string) {
  for (const p of companyProducts(companyId)) {
    const v = p.variants.find((x) => x.id === variantId);
    if (v) return v.sku;
  }
  return variantId;
}

/** Nhật ký chỉ ghi các giá đổi, mỗi dòng "SKU: giá" */
export function priceLines(companyId: string, prices: Record<string, number | null>) {
  return Object.entries(prices).map(
    ([variantId, price]) => `${skuOf(companyId, variantId)}: ${price === null ? '—' : formatCurrency(price)}`,
  );
}

export function validatePricelistName(name: string | undefined) {
  const value = name?.trim() ?? '';
  if (!value) return 'Nhập tên bảng giá';
  if (value.length > 60) return 'Tên bảng giá tối đa 60 ký tự';
  return null;
}

/** Tên trùng trong công ty: 409 name_taken kèm errors.name (docs/21 V24) */
export function pricelistNameTaken(name: string | undefined, companyId: string, exceptId?: string) {
  const value = name?.trim() ?? '';
  if (!pricing.pricelists.some((p) => p.companyId === companyId && p.id !== exceptId && sameText(p.name, value))) {
    return null;
  }
  return problem(409, 'Tên đã được dùng', { code: 'name_taken', errors: { name: 'Đã có bảng giá cùng tên' } });
}

export const pricingHandlers = [
  http.get(`${API}/pricing/pricelists`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.pricelistView);
    if (!guard.ok) return guard.response;
    ensureStandard(guard.value.companyId);
    return HttpResponse.json(
      pricing.pricelists
        .filter((p) => p.companyId === guard.value.companyId)
        // Bảng giá chuẩn đứng đầu, sau đó theo tên
        .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, 'vi') : a.type === 'standard' ? -1 : 1))
        .map(toPricelist),
    );
  }),

  http.get(`${API}/pricing/pricelists/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.pricelistView);
    if (!guard.ok) return guard.response;
    const found = findOwned(pricing.pricelists, params.id, guard.value.companyId, 'bảng giá');
    if (!found.ok) return found.response;
    return HttpResponse.json(toPricelist(found.value));
  }),

  http.get(`${API}/pricing/pricelists/:id/items`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.pricelistView);
    if (!guard.ok) return guard.response;
    const found = findOwned(pricing.pricelists, params.id, guard.value.companyId, 'bảng giá');
    if (!found.ok) return found.response;
    const pl = found.value;
    const standard = ensureStandard(pl.companyId);
    const items: PricelistItem[] = sellableVariants(pl.companyId).map(({ product, variant }) => ({
      variantId: variant.id,
      productId: product.id,
      productName: product.name,
      sku: variant.sku,
      attributesLabel: variantAttributes(pl.companyId, variant.valueIds)
        .map((a) => a.value)
        .join(' / '),
      categoryId: product.categoryId,
      thumbnailUrl: product.imageFileIds[0] ? fileUrl(product.imageFileIds[0]) : null,
      price: pl.prices[variant.id] ?? null,
      standardPrice: standard.prices[variant.id] ?? null,
    }));
    return HttpResponse.json(items);
  }),

  http.post(`${API}/pricing/pricelists`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.pricelistManage);
    if (!guard.ok) return guard.response;
    const companyId = guard.value.companyId;
    const body = (await request.json()) as PricelistCreateInput;
    const errors: Record<string, string> = {};
    const nameError = validatePricelistName(body.name);
    if (nameError) errors.name = nameError;
    const shop = db.shops.find((s) => s.id === body.shopId && s.companyId === companyId);
    if (!body.shopId) errors.shopId = 'Chọn gian hàng';
    else if (!shop) errors.shopId = 'Không tìm thấy gian hàng';
    else if (shop.status === 'disconnected') errors.shopId = 'Gian hàng đã ngắt kết nối';
    else {
      const taken = pricing.pricelists.find((p) => p.shopId === shop.id);
      if (taken) errors.shopId = `Gian hàng đã có bảng giá "${taken.name}"`;
    }
    if (Object.keys(errors).length) return problem(422, 'Dữ liệu chưa hợp lệ', { errors });
    const taken = pricelistNameTaken(body.name, companyId);
    if (taken) return taken;
    const standard = ensureStandard(companyId);
    const pl: MockPricelist = {
      id: rid('pl'),
      companyId,
      name: body.name.trim(),
      type: 'channel',
      shopId: shop!.id,
      prices: body.copyFromStandard ? { ...standard.prices } : {},
      version: 1,
      updatedAt: db.now(),
    };
    pricing.pricelists.push(pl);
    writeCompanyLog(guard.value, 'create', pricelistEntity(pl), null, pricelistSnapshot(pl));
    return HttpResponse.json(toPricelist(pl), { status: 201 });
  }),

  http.put(`${API}/pricing/pricelists/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.pricelistManage);
    if (!guard.ok) return guard.response;
    const found = findOwned(pricing.pricelists, params.id, guard.value.companyId, 'bảng giá');
    if (!found.ok) return found.response;
    const pl = found.value;
    const body = (await request.json()) as PricelistUpdateInput;
    if (body.version !== pl.version) {
      return versionConflict(toPricelist(pl), 'Bảng giá vừa được người khác sửa.');
    }
    const nameError = validatePricelistName(body.name);
    if (nameError) return problem(422, 'Dữ liệu chưa hợp lệ', { errors: { name: nameError } });
    const taken = pricelistNameTaken(body.name, pl.companyId, pl.id);
    if (taken) return taken;
    const before = pricelistSnapshot(pl);
    pl.name = body.name.trim();
    pl.version += 1;
    pl.updatedAt = db.now();
    writeCompanyLog(guard.value, 'update', pricelistEntity(pl), before, pricelistSnapshot(pl));
    return HttpResponse.json(toPricelist(pl));
  }),

  http.delete(`${API}/pricing/pricelists/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.pricelistManage);
    if (!guard.ok) return guard.response;
    const found = findOwned(pricing.pricelists, params.id, guard.value.companyId, 'bảng giá');
    if (!found.ok) return found.response;
    const pl = found.value;
    if (staleVersion(new URL(request.url), pl.version)) {
      return versionConflict(toPricelist(pl), 'Bảng giá vừa được người khác sửa.');
    }
    if (pl.type === 'standard') {
      return problem(409, 'Không xoá được bảng giá chuẩn', {
        code: 'in_use',
        detail: 'Bảng giá chuẩn áp dụng mặc định cho mọi đơn hàng (QT-12).',
      });
    }
    const shop = db.shops.find((s) => s.id === pl.shopId);
    if (shop && shop.status !== 'disconnected') {
      return problem(409, 'Bảng giá đang được sử dụng', {
        code: 'in_use',
        detail: `Đơn từ gian hàng ${shop.shopName} đang lấy giá trong bảng này. Ngắt gian hàng trước khi xoá.`,
      });
    }
    pricing.pricelists.splice(pricing.pricelists.indexOf(pl), 1);
    writeCompanyLog(guard.value, 'delete', pricelistEntity(pl), pricelistSnapshot(pl), null);
    return new HttpResponse(null, { status: 204 });
  }),

  http.put(`${API}/pricing/pricelists/:id/items`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.pricelistManage);
    if (!guard.ok) return guard.response;
    const found = findOwned(pricing.pricelists, params.id, guard.value.companyId, 'bảng giá');
    if (!found.ok) return found.response;
    const pl = found.value;
    const body = (await request.json()) as PricelistItemsInput;
    if (body.version !== pl.version) {
      return versionConflict(toPricelist(pl), 'Bảng giá vừa được người khác sửa.');
    }
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) {
      return problem(422, 'Dữ liệu chưa hợp lệ', { errors: { items: 'Chưa có giá nào thay đổi' } });
    }
    if (items.length > MAX_PRICE_ITEMS) {
      return problem(422, 'Dữ liệu chưa hợp lệ', {
        errors: { items: `Tối đa ${MAX_PRICE_ITEMS} giá mỗi lần lưu` },
      });
    }
    // Lỗi theo từng dòng: khoá "items.<variantId>"
    const sellable = new Set(sellableVariants(pl.companyId).map(({ variant }) => variant.id));
    const errors: Record<string, string> = {};
    const seen = new Set<string>();
    for (const { variantId, price } of items) {
      const key = `items.${variantId}`;
      if (seen.has(variantId)) errors[key] = 'Biến thể bị gửi hai lần';
      else if (!sellable.has(variantId)) errors[key] = 'Biến thể không còn bán';
      else if (price !== null && (typeof price !== 'number' || !Number.isInteger(price))) {
        errors[key] = 'Giá phải là số nguyên đồng';
      } else if (price !== null && price < 0) errors[key] = 'Giá không được âm';
      else if (price !== null && price > MAX_PRICE) errors[key] = 'Giá tối đa 10 tỷ đồng';
      seen.add(variantId);
    }
    if (Object.keys(errors).length) return problem(422, 'Có giá chưa hợp lệ', { errors });

    const before: Record<string, number | null> = {};
    const after: Record<string, number | null> = {};
    for (const { variantId, price } of items) {
      const old = pl.prices[variantId] ?? null;
      if (old === price) continue;
      before[variantId] = old;
      after[variantId] = price;
      if (price === null) delete pl.prices[variantId];
      else pl.prices[variantId] = price;
    }
    // Không giá nào thật sự đổi: không tăng version, không ghi nhật ký
    if (Object.keys(after).length) {
      pl.version += 1;
      pl.updatedAt = db.now();
      writeCompanyLog(
        guard.value,
        'update',
        pricelistEntity(pl),
        { prices: priceLines(pl.companyId, before) },
        { prices: priceLines(pl.companyId, after) },
      );
    }
    return HttpResponse.json(toPricelist(pl));
  }),
];
