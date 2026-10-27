import { http, HttpResponse, delay } from 'msw';
import { db } from '../db';
import * as catalog from '../catalogData';
import type { MockCategory, MockAttribute, MockProduct, MockVariant } from '../catalogData';
import { skuPatternError, valueCode } from '@/utils/sku';
import * as inventory from '../inventoryData';
import * as purchasing from '../purchasingData';
import * as channel from '../channelData';
import * as pricing from '../pricingData';
import type { Attribute, AttributeInput, BusinessStatusInput, BusinessStatusResult, Category, CategoryInput, ProductCreateInput, ProductDetail, ProductListItem, ProductUpdateInput, ProductVariant, UploadTicket, VariantAttribute, VariantBusinessStatus, VariantMainLabel, VariantPresence } from '@/types/catalog';
import { BUSINESS_ACTIONS, hidesListings, mainLabel, variantMachine } from '@/lib/machines/product';
import { PERMISSIONS } from '@/utils/permissions';
import { ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES } from '@/utils/files';
import { API, LATENCY, checkTransition, pageParams, paginate, problem, requireCompany } from './utils';
import { versionConflict, writeCompanyLog } from './identity';

// ---------- Catalog (UC-CP-01, UC-CP-02) và ảnh qua module files ----------
export const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
export const rid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function companyProducts(companyId: string) {
  return catalog.products.filter((p) => p.companyId === companyId);
}

export function toCategory(c: MockCategory): Category {
  return {
    id: c.id,
    name: c.name,
    skuPattern: c.skuPattern,
    skuNextSeq: c.skuNextSeq,
    productCount: catalog.products.filter((p) => p.categoryId === c.id).length,
    version: c.version,
    updatedAt: c.updatedAt,
  };
}

export function usedValueIds(companyId: string) {
  return new Set(companyProducts(companyId).flatMap((p) => p.variants.flatMap((v) => v.valueIds)));
}

export function toAttribute(a: MockAttribute): Attribute {
  const used = usedValueIds(a.companyId);
  const ids = new Set(a.values.map((v) => v.id));
  return {
    id: a.id,
    name: a.name,
    values: a.values.map((v) => ({ ...v, inUse: used.has(v.id) })),
    productCount: companyProducts(a.companyId).filter((p) =>
      p.variants.some((v) => v.valueIds.some((id) => ids.has(id))),
    ).length,
    version: a.version,
  };
}

export function findValue(companyId: string, valueId: string) {
  for (const a of catalog.attributes) {
    if (a.companyId !== companyId) continue;
    const v = a.values.find((x) => x.id === valueId);
    if (v) return { attribute: a, value: v };
  }
  return null;
}

export function variantAttributes(companyId: string, valueIds: string[]): VariantAttribute[] {
  return valueIds
    .map((id) => findValue(companyId, id))
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .map(({ attribute, value }) => ({
      attributeId: attribute.id,
      attributeName: attribute.name,
      valueId: value.id,
      value: value.value,
    }));
}

// ---------- Trạng thái kinh doanh của SKU (sơ đồ Sản phẩm B1, FE#57) ----------

const OPEN_REQUEST = new Set(['draft', 'pending_approval', 'changes_requested', 'approved', 'ordered', 'partially_received']);
const OPEN_RETURN = new Set(['draft', 'pending_approval', 'sent']);

/** Lý do chưa lưu trữ được: còn số tồn nào khác 0 hoặc còn chứng từ mở có SKU này */
export function archiveBlockers(companyId: string, variantId: string): string[] {
  const level = inventory.levels.find((l) => l.companyId === companyId && l.variantId === variantId);
  const reasons: string[] = [];
  if (level?.onHand) reasons.push(`Còn ${level.onHand} tồn thực`);
  if (level?.reserved) reasons.push(`Còn ${level.reserved} đang giữ cho đơn`);
  if (level?.incoming) reasons.push(`Còn ${level.incoming} đang về`);
  if (level?.quarantine) reasons.push(`Còn ${level.quarantine} chờ xử lý`);
  const has = (lines: { variantId: string | null }[]) => lines.some((l) => l.variantId === variantId);
  const docs = [
    ...purchasing.requests
      .filter((r) => r.companyId === companyId && OPEN_REQUEST.has(r.status) && has(r.lines))
      .map((r) => `đề nghị nhập ${r.number}`),
    ...purchasing.receipts
      .filter((r) => r.companyId === companyId && r.status === 'counting' && has(r.lines))
      .map((r) => `phiếu nhận ${r.number}`),
    ...purchasing.returns
      .filter((r) => r.companyId === companyId && OPEN_RETURN.has(r.status) && has(r.lines))
      .map((r) => `phiếu trả NCC ${r.number}`),
    ...inventory.docs
      .filter((d) => d.companyId === companyId && (d.status === 'draft' || d.status === 'pending') && has(d.lines))
      .map((d) => `phiếu kho ${d.number}`),
  ];
  if (docs.length) reasons.push(`Còn chứng từ mở: ${docs.join(', ')}`);
  return reasons;
}

