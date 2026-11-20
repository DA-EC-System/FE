import { http, HttpResponse, delay } from 'msw';
import { db } from '../db';
import * as catalog from '../catalogData';
import type { MockAttribute, MockGroup, MockProduct, MockProductSettings, MockVariant } from '../catalogData';
import { skuPatternError, valueCode } from '@/utils/sku';
import * as inventory from '../inventoryData';
import * as purchasing from '../purchasingData';
import * as channel from '../channelData';
import * as pricing from '../pricingData';
import { SPEC_LIMITS, specOf } from '../catalogBulkData';
import type { Attribute, AttributeInput, BusinessStatusInput, BusinessStatusResult, ProductCreateInput, ProductGroup, ProductGroupInput, ProductSettings, ProductSettingsInput, SuggestConfig, ProductDetail, ProductListItem, ProductUpdateInput, ProductVariant, UploadTicket, VariantAttribute, VariantBusinessStatus, VariantMainLabel, VariantMissing, VariantPresence, VariantUpdateInput } from '@/types/catalog';
import { BUSINESS_ACTIONS, hidesListings, mainLabel, variantMachine } from '@/lib/machines/product';
import { PERMISSIONS } from '@/utils/permissions';
import { ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES } from '@/utils/files';
import type { PageResult } from '@/api/types';
import { API, LATENCY, lag, checkTransition, pageParams, paginate, problem, requireCompany, requireCompanyAny } from './utils';
import { versionConflict, writeCompanyLog } from './identity';
import { delistVariant, setListingsHidden } from './channel';
import { isListingError, onPlatform, presenceFrom } from '@/lib/machines/channel';

// ---------- Catalog (UC-CP-01, UC-CP-02) và ảnh qua module files ----------
export const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
export const rid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function companyProducts(companyId: string) {
  return catalog.products.filter((p) => p.companyId === companyId);
}

export function toGroup(g: MockGroup): ProductGroup {
  return {
    id: g.id,
    name: g.name,
    productCount: catalog.products.filter((p) => p.groupId === g.id).length,
    suggest: { ...g.suggest },
    updatedAt: g.updatedAt,
    version: g.version,
  };
}

export function toSettings(s: MockProductSettings): ProductSettings {
  return { skuPattern: s.skuPattern, skuNextSeq: s.skuNextSeq, suggest: { ...s.suggest }, version: s.version };
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
    platformKind: a.platformKind,
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
      .map((r) => `phiếu trả nhà cung cấp ${r.number}`),
    ...inventory.docs
      .filter((d) => d.companyId === companyId && (d.status === 'draft' || d.status === 'pending') && has(d.lines))
      .map((d) => `phiếu kho ${d.number}`),
  ];
  if (docs.length) reasons.push(`Còn chứng từ mở: ${docs.join(', ')}`);
  return reasons;
}

const standardList = (companyId: string) =>
  pricing.pricelists.find((pl) => pl.companyId === companyId && pl.type === 'standard');

const reorderOf = (companyId: string, variantId: string) =>
  inventory.reorderRules.find((r) => r.companyId === companyId && r.variantId === variantId);

/** Giá muốn bán của SKU (D7); dữ liệu mẫu chưa có thì lấy giá chuẩn đang đặt làm số khởi đầu */
export function targetOf(p: MockProduct, v: MockVariant): number | null {
  const spec = specOf(v.id);
  if (spec.targetNetPrice === undefined) spec.targetNetPrice = standardList(p.companyId)?.prices[v.id] ?? null;
  return spec.targetNetPrice;
}

/** Mã cha (Documents/21 §17.1): SKU đầu tiên bỏ phần mã giá trị thuộc tính; SKU không thuộc tính thì trùng SKU */
export function productCode(p: MockProduct): string {
  const first = p.variants[0];
  if (!first) return '';
  const codes = new Set(first.valueIds.map((id) => findValue(p.companyId, id)?.value.code).filter(Boolean));
  return first.sku.split('-').filter((seg) => !codes.has(seg)).join('-');
}

/** §17.1: cha thiếu tên, ảnh thì mọi SKU con Chờ hoàn thiện; giá muốn bán, ngưỡng tồn, cân nặng, kích thước tính theo SKU */
function missingOf(p: MockProduct, v: MockVariant): VariantMissing[] {
  const spec = specOf(v.id);
  const checks: [VariantMissing, boolean][] = [
    ['name', !p.name.trim()],
    ['image', !p.imageFileIds.length],
    ['price', targetOf(p, v) === null],
    ['minQty', !reorderOf(p.companyId, v.id)],
    ['weight', spec.weightG === null],
    ['dimensions', spec.lengthMm === null || spec.widthMm === null || spec.heightMm === null],
  ];
  return checks.filter(([, miss]) => miss).map(([k]) => k);
}

