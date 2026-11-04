/**
 * Mock ghép danh mục Commerio với danh mục sàn (FE#146, Documents/21 §18.5).
 * Danh mục và thuộc tính là dữ liệu của sàn (BE gọi API sàn), bản ghép lưu ở channel.category_maps.
 */

import { http, HttpResponse, delay } from 'msw';
import type {
  CategoryAttributeList,
  CategoryMap,
  CategoryMapInput,
  CategoryMapList,
  MarketplaceCategoryList,
} from '@/types/shop';
import { PERMISSIONS } from '@/utils/permissions';
import * as catalog from '../catalogData';
import * as channel from '../channelData';
import type { MockCategoryMap } from '../channelData';
import { db } from '../db';
import { API, LATENCY, problem, requireCompany } from './utils';
import { versionConflict, writeCompanyLog } from './identity';
import { ownShop, shopNotConnected, usable } from './channel';
import { ATTRIBUTE_ERROR_PREFIX, attributeErrors, pickAttributeValues, searchCategories } from '@/features/channel/categoryMap';

export function toCategoryMap(m: MockCategoryMap): CategoryMap {
  const { companyId: _c, shopId: _s, ...rest } = m;
  return { ...rest, attributes: { ...m.attributes } };
}

const findMarketCategory = (externalId: unknown) => channel.marketCategories.find((c) => c.externalId === externalId);

export const categoryMapHandlers = [
  http.get(`${API}/channel/shops/:id/categories`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.listingManage);
    if (!guard.ok) return guard.response;
    const found = ownShop(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    if (!usable(found.value)) return shopNotConnected(found.value);
    const search = new URL(request.url).searchParams.get('search') ?? '';
    const items = searchCategories(channel.marketCategories, search).map(({ externalId, name }) => ({ externalId, name }));
    return HttpResponse.json<MarketplaceCategoryList>({ items });
  }),

  http.get(`${API}/channel/shops/:id/categories/:externalId/attributes`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.listingManage);
    if (!guard.ok) return guard.response;
    const found = ownShop(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    if (!usable(found.value)) return shopNotConnected(found.value);
    const category = findMarketCategory(params.externalId);
    if (!category) return problem(404, 'Không tìm thấy danh mục sàn');
    return HttpResponse.json<CategoryAttributeList>({ items: category.attributes.map((a) => ({ ...a, options: [...a.options] })) });
  }),

  http.get(`${API}/channel/shops/:id/category-maps`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopView);
    if (!guard.ok) return guard.response;
    const found = ownShop(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    const items = channel.categoryMaps.filter((m) => m.shopId === found.value.id).map(toCategoryMap);
    return HttpResponse.json<CategoryMapList>({ items });
  }),

  http.put(`${API}/channel/shops/:id/category-maps/:categoryId`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.listingManage);
    if (!guard.ok) return guard.response;
    const found = ownShop(params.id, guard.value.companyId);
    if (!found.ok) return found.response;
    const shop = found.value;
    const category = catalog.categories.find((c) => c.id === params.categoryId && c.companyId === shop.companyId);
    if (!category) return problem(404, 'Không tìm thấy danh mục');
    if (!usable(shop)) return shopNotConnected(shop);
    const body = (await request.json()) as Partial<CategoryMapInput>;
    const current = channel.categoryMaps.find((m) => m.shopId === shop.id && m.categoryId === category.id);
    const version = body.version ?? null;
    if ((current?.version ?? null) !== version) {
      return current
        ? versionConflict(toCategoryMap(current), 'Danh mục vừa được người khác ghép lại.')
        : problem(409, 'Dữ liệu vừa được người khác sửa', {
            code: 'version_conflict',
            detail: 'Bản ghép danh mục vừa bị gỡ.',
          });
    }
    const market = findMarketCategory(body.externalCategoryId);
    if (!market) {
      return problem(422, 'Danh mục sàn không hợp lệ', {
        errors: { externalCategoryId: 'Chọn một danh mục lá trên sàn' },
      });
    }
    const values = body.attributes ?? {};
    const invalid = attributeErrors(market.attributes, values);
    if (Object.keys(invalid).length) {
      return problem(422, 'Thiếu thuộc tính bắt buộc', {
        errors: Object.fromEntries(Object.entries(invalid).map(([k, v]) => [`${ATTRIBUTE_ERROR_PREFIX}${k}`, v])),
      });
    }
    const before = current ? toCategoryMap(current) : null;
    const next: MockCategoryMap = {
      companyId: shop.companyId,
      shopId: shop.id,
      categoryId: category.id,
      platform: shop.platform,
      externalCategoryId: market.externalId,
      attributes: pickAttributeValues(market.attributes, values),
      version: (current?.version ?? 0) + 1,
      updatedAt: db.now(),
    };
    if (current) Object.assign(current, next);
    else channel.categoryMaps.push(next);
    writeCompanyLog(
      guard.value,
      current ? 'update' : 'create',
      { type: 'channel.category_maps', id: `${shop.id}:${category.id}`, label: `${shop.shopName}: ${category.name}` },
      before ? { externalCategoryId: before.externalCategoryId, attributes: before.attributes } : null,
      { externalCategoryId: next.externalCategoryId, attributes: next.attributes },
    );
    return HttpResponse.json<CategoryMap>(toCategoryMap(next));
  }),
];