/** Thiếu ảnh hoặc mô tả ở cha thì mọi SKU con Chờ hoàn thiện; thiếu giá chuẩn tính theo SKU */
function missingOf(p: MockProduct, v: MockVariant): string[] {
  const standard = pricing.pricelists.find((pl) => pl.companyId === p.companyId && pl.type === 'standard');
  return [
    !p.imageFileIds.length && 'Ảnh',
    !p.description.trim() && 'Mô tả',
    standard?.prices[v.id] === undefined && 'Giá chuẩn',
  ].filter((x): x is string => Boolean(x));
}

const listingsOf = (companyId: string, variantId: string) =>
  channel.listings.filter((l) => l.companyId === companyId && l.variantId === variantId);

/** Hiện diện trên sàn: có listing đã đẩy thì đang bán, ghép mà chưa đẩy thì chờ sàn. "Có lỗi" đến từ FE#58 */
function presenceOf(companyId: string, variantId: string): VariantPresence {
  const ls = listingsOf(companyId, variantId);
  if (!ls.length) return 'not_listed';
  return ls.some((l) => l.lastPushedAt) ? 'live' : 'pending';
}

export const toVariant = (p: MockProduct, v: MockVariant): ProductVariant => {
  const missing = missingOf(p, v);
  return {
    id: v.id,
    sku: v.sku,
    attributes: variantAttributes(p.companyId, v.valueIds),
    archivedAt: v.archivedAt,
    businessStatus: v.businessStatus,
    readiness: missing.length ? 'incomplete' : 'ready',
    missing,
    presence: presenceOf(p.companyId, v.id),
    listingCount: listingsOf(p.companyId, v.id).length,
    archiveBlockers: v.businessStatus === 'archived' ? [] : archiveBlockers(p.companyId, v.id),
  };
};

/** Cha lưu trữ khi mọi SKU con lưu trữ */
function syncProductArchived(p: MockProduct, at: string) {
  const all = p.variants.every((v) => v.businessStatus === 'archived');
  if (all && !p.archivedAt) p.archivedAt = at;
  if (!all) p.archivedAt = null;
}

/** Đổi trạng thái một SKU kèm việc theo sau: ẩn/hiện listing, gỡ mọi listing khi lưu trữ */
function applyBusinessStatus(p: MockProduct, v: MockVariant, to: VariantBusinessStatus, at: string) {
  const from = v.businessStatus;
  v.businessStatus = to;
  v.archivedAt = to === 'archived' ? at : null;
  if (to === 'archived') {
    for (let i = channel.listings.length - 1; i >= 0; i--) {
      const l = channel.listings[i];
      if (l.companyId === p.companyId && l.variantId === v.id) channel.listings.splice(i, 1);
    }
  } else if (hidesListings(from) !== hidesListings(to)) {
    for (const l of listingsOf(p.companyId, v.id)) {
      l.hidden = hidesListings(to);
      l.version += 1;
    }
  }
  syncProductArchived(p, at);
}

export function fileUrl(id: string) {
  return catalog.files.find((f) => f.id === id)?.url ?? '';
}

export function toProductItem(p: MockProduct): ProductListItem {
  const category = catalog.categories.find((c) => c.id === p.categoryId);
  const variants = p.variants.map((v) => toVariant(p, v));
  const labelCounts: Record<VariantMainLabel, number> = { archived: 0, discontinued: 0, paused: 0, live: 0, pending: 0, not_listed: 0 };
  for (const v of variants) labelCounts[mainLabel(v.businessStatus, v.presence)] += 1;
  const current = variants.filter((v) => v.businessStatus !== 'archived');
  return {
    id: p.id,
    name: p.name,
    category: { id: p.categoryId, name: category?.name ?? '' },
    variantCount: current.length,
    variantTotal: variants.length,
    labelCounts,
    incompleteCount: current.filter((v) => v.readiness === 'incomplete').length,
    errorCount: current.filter((v) => v.presence === 'error').length,
    thumbnailUrl: p.imageFileIds[0] ? fileUrl(p.imageFileIds[0]) : null,
    status: p.archivedAt ? 'archived' : 'active',
    updatedAt: p.updatedAt,
    version: p.version,
  };
}

