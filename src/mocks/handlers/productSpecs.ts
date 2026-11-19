/**
 * Mock thông tin sàn của sản phẩm (commerio-backend#400, Documents/21 §18.5): gợi ý category, `GET`/`PUT` spec,
 * cascade, và vị từ chặn đẩy `specBlockOf` mà handler đẩy, sửa nội dung dùng chung (như `specBlock` của BE).
 * File này không import `channel.ts` để `channel.ts` import ngược được.
 */

import { http, HttpResponse, delay } from 'msw';
import type {
  CascadeOptionList,
  CategorySuggestionList,
  PlatformAttribute,
  ProductSpecInput,
  ProductSpecResult,
  SpecValue,
} from '@/types/shop';
import { PERMISSIONS } from '@/utils/permissions';
import {
  CUSTOM_AXIS,
  isFilled,
  productAxes,
  requirementOf,
  effectiveValue,
  specMissing,
  type ProductFacts,
} from '@/features/channel/specDraft';
import * as catalog from '../catalogData';
import { db } from '../db';
import {
  categoryPermissions,
  MOCK_PLATFORMS,
  platformAttributes,
  platformCategories,
  productSpecs,
  SUGGESTION_KEYWORDS,
  type MockPlatform,
  type MockProductSpec,
} from '../platformCategoryData';
import { toProductDetail } from './catalog';
import { versionConflict, writeCompanyLog } from './identity';
import { companyDefault, searchPlatformCategories } from './platformCategories';
import { API, LATENCY, problem, requireCompany } from './utils';

/** TikTok Recommend Category trả `12052051` khi tên dưới 25 ký tự: BE kiểm trước, không gọi sàn */
export const MIN_TIKTOK_NAME = 25;

const platformOf = (value: unknown): MockPlatform | null =>
  MOCK_PLATFORMS.includes(value as MockPlatform) ? (value as MockPlatform) : null;

const unsupported = () =>
  problem(422, 'Sàn không hỗ trợ', { code: 'marketplace_unsupported', detail: 'Sàn này chưa có category, attribute.' });

function productOf(companyId: string, id: unknown) {
  return catalog.products.find((p) => p.id === id && p.companyId === companyId && !p.archivedAt);
}

const factsOf = (p: catalog.MockProduct): ProductFacts => ({ originCountry: p.originCountry ?? null, brand: p.brand ?? null });

/** Attribute của leaf kèm `defaultValue` từ hồ sơ công ty; null khi BE chưa lấy từ sàn */
export function leafAttributes(platform: MockPlatform, externalId: string, companyId: string): PlatformAttribute[] | null {
  const stored = platformAttributes[platform].get(externalId);
  if (!stored) return null;
  const company = db.companies.find((c) => c.id === companyId);
  return stored.attributes.map((a) => ({ ...a, defaultValue: companyDefault(a, company?.name ?? null, companyId) }));
}

const findSpec = (companyId: string, productId: string, platform: MockPlatform) =>
  productSpecs.find((s) => s.companyId === companyId && s.productId === productId && s.platform === platform);

const toSpec = ({ companyId: _c, ...s }: MockProductSpec) => ({ ...s, attributes: { ...s.attributes } });

export function specResult(companyId: string, productId: string, platform: MockPlatform): ProductSpecResult {
  const spec = findSpec(companyId, productId, platform);
  const product = productOf(companyId, productId);
  if (!spec || !product) return { spec: null, missing: [] };
  const axes = productAxes(toProductDetail(product).variants);
  const attrs = leafAttributes(platform, spec.externalCategoryId, companyId);
  return { spec: toSpec(spec), missing: specMissing(attrs, spec, axes, factsOf(product)) };
}

/**
 * Mã chặn đẩy theo thông tin sàn, thứ tự như `push-block.ts` (plan A14): chưa có spec → `category_unmapped`; còn
 * thiếu → `spec_incomplete` kèm nhãn; TikTok gian hàng không có quyền category → `category_not_permitted`.
 * Sàn không có cây category (shopee, sàn giả lập) không kiểm
 */
export function specBlockOf(
  companyId: string,
  productId: string,
  platform: string,
  shopId: string,
): { code: string; message: string | null } | null {
  const p = platformOf(platform);
  if (!p) return null;
  const { spec, missing } = specResult(companyId, productId, p);
  if (!spec) return { code: 'category_unmapped', message: null };
  if (missing.length) return { code: 'spec_incomplete', message: missing.map((m) => m.label).join(', ') };
  const permission = categoryPermissions.find((x) => x.shopId === shopId && x.externalCategoryId === spec.externalCategoryId);
  if (p === 'tiktok' && permission && permission.status !== 'available') {
    return { code: 'category_not_permitted', message: null };
  }
  return null;
}

