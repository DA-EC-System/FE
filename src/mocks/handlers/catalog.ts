import { http, HttpResponse, delay } from 'msw';
import { db } from '../db';
import * as catalog from '../catalogData';
import type { MockCategory, MockAttribute, MockProduct, MockVariant } from '../catalogData';
import { skuPatternError, valueCode } from '@/utils/sku';
import type { Attribute, AttributeInput, Category, CategoryInput, ProductCreateInput, ProductDetail, ProductListItem, ProductUpdateInput, ProductVariant, UploadTicket, VariantAttribute } from '@/types/catalog';
import { PERMISSIONS } from '@/utils/permissions';
import { ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES } from '@/utils/files';
import { API, LATENCY, pageParams, paginate, problem, requireCompany } from './utils';
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

export const toVariant = (companyId: string, v: MockVariant): ProductVariant => ({
  id: v.id,
  sku: v.sku,
  attributes: variantAttributes(companyId, v.valueIds),
  archivedAt: v.archivedAt,
});

export function fileUrl(id: string) {
  return catalog.files.find((f) => f.id === id)?.url ?? '';
}

export function toProductItem(p: MockProduct): ProductListItem {
  const category = catalog.categories.find((c) => c.id === p.categoryId);
  return {
    id: p.id,
    name: p.name,
    category: { id: p.categoryId, name: category?.name ?? '' },
    variantCount: p.variants.filter((v) => !v.archivedAt).length,
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
    variants: p.variants.map((v) => toVariant(p.companyId, v)),
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
    variants: p.variants.filter((v) => !v.archivedAt).map((v) => v.sku),
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

  http.delete(`${API}/catalog/products/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productManage);
    if (!guard.ok) return guard.response;
    const found = findOwned(catalog.products, params.id, guard.value.companyId, 'sản phẩm');
    if (!found.ok) return found.response;
    const product = found.value;
    if (staleVersion(new URL(request.url), product.version)) {
      return versionConflict(toProductDetail(product), 'Sản phẩm vừa được người khác sửa.');
    }
    if (product.archivedAt) return problem(409, 'Sản phẩm đã lưu trữ', { code: 'product_archived' });
    if (catalog.productsWithActiveOrders.has(product.id)) {
      return problem(409, 'Sản phẩm đang có đơn hàng', {
        code: 'product_has_active_orders',
        detail: `Không xoá được ${product.name} vì đang có đơn hàng chưa hoàn tất.`,
      });
    }
    const before = productSnapshot(product);
    product.archivedAt = db.now();
    product.version += 1;
    product.updatedAt = db.now();
    writeCompanyLog(guard.value, 'delete', productEntity(product), before, null);
    return new HttpResponse(null, { status: 204 });
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
    if (same && !same.archivedAt) {
      return problem(409, 'Biến thể đã tồn tại', {
        code: 'variant_exists',
        detail: `Tổ hợp này đã có biến thể ${same.sku}.`,
      });
    }
    const category = catalog.categories.find((c) => c.id === product.categoryId)!;
    let variant: MockVariant;
    if (same) {
      // Tổ hợp từng ngừng bán: bán lại với SKU cũ, không cấp SKU mới
      same.archivedAt = null;
      variant = same;
    } else {
      variant = nextVariant(category, attributeValueIds);
      product.variants.push(variant);
    }
    // Biến thể là bản ghi riêng: không tăng version của sản phẩm để form đang sửa không bị 409
    product.updatedAt = db.now();
    writeCompanyLog(
      guard.value,
      'create',
      { type: 'catalog.product_variants', id: variant.id, label: variant.sku },
      null,
      { product: product.name, sku: variant.sku, attributes: toVariant(companyId, variant).attributes.map((a) => a.value) },
    );
    return HttpResponse.json(toVariant(companyId, variant), { status: same ? 200 : 201 });
  }),

  http.delete(`${API}/catalog/products/:id/variants/:variantId`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productManage);
    if (!guard.ok) return guard.response;
    const found = findOwned(catalog.products, params.id, guard.value.companyId, 'sản phẩm');
    if (!found.ok) return found.response;
    const product = found.value;
    const variant = product.variants.find((v) => v.id === params.variantId);
    if (!variant || variant.archivedAt) {
      return problem(404, 'Không tìm thấy biến thể đang bán', { code: 'not_found' });
    }
    if (product.variants.filter((v) => !v.archivedAt).length === 1) {
      return problem(409, 'Cần giữ ít nhất một biến thể', {
        code: 'last_variant',
        detail: 'Sản phẩm phải còn ít nhất một biến thể đang bán. Muốn ngừng hẳn thì xoá sản phẩm.',
      });
    }
    variant.archivedAt = db.now();
    // Biến thể là bản ghi riêng: không tăng version của sản phẩm để form đang sửa không bị 409
    product.updatedAt = db.now();
    writeCompanyLog(
      guard.value,
      'delete',
      { type: 'catalog.product_variants', id: variant.id, label: variant.sku },
      { product: product.name, sku: variant.sku },
      null,
    );
    return new HttpResponse(null, { status: 204 });
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