export function toProductDetail(p: MockProduct): ProductDetail {
  return {
    ...toProductItem(p),
    description: p.description,
    images: p.imageFileIds.map((fileId, position) => ({
      id: `${p.id}:${fileId}`,
      fileId,
      url: fileUrl(fileId),
      position,
    })),
    variants: p.variants.map((v) => toVariant(p, v)),
  };
}

export const categoryEntity = (c: MockCategory) => ({ type: 'catalog.categories', id: c.id, label: c.name });
export const categorySnapshot = (c: MockCategory) => ({ name: c.name, skuPattern: c.skuPattern });
export const attributeEntity = (a: MockAttribute) => ({ type: 'catalog.attributes', id: a.id, label: a.name });
export const attributeSnapshot = (a: MockAttribute) => ({
  name: a.name,
  values: a.values.map((v) => `${v.value} (${v.code})`),
});
export const productEntity = (p: MockProduct) => ({ type: 'catalog.products', id: p.id, label: p.name });
export function productSnapshot(p: MockProduct) {
  return {
    name: p.name,
    category: catalog.categories.find((c) => c.id === p.categoryId)?.name ?? '',
    description: p.description,
    images: p.imageFileIds.length,
    variants: p.variants.filter((v) => v.businessStatus !== 'archived').map((v) => v.sku),
  };
}

/** Không có hoặc của công ty khác đều 404 not_found, không lộ là bản ghi tồn tại (docs/21 C4) */
export function findOwned<T extends { id: string; companyId: string }>(
  list: T[],
  id: unknown,
  companyId: string,
  what: string,
): { ok: true; value: T } | { ok: false; response: Response } {
  const item = list.find((x) => x.id === id);
  if (!item || item.companyId !== companyId) {
    return { ok: false, response: problem(404, `Không tìm thấy ${what}`, { code: 'not_found' }) };
  }
  return { ok: true, value: item };
}

/** Tên trùng trong công ty: 409 name_taken kèm errors.name (docs/21 V24) */
export function nameTaken(message: string) {
  return problem(409, 'Tên đã được dùng', { code: 'name_taken', errors: { name: message } });
}

export function staleVersion(url: URL, current: number) {
  const v = url.searchParams.get('version');
  return v !== null && Number(v) !== current;
}

export function validateCategory(body: CategoryInput, companyId: string, exceptId?: string) {
  const errors: Record<string, string> = {};
  const name = body.name?.trim() ?? '';
  if (!name) errors.name = 'Nhập tên danh mục';
  else if (name.length > 60) errors.name = 'Tên danh mục tối đa 60 ký tự';
  const patternError = skuPatternError(body.skuPattern ?? '');
  if (patternError) errors.skuPattern = patternError;
  if (Object.keys(errors).length) return problem(422, 'Dữ liệu chưa hợp lệ', { errors });
  if (catalog.categories.some((c) => c.companyId === companyId && c.id !== exceptId && sameText(c.name, name))) {
    return nameTaken('Đã có danh mục cùng tên');
  }
  return null;
}

export function validateAttribute(body: AttributeInput, companyId: string, exceptId?: string) {
  const errors: Record<string, string> = {};
  const name = body.name?.trim() ?? '';
  if (!name) errors.name = 'Nhập tên thuộc tính';
  else if (name.length > 40) errors.name = 'Tên thuộc tính tối đa 40 ký tự';
  const values = (body.values ?? []).map((v) => v.value.trim());
  if (!values.length) errors.values = 'Thêm ít nhất một giá trị';
  else if (values.some((v) => !v || v.length > 40)) errors.values = 'Mỗi giá trị từ 1 đến 40 ký tự';
  else if (new Set(values.map((v) => v.toLowerCase())).size !== values.length) {
    errors.values = 'Có giá trị bị trùng';
  }
  // V21: mã bỏ trống thì sinh từ giá trị; trùng mã trong một thuộc tính báo tại ô của dòng sau
  const seen = new Set<string>();
  attributeCodes(body).forEach((code, i) => {
    if (!/^[A-Z0-9]{1,6}$/.test(code)) errors[`values.${i}.code`] = 'Mã chỉ gồm A-Z, 0-9, tối đa 6 ký tự';
    else if (seen.has(code)) errors[`values.${i}.code`] = 'Mã bị trùng';
    seen.add(code);
  });
  if (Object.keys(errors).length) return problem(422, 'Dữ liệu chưa hợp lệ', { errors });
  if (catalog.attributes.some((a) => a.companyId === companyId && a.id !== exceptId && sameText(a.name, name))) {
    return nameTaken('Đã có thuộc tính cùng tên');
  }
  return null;
}