/** Leaf của spec bắt buộc bảng kích cỡ (commerio-backend#347, cột `platform_categories.size_chart_rule`) */
export function specSizeChartRule(companyId: string, productId: string, platform: string) {
  const p = platformOf(platform);
  const spec = p ? findSpec(companyId, productId, p) : undefined;
  return spec ? (platformCategories[spec.platform].find((c) => c.externalId === spec.externalCategoryId)?.sizeChartRule ?? null) : null;
}

/** Kiểm body `PUT` như BE: 422 `errors` theo ô */
function validateSpec(
  body: ProductSpecInput,
  attrs: PlatformAttribute[],
  axes: ReturnType<typeof productAxes>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const values = body.attributes ?? {};
  for (const a of attrs) {
    if (a.kind === 'sales' || a.tier === 'product') continue;
    const v = values[a.code];
    if (requirementOf(a, values) && !isFilled(effectiveValue(a, values))) {
      errors[`attributes.${a.code}`] = 'Sàn bắt buộc attribute này';
      continue;
    }
    if (!isFilled(v) || a.allowCustom || !a.options.length) continue;
    const picked = Array.isArray(v) ? v : [v as string];
    if (picked.some((id) => !a.options.some((o) => o.id === id))) {
      errors[`attributes.${a.code}`] = 'Giá trị không có trong danh sách của sàn';
    }
  }
  const sales = attrs.filter((a) => a.kind === 'sales');
  const axisMap = body.axisMap ?? {};
  for (const axis of axes) {
    const code = axisMap[axis.attributeId];
    if (!code) errors[`axisMap.${axis.attributeId}`] = 'Chọn sales attribute của sàn hoặc giữ tên tự đặt';
    else if (code !== CUSTOM_AXIS && !sales.some((s) => s.code === code)) {
      errors[`axisMap.${axis.attributeId}`] = 'Sales attribute không có ở category này';
    }
  }
  for (const [valueId, optionId] of Object.entries(body.valueMap ?? {})) {
    const axis = axes.find((x) => x.values.some((v) => v.id === valueId));
    const attr = axis ? sales.find((s) => s.code === axisMap[axis.attributeId]) : undefined;
    if (!attr?.options.some((o) => o.id === optionId)) errors[`valueMap.${valueId}`] = 'Giá trị chuẩn không có ở sales attribute đã chọn';
  }
  return errors;
}

/** Chỉ lưu `tier = 'category'` và `company` khác `defaultValue` (Documents/21 §18.5) */
function storedAttributes(values: Record<string, SpecValue>, attrs: PlatformAttribute[]) {
  const out: Record<string, SpecValue> = {};
  for (const a of attrs) {
    const v = values[a.code];
    if (a.kind === 'sales' || a.tier === 'product' || !isFilled(v)) continue;
    if (a.tier === 'company' && v === a.defaultValue) continue;
    out[a.code] = v;
  }
  return out;
}

/** Cascade Lazada giả lập: hai cấp (bản thật gọi GetNextCascadeProp, không lưu) */
const CASCADE: Record<string, { id: string; label: string }[]> = {
  '': [
    { id: 'vn', label: 'Việt Nam' },
    { id: 'cn', label: 'Trung Quốc' },
  ],
  vn: [
    { id: 'vn-hcm', label: 'TP. Hồ Chí Minh' },
    { id: 'vn-hn', label: 'Hà Nội' },
  ],
  cn: [{ id: 'cn-gz', label: 'Quảng Châu' }],
};

