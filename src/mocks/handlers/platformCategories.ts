/**
 * Mock category và attribute của sàn (commerio-backend#400, Documents/21 §18.5): cây đọc từ bảng, không gọi sàn.
 * Chi tiết leaf chưa có attribute trong bảng thì BE phải gọi sàn: mock coi như không gọi được
 * (409 `shop_not_connected` khi công ty không có gian hàng `active` của sàn, còn lại 503 `marketplace_unavailable`).
 */

import { http, HttpResponse, delay } from 'msw';
import type { PlatformAttribute, PlatformCategory, PlatformCategoryDetail, PlatformCategoryList } from '@/types/shop';
import { PERMISSIONS } from '@/utils/permissions';
import * as catalog from '../catalogData';
import { db } from '../db';
import {
  categorySync,
  COMPANY_ADDRESSES,
  COMPANY_ADDRESS_ATTRIBUTES,
  COMPANY_NAME_ATTRIBUTES,
  foldPath,
  MOCK_PLATFORMS,
  platformAttributes,
  platformCategories,
  productSpecs,
  STALE_LEAVES,
  type MockPlatform,
  type MockPlatformCategory,
} from '../platformCategoryData';
import { API, LATENCY, problem, requireCompany } from './utils';
import { productCode } from './catalog';
import { companyProfileOf } from './companyProfile';

const SEARCH_LIMIT = 50;
export const SYNC_MS = 4000;

function platformOf(value: unknown): MockPlatform | null {
  return MOCK_PLATFORMS.includes(value as MockPlatform) ? (value as MockPlatform) : null;
}

const unsupported = () =>
  problem(422, 'Sàn không hỗ trợ', { code: 'marketplace_unsupported', detail: 'Sàn này chưa có cây category.' });

const toCategory = ({ pathSearch: _p, sizeChartRule: _s, ...c }: MockPlatformCategory): PlatformCategory => c;

/** Gần đúng `word_similarity` của BE: mọi từ của câu tìm nằm trong đường dẫn đã bỏ dấu; khớp tên leaf, khớp có dấu lên trước */
export function searchPlatformCategories(rows: MockPlatformCategory[], search: string): MockPlatformCategory[] {
  const folded = foldPath(search.trim());
  const words = folded.split(/\s+/).filter(Boolean);
  const exact = search.trim().toLowerCase();
  const rank = (c: MockPlatformCategory) =>
    (foldPath(c.name).includes(folded) ? 0 : 2) + (c.path.toLowerCase().includes(exact) ? 0 : 1);
  return rows
    .filter((c) => c.isLeaf && c.status === 'active' && words.every((w) => c.pathSearch.includes(w)))
    .sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path, 'vi'))
    .slice(0, SEARCH_LIMIT);
}

/** `defaultValue` của attribute `tier = 'company'` từ hồ sơ công ty (commerio-backend#292); attribute khác null */
export function companyDefault(a: Pick<PlatformAttribute, 'code' | 'tier'>, companyName: string | null, companyId: string) {
  if (a.tier !== 'company') return null;
  const profile = companyProfileOf(companyId);
  if (COMPANY_NAME_ATTRIBUTES.has(a.code)) return profile?.effectiveResponsible.name ?? companyName;
  if (COMPANY_ADDRESS_ATTRIBUTES.has(a.code)) return profile ? profile.effectiveResponsible.address : (COMPANY_ADDRESSES[companyId] ?? null);
  return null;
}

export const platformCategoryHandlers = [
  http.get(`${API}/channel/platforms/:platform/categories`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopView);
    if (!guard.ok) return guard.response;
    const platform = platformOf(params.platform);
    if (!platform) return unsupported();
    const url = new URL(request.url);
    const search = url.searchParams.get('search');
    const parentId = url.searchParams.get('parentId');
    const rows = platformCategories[platform];
    const { syncedAt } = categorySync[platform];
    if (search !== null) {
      if (search.trim().length < 2) {
        return problem(422, 'Dữ liệu không hợp lệ', { errors: { search: 'Nhập ít nhất 2 ký tự' } });
      }
      return HttpResponse.json<PlatformCategoryList>({ items: searchPlatformCategories(rows, search).map(toCategory), syncedAt });
    }
    const items = rows.filter((c) => c.parentExternalId === (parentId || null)).map(toCategory);
    return HttpResponse.json<PlatformCategoryList>({ items, syncedAt });
  }),

  http.get(`${API}/channel/platforms/:platform/categories/:externalId`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopView);
    if (!guard.ok) return guard.response;
    const platform = platformOf(params.platform);
    if (!platform) return unsupported();
    const category = platformCategories[platform].find((c) => c.externalId === params.externalId);
    if (!category) return problem(404, 'Không tìm thấy category', { code: 'not_found' });
    if (!category.isLeaf) {
      return problem(422, 'Không phải leaf category', {
        code: 'category_not_leaf',
        detail: 'Sàn chỉ nhận sản phẩm ở leaf category.',
      });
    }
    const stored = platformAttributes[platform].get(category.externalId);
    if (!stored) {
      const hasShop = db.shops.some(
        (s) => s.companyId === guard.value.companyId && s.platform === platform && s.status === 'active',
      );
      return hasShop
        ? problem(503, 'Sàn tạm thời không phản hồi', {
            code: 'marketplace_unavailable',
            detail: 'Bản giả lập chỉ có attribute của 3 leaf mỗi sàn.',
          })
        : problem(409, 'Gian hàng chưa kết nối', {
            code: 'shop_not_connected',
            detail: 'Công ty chưa có gian hàng đang kết nối trên sàn này để lấy attribute.',
          });
    }
    const company = db.companies.find((c) => c.id === guard.value.companyId);
    const products = productSpecs
      .filter((s) => s.companyId === guard.value.companyId && s.platform === platform && s.externalCategoryId === category.externalId)
      .flatMap((s) => {
        const p = catalog.products.find((x) => x.id === s.productId && !x.archivedAt);
        return p ? [{ productId: p.id, code: productCode(p), name: p.name, source: s.source }] : [];
      });
    const { pathSearch: _p, ...rest } = category;
    return HttpResponse.json<PlatformCategoryDetail>({
      category: rest,
      attributes: stored.attributes.map((a) => ({
        ...a,
        options: a.options.map((o) => ({ ...o })),
        defaultValue: companyDefault(a, company?.name ?? null, guard.value.companyId),
      })),
      fetchedAt: stored.fetchedAt,
      stale: STALE_LEAVES[platform].has(category.externalId),
      products,
    });
  }),

  http.post(`${API}/channel/platforms/:platform/categories/sync`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopSync);
    if (!guard.ok) return guard.response;
    const platform = platformOf(params.platform);
    if (!platform) return unsupported();
    const state = categorySync[platform];
    if (state.pending) return HttpResponse.json({ queued: false }, { status: 202 });
    state.pending = true;
    setTimeout(() => {
      state.pending = false;
      state.syncedAt = db.now();
    }, SYNC_MS);
    return HttpResponse.json({ queued: true }, { status: 202 });
  }),
];