export function attributeCodes(body: AttributeInput) {
  return (body.values ?? []).map((v) => v.code?.trim().toUpperCase() || valueCode(v.value));
}

/** Tập thuộc tính của một tổ hợp; null nếu có giá trị lạ hoặc hai giá trị cùng thuộc tính */
export function comboAttributes(companyId: string, valueIds: string[]): string[] | null {
  const attrs: string[] = [];
  for (const id of valueIds) {
    const found = findValue(companyId, id);
    if (!found || attrs.includes(found.attribute.id)) return null;
    attrs.push(found.attribute.id);
  }
  return attrs.sort();
}

export const comboKey = (valueIds: string[]) => [...valueIds].sort().join('|');

/** SKU duy nhất trong công ty: trùng (quy tắc hai danh mục giống nhau) thì lấy số kế tiếp */
export function nextVariant(category: MockCategory, valueIds: string[]): MockVariant {
  const taken = new Set(companyProducts(category.companyId).flatMap((p) => p.variants.map((v) => v.sku)));
  let variant = catalog.makeVariant(category, valueIds, rid('var'));
  while (taken.has(variant.sku)) variant = catalog.makeVariant(category, valueIds, variant.id);
  return variant;
}

export function validateImages(companyId: string, ids: string[] | undefined, errors: Record<string, string>) {
  const list = ids ?? [];
  if (list.length > 9) errors.images = 'Tối đa 9 ảnh';
  else if (new Set(list).size !== list.length) errors.images = 'Ảnh bị trùng';
  else if (
    list.some((id) => {
      const f = catalog.files.find((x) => x.id === id);
      return !f || f.companyId !== companyId || !f.url;
    })
  ) {
    errors.images = 'Có ảnh chưa tải xong hoặc không thuộc công ty';
  } else {
    const big = list.map((id) => catalog.files.find((x) => x.id === id)!).find((f) => f.sizeBytes > MAX_IMAGE_BYTES);
    if (big) errors.images = `Ảnh ${big.fileName} lớn hơn 5 MB`;
  }
}

export function productNameTaken(companyId: string, name: string, exceptId?: string) {
  return companyProducts(companyId).some((p) => !p.archivedAt && p.id !== exceptId && sameText(p.name, name));
}