export const productSpecHandlers = [
  http.get(`${API}/channel/shops/:shopId/category-suggestions`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.listingManage);
    if (!guard.ok) return guard.response;
    const { companyId } = guard.value;
    const shop = db.shops.find((s) => s.id === params.shopId && s.companyId === companyId);
    if (!shop) return problem(404, 'Không tìm thấy gian hàng', { code: 'not_found' });
    const platform = platformOf(shop.platform);
    if (!platform) return unsupported();
    if (shop.status !== 'active') {
      return problem(409, 'Gian hàng chưa kết nối', { code: 'shop_not_connected', detail: 'Gian hàng không ở trạng thái đang kết nối.' });
    }
    const product = productOf(companyId, new URL(request.url).searchParams.get('productId'));
    if (!product) return problem(404, 'Không tìm thấy sản phẩm', { code: 'not_found' });
    if (platform === 'tiktok' && product.name.trim().length < MIN_TIKTOK_NAME) {
      return problem(422, 'Tên sản phẩm quá ngắn', {
        code: 'product_name_too_short',
        min: MIN_TIKTOK_NAME,
        detail: 'TikTok chỉ gợi ý category khi tên sản phẩm dài từ 25 ký tự.',
      });
    }
    if (platform === 'lazada' && !product.imageFileIds.length) {
      return problem(422, 'Sản phẩm chưa có ảnh', { code: 'images_missing', detail: 'Lazada gợi ý theo tên và ảnh đầu của sản phẩm.' });
    }
    if (shop.outage) return problem(503, 'Sàn đang lỗi tạm', { code: 'marketplace_unavailable' });
    const keyword = SUGGESTION_KEYWORDS[product.categoryId];
    const found = keyword ? searchPlatformCategories(platformCategories[platform], keyword) : [];
    const items = found.slice(0, platform === 'lazada' ? 5 : 1).map((c) => {
      if (platform === 'lazada') return { externalId: c.externalId, path: c.path, permission: null };
      const row = categoryPermissions.find((x) => x.shopId === shop.id && x.externalCategoryId === c.externalId);
      // BE ghi luôn quyền vào shop_category_permissions
      if (!row) categoryPermissions.push({ shopId: shop.id, externalCategoryId: c.externalId, status: 'available' });
      return { externalId: c.externalId, path: c.path, permission: row?.status ?? 'available' };
    });
    return HttpResponse.json<CategorySuggestionList>({ items, cached: false });
  }),

  http.get(`${API}/channel/products/:productId/specs/:platform`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.shopView);
    if (!guard.ok) return guard.response;
    const platform = platformOf(params.platform);
    if (!platform) return unsupported();
    if (!productOf(guard.value.companyId, params.productId)) return problem(404, 'Không tìm thấy sản phẩm', { code: 'not_found' });
    return HttpResponse.json<ProductSpecResult>(specResult(guard.value.companyId, String(params.productId), platform));
  }),

  http.put(`${API}/channel/products/:productId/specs/:platform`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.listingManage);
    if (!guard.ok) return guard.response;
    const { companyId } = guard.value;
    const platform = platformOf(params.platform);
    if (!platform) return unsupported();
    const product = productOf(companyId, params.productId);
    if (!product) return problem(404, 'Không tìm thấy sản phẩm', { code: 'not_found' });
    const body = (await request.json()) as ProductSpecInput;
    const leaf = platformCategories[platform].find((c) => c.externalId === body.externalCategoryId);
    if (!leaf || !leaf.isLeaf || leaf.status !== 'active') {
      return problem(422, 'Dữ liệu không hợp lệ', { errors: { externalCategoryId: 'Chọn một leaf category đang dùng của sàn' } });
    }
    const existing = findSpec(companyId, product.id, platform);
    if (existing ? body.version !== existing.version : body.version !== null) {
      return versionConflict(specResult(companyId, product.id, platform), 'Thông tin sàn của sản phẩm vừa được người khác lưu.');
    }
    const attrs = leafAttributes(platform, leaf.externalId, companyId);
    if (!attrs) {
      // BE phải lấy attribute từ sàn trước khi kiểm (A16): mock chỉ có attribute của 3 leaf mỗi sàn
      const hasShop = db.shops.some((s) => s.companyId === companyId && s.platform === platform && s.status === 'active');
      return platform === 'tiktok' && !hasShop
        ? problem(409, 'Gian hàng chưa kết nối', { code: 'shop_not_connected', detail: 'Công ty chưa có gian hàng TikTok đang kết nối.' })
        : problem(503, 'Sàn tạm thời không phản hồi', { code: 'marketplace_unavailable', detail: 'Bản giả lập chỉ có attribute của 3 leaf mỗi sàn.' });
    }
    const axes = productAxes(toProductDetail(product).variants);
    const errors = validateSpec(body, attrs, axes);
    if (Object.keys(errors).length) return problem(422, 'Dữ liệu không hợp lệ', { errors });
    const next: MockProductSpec = {
      companyId,
      productId: product.id,
      platform,
      externalCategoryId: leaf.externalId,
      categoryPath: leaf.path,
      categoryStatus: 'ok',
      attributes: storedAttributes(body.attributes ?? {}, attrs),
      axisMap: { ...body.axisMap },
      valueMap: { ...body.valueMap },
      source: 'push',
      version: (existing?.version ?? 0) + 1,
      updatedAt: db.now(),
    };
    const before = existing ? toSpec(existing) : null;
    if (existing) Object.assign(existing, next);
    else productSpecs.push(next);
    writeCompanyLog(
      guard.value,
      existing ? 'update' : 'create',
      { type: 'channel.product_specs', id: `${product.id}:${platform}`, label: `${product.name} · ${platform}` },
      before,
      toSpec(next),
    );
    return HttpResponse.json<ProductSpecResult>(specResult(companyId, product.id, platform));
  }),

  http.get(`${API}/channel/platforms/:platform/categories/:externalId/cascade`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.listingManage);
    if (!guard.ok) return guard.response;
    if (params.platform !== 'lazada') return unsupported();
    const url = new URL(request.url);
    if (!url.searchParams.get('code')) return problem(422, 'Dữ liệu không hợp lệ', { errors: { code: 'Thiếu mã attribute' } });
    return HttpResponse.json<CascadeOptionList>({ items: CASCADE[url.searchParams.get('parent') ?? ''] ?? [] });
  }),
];