/** Listing còn trên sàn của SKU (bỏ listing đã gỡ) */
export const listingsOf = (companyId: string, variantId: string) =>
  channel.listings.filter((l) => l.companyId === companyId && l.variantId === variantId && onPlatform(l.status));

/** Hiện diện trên sàn suy từ trạng thái listing (sơ đồ C2) */
function presenceOf(companyId: string, variantId: string): VariantPresence {
  return presenceFrom(listingsOf(companyId, variantId).map((l) => l.status));
}

export const toVariant = (p: MockProduct, v: MockVariant): ProductVariant => {
  const missing = missingOf(p, v);
  const spec = specOf(v.id);
  return {
    id: v.id,
    standardPrice: standardList(p.companyId)?.prices[v.id] ?? null,
    targetNetPrice: targetOf(p, v),
    minQty: reorderOf(p.companyId, v.id)?.minQty ?? null,
    weightG: spec.weightG,
    lengthMm: spec.lengthMm,
    widthMm: spec.widthMm,
    heightMm: spec.heightMm,
    version: spec.version,
    sku: v.sku,
    attributes: variantAttributes(p.companyId, v.valueIds),
    archivedAt: v.archivedAt,
    businessStatus: v.businessStatus,
    readiness: missing.length ? 'incomplete' : 'ready',
    missing,
    presence: presenceOf(p.companyId, v.id),
    hasListingError: listingsOf(p.companyId, v.id).some((l) => isListingError(l.status)),
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
  if (to === 'archived') delistVariant(p.companyId, v.id);
  else if (hidesListings(from) !== hidesListings(to)) setListingsHidden(p.companyId, v.id, hidesListings(to));
  syncProductArchived(p, at);
}

export function fileUrl(id: string) {
  return catalog.files.find((f) => f.id === id)?.url ?? '';
}

export function toProductItem(p: MockProduct): ProductListItem {
  const group = catalog.groups.find((g) => g.id === p.groupId);
  const variants = p.variants.map((v) => toVariant(p, v));
  const labelCounts: Record<VariantMainLabel, number> = {
    archived: 0, discontinued: 0, paused: 0, live: 0, error: 0, pending: 0, not_listed: 0,
  };
  for (const v of variants) labelCounts[mainLabel(v.businessStatus, v.presence)] += 1;
  const current = variants.filter((v) => v.businessStatus !== 'archived');
  return {
    id: p.id,
    code: productCode(p),
    name: p.name,
    group: { id: p.groupId, name: group?.name ?? '' },
    variantCount: current.length,
    variantTotal: variants.length,
    labelCounts,
    incompleteCount: current.filter((v) => v.readiness === 'incomplete').length,
    errorCount: current.filter((v) => v.hasListingError).length,
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
    sizeChart: p.sizeChartFileId ? { fileId: p.sizeChartFileId, url: fileUrl(p.sizeChartFileId) } : null,
    originCountry: p.originCountry ?? null,
    brand: p.brand ?? null,
    variants: p.variants.map((v) => toVariant(p, v)),
  };
}

export const groupEntity = (g: MockGroup) => ({ type: 'product.product_groups', id: g.id, label: g.name });
export const groupSnapshot = (g: MockGroup) => ({ name: g.name, ...g.suggest });
export const attributeEntity = (a: MockAttribute) => ({ type: 'product.attributes', id: a.id, label: a.name });
export const attributeSnapshot = (a: MockAttribute) => ({
  name: a.name,
  values: a.values.map((v) => `${v.value} (${v.code})`),
});
export const productEntity = (p: MockProduct) => ({ type: 'product.products', id: p.id, label: p.name });
export function productSnapshot(p: MockProduct) {
  return {
    name: p.name,
    group: catalog.groups.find((g) => g.id === p.groupId)?.name ?? '',
    description: p.description,
    images: p.imageFileIds.length,
    sizeChart: Boolean(p.sizeChartFileId),
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

export function validateGroup(body: ProductGroupInput, companyId: string, exceptId?: string) {
  const errors: Record<string, string> = {};
  const name = body.name?.trim() ?? '';
  if (!name) errors.name = 'Nhập tên nhóm hàng';
  else if (name.length > 60) errors.name = 'Tên nhóm hàng tối đa 60 ký tự';
  if (Object.keys(errors).length) return problem(422, 'Dữ liệu chưa hợp lệ', { errors });
  if (catalog.groups.some((g) => g.companyId === companyId && g.id !== exceptId && sameText(g.name, name))) {
    return nameTaken('Đã có nhóm hàng cùng tên');
  }
  return null;
}

/** Tạo nhanh nhóm (chỉ tên) cho form sản phẩm, đề nghị nhập; gửi `suggest` thì cần quyền quản lý nhóm (21 §5.2) */
const QUICK_GROUP = [PERMISSIONS.catalogSetup, PERMISSIONS.productManage, 'purchasing.request.manage'];

export function validateAttribute(body: AttributeInput, companyId: string, exceptId?: string) {
  const errors: Record<string, string> = {};
  const name = body.name?.trim() ?? '';
  if (!name) errors.name = 'Nhập tên thuộc tính';
  else if (name.length > MAX_AXIS_NAME) errors.name = `Tên thuộc tính tối đa ${MAX_AXIS_NAME} ký tự`;
  const values = (body.values ?? []).map((v) => v.value.trim());
  if (!values.length) errors.values = 'Thêm ít nhất một giá trị';
  else if (values.some((v) => !v || v.length > MAX_AXIS_VALUE)) errors.values = `Mỗi giá trị từ 1 đến ${MAX_AXIS_VALUE} ký tự`;
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
    return nameTaken('Đã có thuộc tính phân loại cùng tên');
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

/** SKU theo mẫu của công ty, duy nhất trong công ty: trùng SKU cũ thì nhảy số kế tiếp (thiết kế FE#350 D3) */
export function nextVariant(companyId: string, valueIds: string[]): MockVariant {
  const settings = catalog.settingsOf(companyId);
  const taken = new Set(companyProducts(companyId).flatMap((p) => p.variants.map((v) => v.sku)));
  let variant = catalog.makeVariant(settings, valueIds, rid('var'));
  while (taken.has(variant.sku)) variant = catalog.makeVariant(settings, valueIds, variant.id);
  return variant;
}

// Luật trục phân loại (Documents/21 §5.2, Lazada): tên ≤ 15, giá trị ≤ 20, ≤ 50 giá trị mỗi trục, tối đa 2 trục
export const MAX_AXIS_NAME = 15;
export const MAX_AXIS_VALUE = 20;
const MAX_AXIS_VALUES = 50;
const lowerTrim = (s: string) => s.trim().toLowerCase();

/**
 * Đọc `axes`, `variants[].options` của `POST /catalog/products`: kiểm luật, rồi trả hàm tạo thuộc tính, giá trị mới (gọi
 * sau khi mọi kiểm tra khác đã qua, như cùng giao dịch) và trả tổ hợp `valueIds` theo thứ tự trục
 */
function readAxes(companyId: string, body: ProductCreateInput, errors: Record<string, string>): (() => string[][]) | null {
  const axes = body.axes ?? [];
  const variants = body.variants ?? [];
  if (axes.length > 2) {
    errors.axes = 'Sản phẩm tối đa 2 thuộc tính phân loại';
    return null;
  }
  const own = catalog.attributes.filter((a) => a.companyId === companyId);
  const resolved = axes.map((axis, i) => {
    const attribute = axis.attributeId
      ? own.find((a) => a.id === axis.attributeId)
      : own.find((a) => sameText(a.name, axis.name ?? ''));
    const name = (axis.name ?? attribute?.name ?? '').trim();
    if (axis.attributeId && !attribute) errors[`axes.${i}.name`] = 'Thuộc tính không có';
    else if (!name) errors[`axes.${i}.name`] = 'Nhập tên thuộc tính';
    else if (name.length > MAX_AXIS_NAME) errors[`axes.${i}.name`] = `Tên thuộc tính tối đa ${MAX_AXIS_NAME} ký tự`;
    const values = axis.values ?? [];
    if (!values.length) errors[`axes.${i}.values`] = 'Thêm ít nhất một giá trị';
    else if (values.length > MAX_AXIS_VALUES) errors[`axes.${i}.values`] = `Mỗi trục tối đa ${MAX_AXIS_VALUES} giá trị`;
    else if (new Set(values.map((v) => lowerTrim(v.value))).size !== values.length) {
      errors[`axes.${i}.values`] = 'Có giá trị bị trùng trong trục';
    }
    values.forEach((v, j) => {
      const text = v.value.trim();
      if (!text) errors[`axes.${i}.values.${j}.value`] = 'Nhập giá trị';
      else if (text.length > MAX_AXIS_VALUE) errors[`axes.${i}.values.${j}.value`] = `Mỗi giá trị tối đa ${MAX_AXIS_VALUE} ký tự`;
    });
    return { attribute, name, values };
  });
  const keys = resolved.map((r) => r.attribute?.id ?? `name:${lowerTrim(r.name)}`);
  if (new Set(keys).size !== keys.length) errors.axes = 'Hai trục phải là hai thuộc tính khác nhau';
  if (!variants.length) errors.variants = 'Cần ít nhất một biến thể';
  else if (variants.length > 100) errors.variants = 'Tối đa 100 biến thể mỗi lần tạo';
  else if (!axes.length && variants.length !== 1) errors.variants = 'Sản phẩm không có thuộc tính phân loại chỉ có một biến thể';
  const combos = new Set<string>();
  variants.forEach((v, i) => {
    const options = v.options ?? [];
    const ok = options.length === axes.length && options.every((o, k) => resolved[k]!.values.some((x) => lowerTrim(x.value) === lowerTrim(o)));
    if (!ok) errors[`variants.${i}`] = 'Chọn mỗi thuộc tính một giá trị có trong trục';
    const key = JSON.stringify(options.map(lowerTrim));
    if (combos.has(key)) errors.variants = 'Có tổ hợp thuộc tính bị trùng';
    combos.add(key);
  });
  if (Object.keys(errors).length) return null;

  return () => {
    // Thuộc tính, giá trị mới tạo cùng lúc với sản phẩm; mã giá trị trùng thì thêm hậu tố số (21 §5.2)
    const attrs = resolved.map((r) => {
      let attribute = r.attribute;
      if (!attribute) {
        attribute = { id: rid('att'), companyId, name: r.name, platformKind: null, values: [], version: 1 };
        catalog.attributes.push(attribute);
      }
      for (const v of r.values) {
        if (attribute.values.some((x) => (v.id && x.id === v.id) || sameText(x.value, v.value))) continue;
        const base = valueCode(v.value) || 'V';
        let code = base;
        for (let n = 2; attribute.values.some((x) => x.code === code); n++) code = `${base.slice(0, 5)}${n}`;
        attribute.values.push({ id: rid('val'), value: v.value.trim(), code });
      }
      return attribute;
    });
    return variants.map((v) => v.options.map((o, k) => attrs[k]!.values.find((x) => sameText(x.value, o))!.id));
  };
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
    if (big) errors.images = `Ảnh ${big.fileName} lớn hơn 1 MB`;
  }
}

/** Ảnh bảng kích cỡ (FE#261): một tệp, cùng điều kiện như ảnh sản phẩm, lỗi ở `errors.sizeChart` */
export function validateSizeChart(companyId: string, id: string | null | undefined, errors: Record<string, string>) {
  if (!id) return;
  const f = catalog.files.find((x) => x.id === id);
  if (!f || f.companyId !== companyId || !f.url) errors.sizeChart = 'Ảnh bảng kích cỡ chưa tải xong hoặc không thuộc công ty';
  else if (f.sizeBytes > MAX_IMAGE_BYTES) errors.sizeChart = `Ảnh ${f.fileName} lớn hơn 1 MB`;
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

// Ảnh sản phẩm JPG, PNG, tối đa 1 MB như backend sau commerio-backend#303 (FE#205)
export const IMAGE_TYPES = ['image/jpeg', 'image/png'];
export const MAX_IMAGE_BYTES = 1024 * 1024;

export const catalogHandlers = [
  // ----- Nhóm hàng (Documents/21 §5.2, FE#350) -----
  http.get(`${API}/catalog/groups`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productView);
    if (!guard.ok) return guard.response;
    const items = catalog.groups
      .filter((g) => g.companyId === guard.value.companyId)
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
      .map(toGroup);
    return HttpResponse.json<{ items: ProductGroup[] }>({ items });
  }),

  http.post(`${API}/catalog/groups`, async ({ request }) => {
    await delay(LATENCY);
    const body = (await request.json()) as ProductGroupInput;
    const guard = body.suggest !== undefined ? requireCompany(request, PERMISSIONS.catalogSetup) : requireCompanyAny(request, QUICK_GROUP);
    if (!guard.ok) return guard.response;
    const invalid = validateGroup(body, guard.value.companyId);
    if (invalid) return invalid;
    const group: MockGroup = {
      id: rid('grp'),
      companyId: guard.value.companyId,
      name: body.name.trim(),
      suggest: { ...catalog.NO_SUGGEST, ...body.suggest },
      version: 1,
      updatedAt: db.now(),
    };
    catalog.groups.push(group);
    writeCompanyLog(guard.value, 'create', groupEntity(group), null, groupSnapshot(group));
    return HttpResponse.json<ProductGroup>(toGroup(group), { status: 201 });
  }),

  http.put(`${API}/catalog/groups/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.catalogSetup);
    if (!guard.ok) return guard.response;
    const found = findOwned(catalog.groups, params.id, guard.value.companyId, 'nhóm hàng');
    if (!found.ok) return found.response;
    const group = found.value;
    const body = (await request.json()) as ProductGroupInput & { version: number };
    if (body.version !== group.version) return versionConflict(toGroup(group), 'Nhóm hàng vừa được người khác sửa.');
    const invalid = validateGroup(body, guard.value.companyId, group.id);
    if (invalid) return invalid;
    const before = groupSnapshot(group);
    group.name = body.name.trim();
    // Không gửi suggest thì giữ, gửi thì thay cả năm
    if (body.suggest) group.suggest = { ...body.suggest };
    group.version += 1;
    group.updatedAt = db.now();
    writeCompanyLog(guard.value, 'update', groupEntity(group), before, groupSnapshot(group));
    return HttpResponse.json<ProductGroup>(toGroup(group));
  }),

  http.delete(`${API}/catalog/groups/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.catalogSetup);
    if (!guard.ok) return guard.response;
    const found = findOwned(catalog.groups, params.id, guard.value.companyId, 'nhóm hàng');
    if (!found.ok) return found.response;
    const group = found.value;
    if (staleVersion(new URL(request.url), group.version)) {
      return versionConflict(toGroup(group), 'Nhóm hàng vừa được người khác sửa.');
    }
    const count = toGroup(group).productCount;
    if (count) {
      return problem(409, 'Nhóm hàng đang được dùng', {
        code: 'in_use',
        detail: `Không xoá được nhóm ${group.name} vì còn ${count} sản phẩm (kể cả đã lưu trữ). Chuyển sản phẩm sang nhóm khác trước.`,
      });
    }
    catalog.groups.splice(catalog.groups.indexOf(group), 1);
    writeCompanyLog(guard.value, 'delete', groupEntity(group), groupSnapshot(group), null);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${API}/catalog/groups/:id/move-products`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productManage);
    if (!guard.ok) return guard.response;
    const companyId = guard.value.companyId;
    const found = findOwned(catalog.groups, params.id, companyId, 'nhóm hàng');
    if (!found.ok) return found.response;
    const source = found.value;
    const body = (await request.json()) as { targetGroupId?: string; productIds?: string[] };
    const target = catalog.groups.find((g) => g.id === body.targetGroupId && g.companyId === companyId);
    if (!target || target.id === source.id) {
      return problem(422, 'Dữ liệu chưa hợp lệ', { errors: { targetGroupId: 'Chọn nhóm khác nhóm đang xoá' } });
    }
    const inSource = companyProducts(companyId).filter((p) => p.groupId === source.id);
    const picked = body.productIds ? inSource.filter((p) => body.productIds!.includes(p.id)) : inSource;
    if (body.productIds && picked.length !== new Set(body.productIds).size) {
      return problem(422, 'Dữ liệu chưa hợp lệ', { errors: { productIds: 'Có sản phẩm không thuộc nhóm này' } });
    }
    // Không tăng version của hai nhóm; tăng version sản phẩm, ghi nhật ký từng sản phẩm
    for (const p of picked) {
      const before = productSnapshot(p);
      p.groupId = target.id;
      p.version += 1;
      p.updatedAt = db.now();
      writeCompanyLog(guard.value, 'update', productEntity(p), before, productSnapshot(p));
    }
    return HttpResponse.json({ moved: picked.length });
  }),

  // ----- Cài đặt sản phẩm của công ty -----
  http.get(`${API}/catalog/settings`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productView);
    if (!guard.ok) return guard.response;
    return HttpResponse.json<ProductSettings>(toSettings(catalog.settingsOf(guard.value.companyId)));
  }),

  http.put(`${API}/catalog/settings`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.catalogSetup);
    if (!guard.ok) return guard.response;
    const settings = catalog.settingsOf(guard.value.companyId);
    const body = (await request.json()) as ProductSettingsInput;
    if (body.version !== settings.version) return versionConflict(toSettings(settings), 'Cài đặt vừa được người khác sửa.');
    const patternError = skuPatternError(body.skuPattern ?? '');
    if (patternError) return problem(422, 'Dữ liệu chưa hợp lệ', { errors: { skuPattern: patternError } });
    // Đổi mẫu chỉ áp dụng cho SKU sinh sau này; SKU cũ giữ nguyên
    settings.skuPattern = body.skuPattern.trim();
    if (body.suggest) settings.suggest = { ...body.suggest } satisfies SuggestConfig;
    settings.version += 1;
    return HttpResponse.json<ProductSettings>(toSettings(settings));
  }),

  // ----- Thuộc tính -----
  http.get(`${API}/catalog/attributes`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productView);
    if (!guard.ok) return guard.response;
    return HttpResponse.json<Attribute[]>(
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
      platformKind: null,
      values: body.values.map((v, i) => ({ id: rid('val'), value: v.value.trim(), code: attributeCodes(body)[i] })),
      version: 1,
    };
    catalog.attributes.push(attribute);
    writeCompanyLog(guard.value, 'create', attributeEntity(attribute), null, attributeSnapshot(attribute));
    return HttpResponse.json<Attribute>(toAttribute(attribute), { status: 201 });
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
    return HttpResponse.json<Attribute>(toAttribute(attribute));
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
    const groupId = url.searchParams.get('groupId');
    const status = url.searchParams.get('status') ?? 'active';
    let items = companyProducts(guard.value.companyId).filter((p) =>
      status === 'archived' ? p.archivedAt : !p.archivedAt,
    );
    if (groupId) items = items.filter((p) => p.groupId === groupId);
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
    return HttpResponse.json<PageResult<ProductListItem>>(paginate(items.map(toProductItem), page, pageSize));
  }),

  http.get(`${API}/catalog/products/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productView);
    if (!guard.ok) return guard.response;
    const found = findOwned(catalog.products, params.id, guard.value.companyId, 'sản phẩm');
    if (!found.ok) return found.response;
    return HttpResponse.json<ProductDetail>(toProductDetail(found.value));
  }),

  http.post(`${API}/catalog/products`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productManage);
    if (!guard.ok) return guard.response;
    const companyId = guard.value.companyId;
    const body = (await request.json()) as ProductCreateInput;
    const errors: Record<string, string> = {};
    validateProductText(body, errors);
    const group = catalog.groups.find((g) => g.id === body.groupId && g.companyId === companyId);
    if (!group) errors.groupId = 'Chọn nhóm hàng';
    validateImages(companyId, body.imageFileIds, errors);
    validateSizeChart(companyId, body.sizeChartFileId, errors);
    const commitAxes = readAxes(companyId, body, errors);
    if (!commitAxes || Object.keys(errors).length) return problem(422, 'Dữ liệu chưa hợp lệ', { errors });
    if (productNameTaken(companyId, body.name)) return nameTaken('Đã có sản phẩm cùng tên');
    const combos = commitAxes();

    const product: MockProduct = {
      id: rid('prd'),
      companyId,
      groupId: group!.id,
      name: body.name.trim(),
      description: body.description ?? '',
      imageFileIds: body.imageFileIds ?? [],
      sizeChartFileId: body.sizeChartFileId ?? null,
      variants: [],
      archivedAt: null,
      updatedAt: db.now(),
      version: 1,
    };
    product.variants = combos.map((c) => {
      const v = nextVariant(companyId, c);
      // nextVariant chỉ thấy sản phẩm đã lưu; giữ SKU duy nhất trong cùng lần tạo
      product.variants.push(v);
      return v;
    });
    catalog.products.unshift(product);
    writeCompanyLog(guard.value, 'create', productEntity(product), null, productSnapshot(product));
    return HttpResponse.json<ProductDetail>(toProductDetail(product), { status: 201 });
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
    const errors: Record<string, string> = {};
    validateProductText(body, errors);
    validateImages(guard.value.companyId, body.imageFileIds, errors);
    validateSizeChart(guard.value.companyId, body.sizeChartFileId, errors);
    if (body.groupId !== undefined && !catalog.groups.some((g) => g.id === body.groupId && g.companyId === guard.value.companyId)) {
      errors.groupId = 'Chọn nhóm hàng';
    }
    if (Object.keys(errors).length) return problem(422, 'Dữ liệu chưa hợp lệ', { errors });
    // §17.4: gỡ hết ảnh khi còn SKU có listing chưa gỡ
    const listed = product.variants.some((v) => listingsOf(product.companyId, v.id).length);
    if (product.imageFileIds.length && !(body.imageFileIds ?? []).length && listed) {
      return problem(409, 'Sản phẩm đang có trên sàn', {
        code: 'listing_field_required',
        errors: { images: 'Sản phẩm đang có trên sàn nên cần ít nhất một ảnh' },
      });
    }
    if (productNameTaken(guard.value.companyId, body.name, product.id)) {
      return nameTaken('Đã có sản phẩm cùng tên');
    }
    const before = productSnapshot(product);
    product.name = body.name.trim();
    product.description = body.description ?? '';
    product.imageFileIds = body.imageFileIds ?? [];
    if (body.groupId !== undefined) product.groupId = body.groupId;
    // Bỏ trống thì giữ nguyên, null thì gỡ, id thì thay
    if (body.sizeChartFileId !== undefined) product.sizeChartFileId = body.sizeChartFileId;
    product.version += 1;
    product.updatedAt = db.now();
    writeCompanyLog(guard.value, 'update', productEntity(product), before, productSnapshot(product));
    return HttpResponse.json<ProductDetail>(toProductDetail(product));
  }),

  // §17.2 xoá hẳn: mọi SKU Chờ hoàn thiện và chưa dùng ở tồn kho, chứng từ, listing nào (kể cả listing đã gỡ)
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
    const ids = new Set(product.variants.map((v) => v.id));
    const has = (lines: { variantId: string | null }[]) => lines.some((l) => l.variantId !== null && ids.has(l.variantId));
    const inUse =
      product.variants.some((v) => missingOf(product, v).length === 0) ||
      inventory.levels.some((l) => ids.has(l.variantId)) ||
      purchasing.requests.some((r) => has(r.lines)) ||
      purchasing.receipts.some((r) => has(r.lines)) ||
      purchasing.returns.some((r) => has(r.lines)) ||
      inventory.docs.some((d) => has(d.lines)) ||
      channel.listings.some((l) => ids.has(l.variantId));
    if (inUse) {
      return problem(409, 'Sản phẩm đang được dùng', {
        code: 'product_in_use',
        detail: 'Sản phẩm đã hoàn thiện hoặc đã có chứng từ, listing nên không xoá hẳn được. Dùng Lưu trữ.',
      });
    }
    catalog.products.splice(catalog.products.indexOf(product), 1);
    writeCompanyLog(guard.value, 'delete', productEntity(product), productSnapshot(product), null);
    return new HttpResponse(null, { status: 204 });
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
        { type: 'product.product_variants', id: v.id, label: v.sku },
        { businessStatus: from },
        { businessStatus: r.to },
      );
    }
    if (applied.length) product.updatedAt = at;
    const result: BusinessStatusResult = { product: toProductDetail(product), applied, skipped };
    return HttpResponse.json<BusinessStatusResult>(result);
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
    const variant = nextVariant(product.companyId, attributeValueIds);
    product.variants.push(variant);
    // Biến thể là bản ghi riêng: không tăng version của sản phẩm để form đang sửa không bị 409
    product.updatedAt = db.now();
    writeCompanyLog(
      guard.value,
      'create',
      { type: 'product.product_variants', id: variant.id, label: variant.sku },
      null,
      { product: product.name, sku: variant.sku, attributes: variantAttributes(companyId, variant.valueIds).map((a) => a.value) },
    );
    return HttpResponse.json<ProductVariant>(toVariant(product, variant), { status: 201 });
  }),

  // §17.2: sửa giá chuẩn, khối lượng, kích thước gói của một SKU (D9: giá chuẩn là cột của SKU)
  http.patch(`${API}/catalog/products/:id/variants/:variantId`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productManage);
    if (!guard.ok) return guard.response;
    const found = findOwned(catalog.products, params.id, guard.value.companyId, 'sản phẩm');
    if (!found.ok) return found.response;
    const product = found.value;
    const variant = product.variants.find((v) => v.id === params.variantId);
    if (!variant) return problem(404, 'Không tìm thấy biến thể', { code: 'not_found' });
    if (variant.businessStatus === 'archived') {
      return problem(409, 'Biến thể đã lưu trữ', { code: 'variant_archived' });
    }
    const body = (await request.json()) as VariantUpdateInput;
    const spec = specOf(variant.id);
    if (body.version !== spec.version) {
      return versionConflict(toProductDetail(product), 'SKU vừa được người khác sửa.');
    }
    const errors: Record<string, string> = {};
    const fields = ['standardPrice', 'targetNetPrice', 'weightG', 'lengthMm', 'widthMm', 'heightMm'] as const;
    for (const k of Object.keys(body)) {
      if (k !== 'version' && !(fields as readonly string[]).includes(k)) errors[k] = 'Trường không được sửa ở đây';
    }
    for (const f of fields) {
      const n = body[f];
      if (n === undefined || n === null) continue;
      if (!Number.isInteger(n) || n <= 0) errors[f] = 'Phải là số nguyên dương';
      else if ((f === 'standardPrice' || f === 'targetNetPrice') && n > 10_000_000_000) errors[f] = 'Giá tối đa 10 tỷ đồng';
      else if (f === 'weightG' && n > SPEC_LIMITS.weightG) errors[f] = 'Quá 50 kg, kiểm tra lại đơn vị gram';
      else if (f !== 'standardPrice' && f !== 'targetNetPrice' && f !== 'weightG' && n > SPEC_LIMITS.sizeMm) errors[f] = 'Quá 2 m, kiểm tra lại đơn vị mm';
    }
    if (Object.keys(errors).length) return problem(422, 'Dữ liệu chưa hợp lệ', { errors });

    const before = toVariant(product, variant);
    // §17.4: SKU còn listing chưa gỡ thì không xoá trống giá muốn bán, cân nặng, kích thước đang có giá trị
    if (listingsOf(product.companyId, variant.id).length) {
      const required: Record<string, string> = {};
      for (const f of ['targetNetPrice', 'weightG', 'lengthMm', 'widthMm', 'heightMm'] as const) {
        if (body[f] === null && before[f] !== null) required[f] = 'SKU đang có trên sàn nên không để trống được';
      }
      if (Object.keys(required).length) {
        return problem(409, 'SKU đang có trên sàn', { code: 'listing_field_required', errors: required });
      }
    }
    const now = db.now();
    const list = standardList(product.companyId);
    if (body.standardPrice !== undefined && list) {
      if (body.standardPrice === null) delete list.prices[variant.id];
      else list.prices[variant.id] = body.standardPrice;
      list.version += 1;
      list.updatedAt = now;
    }
    for (const f of ['targetNetPrice', 'weightG', 'lengthMm', 'widthMm', 'heightMm'] as const) {
      if (body[f] !== undefined) spec[f] = body[f] ?? null;
    }
    spec.version += 1;
    product.updatedAt = now;
    const after = toVariant(product, variant);
    const pick = (x: ProductVariant) => ({
      standardPrice: x.standardPrice, targetNetPrice: x.targetNetPrice, weightG: x.weightG, lengthMm: x.lengthMm, widthMm: x.widthMm, heightMm: x.heightMm,
    });
    writeCompanyLog(guard.value, 'update', { type: 'product.product_variants', id: variant.id, label: variant.sku }, pick(before), pick(after));
    return HttpResponse.json<ProductDetail>(toProductDetail(product));
  }),

  // ----- Ảnh: vé tải lên (presigned) và nơi nhận file thay cho SeaweedFS/S3 -----
  http.post(`${API}/files/uploads`, async ({ request }) => {
    await delay(lag(150));
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
      return problem(422, attachment ? 'Chỉ nhận ảnh JPG, PNG, WebP hoặc PDF' : 'Ảnh sản phẩm phải là JPG hoặc PNG', {
        code: 'file_type_not_allowed',
      });
    }
    if (body.sizeBytes > (attachment ? MAX_ATTACHMENT_BYTES : MAX_IMAGE_BYTES)) {
      return problem(422, attachment ? 'Tệp tối đa 10 MB' : 'Ảnh sản phẩm tối đa 1 MB', { code: 'file_too_large' });
    }
    const id = rid('fil');
    catalog.files.push({ id, companyId: guard.value.companyId, ...body, url: null });
    const ticket: UploadTicket = {
      fileId: id,
      uploadUrl: `${new URL(request.url).origin}${API}/files/uploads/${id}/content`,
      headers: { 'Content-Type': body.contentType },
    };
    return HttpResponse.json<UploadTicket>(ticket, { status: 201 });
  }),

  http.put(`${API}/files/uploads/:id/content`, async ({ params, request }) => {
    await delay(lag(300));
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