export function validateProductText(body: { name?: string; description?: string }, errors: Record<string, string>) {
  const name = body.name?.trim() ?? '';
  if (!name) errors.name = 'Nhập tên sản phẩm';
  else if (name.length > 200) errors.name = 'Tên sản phẩm tối đa 200 ký tự';
  if ((body.description ?? '').length > 5000) errors.description = 'Mô tả tối đa 5000 ký tự';
}

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const catalogHandlers = [
  // ----- Danh mục -----
  http.get(`${API}/catalog/categories`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productView);
    if (!guard.ok) return guard.response;
    return HttpResponse.json(
      catalog.categories
        .filter((c) => c.companyId === guard.value.companyId)
        .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
        .map(toCategory),
    );
  }),

  http.post(`${API}/catalog/categories`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.catalogSetup);
    if (!guard.ok) return guard.response;
    const body = (await request.json()) as CategoryInput;
    const invalid = validateCategory(body, guard.value.companyId);
    if (invalid) return invalid;
    const category: MockCategory = {
      id: rid('cat'),
      companyId: guard.value.companyId,
      name: body.name.trim(),
      skuPattern: body.skuPattern.trim(),
      skuNextSeq: 1,
      version: 1,
      updatedAt: db.now(),
    };
    catalog.categories.push(category);
    writeCompanyLog(guard.value, 'create', categoryEntity(category), null, categorySnapshot(category));
    return HttpResponse.json(toCategory(category), { status: 201 });
  }),

  http.put(`${API}/catalog/categories/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.catalogSetup);
    if (!guard.ok) return guard.response;
    const found = findOwned(catalog.categories, params.id, guard.value.companyId, 'danh mục');
    if (!found.ok) return found.response;
    const category = found.value;
    const body = (await request.json()) as CategoryInput & { version: number };
    if (body.version !== category.version) {
      return versionConflict(toCategory(category), 'Danh mục vừa được người khác sửa.');
    }
    const invalid = validateCategory(body, guard.value.companyId, category.id);
    if (invalid) return invalid;
    const before = categorySnapshot(category);
    // Đổi quy tắc chỉ áp dụng cho SKU sinh sau này; SKU cũ giữ nguyên
    category.name = body.name.trim();
    category.skuPattern = body.skuPattern.trim();
    category.version += 1;
    category.updatedAt = db.now();
    writeCompanyLog(guard.value, 'update', categoryEntity(category), before, categorySnapshot(category));
    return HttpResponse.json(toCategory(category));
  }),

  http.delete(`${API}/catalog/categories/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.catalogSetup);
    if (!guard.ok) return guard.response;
    const found = findOwned(catalog.categories, params.id, guard.value.companyId, 'danh mục');
    if (!found.ok) return found.response;
    const category = found.value;
    if (staleVersion(new URL(request.url), category.version)) {
      return versionConflict(toCategory(category), 'Danh mục vừa được người khác sửa.');
    }
    const count = toCategory(category).productCount;
    if (count) {
      return problem(409, 'Danh mục đang được dùng', {
        code: 'in_use',
        detail: `Không xoá được danh mục ${category.name} vì có ${count} sản phẩm đang dùng.`,
      });
    }
    catalog.categories.splice(catalog.categories.indexOf(category), 1);
    writeCompanyLog(guard.value, 'delete', categoryEntity(category), categorySnapshot(category), null);
    return new HttpResponse(null, { status: 204 });
  }),

  // ----- Thuộc tính -----
  http.get(`${API}/catalog/attributes`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productView);
    if (!guard.ok) return guard.response;
    return HttpResponse.json(
      catalog.attributes.filter((a) => a.companyId === guard.value.companyId).map(toAttribute),
    );
  }),

  http.post(`${API}/catalog/attributes`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.catalogSetup);
    if (!guard.ok) return guard.response;
    const body = (await request.json()) as AttributeInput;
    const invalid = validateAttribute(body, guard.value.companyId);
    if (invalid) return invalid;
    const attribute: MockAttribute = {
      id: rid('att'),
      companyId: guard.value.companyId,
      name: body.name.trim(),
      values: body.values.map((v, i) => ({ id: rid('val'), value: v.value.trim(), code: attributeCodes(body)[i] })),
      version: 1,
    };
    catalog.attributes.push(attribute);
    writeCompanyLog(guard.value, 'create', attributeEntity(attribute), null, attributeSnapshot(attribute));
    return HttpResponse.json(toAttribute(attribute), { status: 201 });
  }),

  http.put(`${API}/catalog/attributes/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.catalogSetup);
    if (!guard.ok) return guard.response;
    const found = findOwned(catalog.attributes, params.id, guard.value.companyId, 'thuộc tính');
    if (!found.ok) return found.response;
    const attribute = found.value;
    const body = (await request.json()) as AttributeInput & { version: number };
    if (body.version !== attribute.version) {
      return versionConflict(toAttribute(attribute), 'Thuộc tính vừa được người khác sửa.');
    }
    const invalid = validateAttribute(body, guard.value.companyId, attribute.id);
    if (invalid) return invalid;
    if (body.values.some((v) => v.id && !attribute.values.some((x) => x.id === v.id))) {
      return problem(422, 'Giá trị không thuộc thuộc tính này');
    }
    const used = usedValueIds(guard.value.companyId);
    const removedInUse = attribute.values.filter(
      (v) => used.has(v.id) && !body.values.some((x) => x.id === v.id),
    );
    if (removedInUse.length) {
      return problem(409, 'Giá trị đang được dùng', {
        code: 'in_use',
        detail: `Không xoá được ${removedInUse.map((v) => v.value).join(', ')} vì đã có biến thể dùng.`,
      });
    }
    const before = attributeSnapshot(attribute);
    attribute.name = body.name.trim();
    const codes = attributeCodes(body);
    // Đổi mã chỉ ảnh hưởng SKU sinh sau này; SKU đã cấp giữ nguyên
    attribute.values = body.values.map((v, i) => ({ id: v.id ?? rid('val'), value: v.value.trim(), code: codes[i] }));
    attribute.version += 1;
    writeCompanyLog(guard.value, 'update', attributeEntity(attribute), before, attributeSnapshot(attribute));
    return HttpResponse.json(toAttribute(attribute));
  }),

  http.delete(`${API}/catalog/attributes/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.catalogSetup);
    if (!guard.ok) return guard.response;
    const found = findOwned(catalog.attributes, params.id, guard.value.companyId, 'thuộc tính');
    if (!found.ok) return found.response;
    const attribute = found.value;
    if (staleVersion(new URL(request.url), attribute.version)) {
      return versionConflict(toAttribute(attribute), 'Thuộc tính vừa được người khác sửa.');
    }
    const count = toAttribute(attribute).productCount;
    if (count) {
      return problem(409, 'Thuộc tính đang được dùng', {
        code: 'in_use',
        detail: `Không xoá được thuộc tính ${attribute.name} vì có ${count} sản phẩm đang dùng.`,
      });
    }
    catalog.attributes.splice(catalog.attributes.indexOf(attribute), 1);
    writeCompanyLog(guard.value, 'delete', attributeEntity(attribute), attributeSnapshot(attribute), null);
    return new HttpResponse(null, { status: 204 });
  }),

  // ----- Sản phẩm -----
  http.get(`${API}/catalog/products`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    const search = url.searchParams.get('search')?.trim().toLowerCase();
    const categoryId = url.searchParams.get('categoryId');
    const status = url.searchParams.get('status') ?? 'active';
    let items = companyProducts(guard.value.companyId).filter((p) =>
      status === 'archived' ? p.archivedAt : !p.archivedAt,
    );
    if (categoryId) items = items.filter((p) => p.categoryId === categoryId);
    const businessStatus = url.searchParams.get('businessStatus');
    if (businessStatus) items = items.filter((p) => p.variants.some((v) => v.businessStatus === businessStatus));
    if (search) {
      items = items.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          p.variants.some((v) => v.sku.toLowerCase().includes(search)),
      );
    }
    items = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return HttpResponse.json(paginate(items.map(toProductItem), page, pageSize));
  }),

  http.get(`${API}/catalog/products/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productView);
    if (!guard.ok) return guard.response;
    const found = findOwned(catalog.products, params.id, guard.value.companyId, 'sản phẩm');
    if (!found.ok) return found.response;
    return HttpResponse.json(toProductDetail(found.value));
  }),

  http.post(`${API}/catalog/products`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productManage);
    if (!guard.ok) return guard.response;
    const companyId = guard.value.companyId;
    const body = (await request.json()) as ProductCreateInput;
    const errors: Record<string, string> = {};
    validateProductText(body, errors);
    const category = catalog.categories.find((c) => c.id === body.categoryId && c.companyId === companyId);
    if (!category) errors.categoryId = 'Chọn danh mục';
    validateImages(companyId, body.imageFileIds, errors);

    const combos = (body.variants ?? []).map((v) => v.attributeValueIds ?? []);
    const sets = combos.map((c) => comboAttributes(companyId, c));
    if (!combos.length) errors.variants = 'Cần ít nhất một biến thể';
    else if (combos.length > 100) errors.variants = 'Tối đa 100 biến thể mỗi lần tạo';
    else if (sets.some((x) => x === null)) errors.variants = 'Biến thể có giá trị không hợp lệ';
    else if (new Set(sets.map((x) => x!.join('|'))).size > 1) {
      errors.variants = 'Mọi biến thể phải dùng cùng bộ thuộc tính';
    } else if (new Set(combos.map(comboKey)).size !== combos.length) {
      errors.variants = 'Có tổ hợp thuộc tính bị trùng';
    }
    if (Object.keys(errors).length) return problem(422, 'Dữ liệu chưa hợp lệ', { errors });
    if (productNameTaken(companyId, body.name)) return nameTaken('Đã có sản phẩm cùng tên');

    const product: MockProduct = {
      id: rid('prd'),
      companyId,
      categoryId: category!.id,
      name: body.name.trim(),
      description: body.description ?? '',
      imageFileIds: body.imageFileIds ?? [],
      variants: [],
      archivedAt: null,
      updatedAt: db.now(),
      version: 1,
    };
    product.variants = combos.map((c) => {
      const v = nextVariant(category!, c);
      // nextVariant chỉ thấy sản phẩm đã lưu; giữ SKU duy nhất trong cùng lần tạo
      product.variants.push(v);
      return v;
    });
    catalog.products.unshift(product);
    writeCompanyLog(guard.value, 'create', productEntity(product), null, productSnapshot(product));
    return HttpResponse.json(toProductDetail(product), { status: 201 });
  }),

  http.put(`${API}/catalog/products/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productManage);
    if (!guard.ok) return guard.response;
    const found = findOwned(catalog.products, params.id, guard.value.companyId, 'sản phẩm');
    if (!found.ok) return found.response;
    const product = found.value;
    const body = (await request.json()) as ProductUpdateInput;
    if (body.version !== product.version) {
      return versionConflict(toProductDetail(product), 'Sản phẩm vừa được người khác sửa.');
    }
    if (product.archivedAt) {
      return problem(409, 'Sản phẩm đã lưu trữ', { code: 'product_archived' });
    }
    const errors: Record<string, string> = {};
    validateProductText(body, errors);
    validateImages(guard.value.companyId, body.imageFileIds, errors);
    if (Object.keys(errors).length) return problem(422, 'Dữ liệu chưa hợp lệ', { errors });
    if (productNameTaken(guard.value.companyId, body.name, product.id)) {
      return nameTaken('Đã có sản phẩm cùng tên');
    }
    const before = productSnapshot(product);
    product.name = body.name.trim();
    product.description = body.description ?? '';
    product.imageFileIds = body.imageFileIds ?? [];
    product.version += 1;
    product.updatedAt = db.now();
    writeCompanyLog(guard.value, 'update', productEntity(product), before, productSnapshot(product));
    return HttpResponse.json(toProductDetail(product));
  }),

  // Đổi trạng thái kinh doanh: không có variantIds thì áp cho mọi SKU con (sơ đồ B1: thao tác trên cha áp cho con)
  http.post(`${API}/catalog/products/:id/business-status`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productManage);
    if (!guard.ok) return guard.response;
    const found = findOwned(catalog.products, params.id, guard.value.companyId, 'sản phẩm');
    if (!found.ok) return found.response;
    const product = found.value;
    const body = (await request.json()) as BusinessStatusInput;
    if (!BUSINESS_ACTIONS.includes(body.action)) {
      return problem(422, 'Thao tác không hợp lệ', { errors: { action: 'Chọn thao tác' } });
    }
    const targets = body.variantIds?.length
      ? product.variants.filter((v) => body.variantIds!.includes(v.id))
      : product.variants;
    if (!targets.length || (body.variantIds && targets.length !== body.variantIds.length)) {
      return problem(404, 'Không tìm thấy biến thể', { code: 'not_found' });
    }
    const at = db.now();
    const applied: string[] = [];
    const skipped: BusinessStatusResult['skipped'] = [];
    const checks = targets.map((v) => {
      const blockers = archiveBlockers(product.companyId, v.id);
      const r = variantMachine.check(v.businessStatus, body.action, {
        actor: { accountId: guard.value.account.id, permissions: guard.value.permissions },
        record: { archiveBlockers: blockers },
      });
      return { v, r, blockers };
    });
    // Một SKU: trả lỗi như các máy trạng thái khác để UI báo rõ
    if (targets.length === 1 && !checks[0].r.ok) {
      const { v, blockers } = checks[0];
      if (checks[0].r.code === 'archive_blocked') {
        return problem(409, 'Chưa lưu trữ được', {
          code: 'archive_blocked',
          detail: `${v.sku}: ${blockers.join('; ')}.`,
          reasons: blockers,
        });
      }
      const res = checkTransition(variantMachine, v.businessStatus, body.action, guard.value, { archiveBlockers: blockers });
      if (!res.ok) return res.response;
    }
    for (const { v, r, blockers } of checks) {
      if (!r.ok) {
        if (r.code === 'forbidden') return problem(403, 'Không có quyền', { code: 'forbidden' });
        // SKU đang ở trạng thái không có thao tác này thì bỏ qua lặng lẽ; bị chặn thì báo lý do
        if (r.code === 'archive_blocked') skipped.push({ variantId: v.id, sku: v.sku, code: r.code, reasons: blockers });
        else skipped.push({ variantId: v.id, sku: v.sku, code: r.code, reasons: [] });
        continue;
      }
      const from = v.businessStatus;
      applyBusinessStatus(product, v, r.to, at);
      applied.push(v.id);
      writeCompanyLog(
        guard.value,
        'update',
        { type: 'catalog.product_variants', id: v.id, label: v.sku },
        { businessStatus: from },
        { businessStatus: r.to },
      );
    }
    if (applied.length) product.updatedAt = at;
    const result: BusinessStatusResult = { product: toProductDetail(product), applied, skipped };
    return HttpResponse.json(result);
  }),

  // ----- Biến thể -----
  http.post(`${API}/catalog/products/:id/variants`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productManage);
    if (!guard.ok) return guard.response;
    const companyId = guard.value.companyId;
    const found = findOwned(catalog.products, params.id, companyId, 'sản phẩm');
    if (!found.ok) return found.response;
    const product = found.value;
    if (product.archivedAt) return problem(409, 'Sản phẩm đã lưu trữ', { code: 'product_archived' });
    const { attributeValueIds = [] } = (await request.json()) as { attributeValueIds: string[] };
    const productAttrs = comboAttributes(companyId, product.variants[0]?.valueIds ?? []) ?? [];
    if (!productAttrs.length) {
      return problem(422, 'Sản phẩm không có thuộc tính', {
        detail: 'Sản phẩm tạo không có thuộc tính nên chỉ có một biến thể.',
      });
    }
    const attrs = comboAttributes(companyId, attributeValueIds);
    if (!attrs || attrs.join('|') !== productAttrs.join('|')) {
      return problem(422, 'Chọn đủ mỗi thuộc tính một giá trị', {
        errors: { attributeValueIds: 'Chọn đủ mỗi thuộc tính một giá trị' },
      });
    }
    const same = product.variants.find((v) => comboKey(v.valueIds) === comboKey(attributeValueIds));
    if (same?.businessStatus === 'archived') {
      return problem(409, 'Biến thể đã lưu trữ', {
        code: 'variant_archived',
        detail: `Tổ hợp này là biến thể ${same.sku} đã lưu trữ. Dùng Khôi phục để bán lại với SKU cũ.`,
        variantId: same.id,
      });
    }
    if (same) {
      return problem(409, 'Biến thể đã tồn tại', {
        code: 'variant_exists',
        detail: `Tổ hợp này đã có biến thể ${same.sku}.`,
      });
    }
    const category = catalog.categories.find((c) => c.id === product.categoryId)!;
    const variant = nextVariant(category, attributeValueIds);
    product.variants.push(variant);
    // Biến thể là bản ghi riêng: không tăng version của sản phẩm để form đang sửa không bị 409
    product.updatedAt = db.now();
    writeCompanyLog(
      guard.value,
      'create',
      { type: 'catalog.product_variants', id: variant.id, label: variant.sku },
      null,
      { product: product.name, sku: variant.sku, attributes: variantAttributes(companyId, variant.valueIds).map((a) => a.value) },
    );
    return HttpResponse.json(toVariant(product, variant), { status: 201 });
  }),

  // ----- Ảnh: vé tải lên (presigned) và nơi nhận file thay cho SeaweedFS/S3 -----
  http.post(`${API}/files/uploads`, async ({ request }) => {
    await delay(150);
    const { purpose, ...body } = (await request.json()) as {
      fileName: string;
      contentType: string;
      sizeBytes: number;
      purpose?: string;
    };
    // Đính kèm chứng từ (FE#55): mọi thành viên, nhận cả PDF, tối đa 10 MB
    const attachment = purpose === 'attachment';
    const guard = requireCompany(request, attachment ? null : PERMISSIONS.productManage);
    if (!guard.ok) return guard.response;
    if (attachment ? !ATTACHMENT_TYPES.includes(body.contentType) : !IMAGE_TYPES.includes(body.contentType)) {
      return problem(422, attachment ? 'Chỉ nhận ảnh JPG, PNG, WebP hoặc PDF' : 'Chỉ nhận ảnh JPG, PNG hoặc WebP', {
        code: 'file_type_not_allowed',
      });
    }
    if (body.sizeBytes > (attachment ? MAX_ATTACHMENT_BYTES : MAX_IMAGE_BYTES)) {
      return problem(422, attachment ? 'Tệp tối đa 10 MB' : 'Ảnh tối đa 5 MB', { code: 'file_too_large' });
    }
    const id = rid('fil');
    catalog.files.push({ id, companyId: guard.value.companyId, ...body, url: null });
    const ticket: UploadTicket = {
      fileId: id,
      uploadUrl: `${new URL(request.url).origin}${API}/files/uploads/${id}/content`,
      headers: { 'Content-Type': body.contentType },
    };
    return HttpResponse.json(ticket, { status: 201 });
  }),

  http.put(`${API}/files/uploads/:id/content`, async ({ params, request }) => {
    await delay(300);
    const file = catalog.files.find((f) => f.id === params.id);
    if (!file || file.url) return new HttpResponse(null, { status: 403 });
    const bytes = new Uint8Array(await request.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    file.url = `data:${file.contentType};base64,${btoa(binary)}`;
    // Kích thước thật có thể khác khai báo khi xin vé (V26)
    file.sizeBytes = bytes.length;
    return new HttpResponse(null, { status: 200 });
  }),
];
