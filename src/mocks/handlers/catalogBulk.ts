import { http, HttpResponse, delay } from 'msw';
import * as catalog from '../catalogData';
import * as inventory from '../inventoryData';
import * as purchasing from '../purchasingData';
import * as pricing from '../pricingData';
import * as sales from '../salesData';
import { SPEC_LIMITS, VELOCITY_DAYS, ruleOf, specOf } from '../catalogBulkData';
import type { MockProduct, MockVariant } from '../catalogData';
import type { BulkEditRow, BulkField, BulkSaveResult, BulkSaveRow, BulkSuggestion } from '@/types/catalog';
import type { PageResult } from '@/api/types';
import { PERMISSIONS } from '@/utils/permissions';
import { API, LATENCY, pageParams, paginate, problem, requireCompany } from './utils';
import { companyProducts, variantAttributes } from './catalog';

// ---------- Sửa hàng loạt SKU (FE#155). Hợp đồng đề xuất cho BE#242, chờ ghi vào Documents/21 §17 ----------

const FIELDS: BulkField[] = ['standardPrice', 'minQty', 'weightG', 'lengthMm', 'widthMm', 'heightMm'];
const SPEC_FIELDS = ['weightG', 'lengthMm', 'widthMm', 'heightMm'] as const;
const vnd = (n: number) => n.toLocaleString('vi-VN');

const standardList = (companyId: string) =>
  pricing.pricelists.find((pl) => pl.companyId === companyId && pl.type === 'standard');

const ruleFor = (companyId: string, variantId: string) =>
  inventory.reorderRules.find((r) => r.companyId === companyId && r.variantId === variantId);

function currentOf(companyId: string, variantId: string): Record<BulkField, number | null> {
  const spec = specOf(variantId);
  return {
    standardPrice: standardList(companyId)?.prices[variantId] ?? null,
    minQty: ruleFor(companyId, variantId)?.minQty ?? null,
    weightG: spec.weightG,
    lengthMm: spec.lengthMm,
    widthMm: spec.widthMm,
    heightMm: spec.heightMm,
  };
}

/** Đề nghị nhập mới nhất (trừ đã huỷ) có SKU này */
function lastPurchase(companyId: string, variantId: string) {
  const found = purchasing.requests
    .filter((r) => r.companyId === companyId && r.status !== 'cancelled')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .flatMap((r) => r.lines.filter((l) => l.variantId === variantId).map((l) => ({ request: r, line: l })))[0];
  if (!found) return null;
  const supplier = purchasing.suppliers.find((s) => s.id === found.request.supplierId);
  return { number: found.request.number, supplierName: supplier?.name ?? '', unitCost: found.line.unitCost };
}

/** Số đã bán trong VELOCITY_DAYS ngày tính lùi từ đơn mới nhất của công ty (dữ liệu mock có ngày cố định) */
function soldInWindow(companyId: string): Map<string, number> {
  const orders = sales.orders.filter((o) => o.companyId === companyId && o.status !== 'cancelled');
  const latest = Math.max(0, ...orders.map((o) => Date.parse(o.createdAt)));
  const from = latest - VELOCITY_DAYS * 86_400_000;
  const sold = new Map<string, number>();
  for (const o of orders) {
    if (Date.parse(o.createdAt) < from) continue;
    for (const l of o.lines) if (l.variantId) sold.set(l.variantId, (sold.get(l.variantId) ?? 0) + l.quantity);
  }
  return sold;
}

function suggestionsOf(
  p: MockProduct,
  v: MockVariant,
  current: Record<BulkField, number | null>,
  sold: Map<string, number>,
  canSeeCost: boolean,
): Partial<Record<BulkField, BulkSuggestion>> {
  const rule = ruleOf(p.categoryId);
  const categoryName = catalog.categories.find((c) => c.id === p.categoryId)?.name ?? '';
  const out: Partial<Record<BulkField, BulkSuggestion>> = {};
  // SKU anh em gần nhất đã có số: đứng trước rồi đứng sau trong sản phẩm
  const siblings = p.variants.filter((x) => x.id !== v.id && !x.archivedAt);
  const index = p.variants.indexOf(v);
  siblings.sort((a, b) => Math.abs(p.variants.indexOf(a) - index) - Math.abs(p.variants.indexOf(b) - index));

  if (current.standardPrice === null) {
    const purchase = lastPurchase(p.companyId, v.id);
    if (purchase) {
      const value = Math.round((purchase.unitCost * rule.markup) / rule.roundTo) * rule.roundTo;
      out.standardPrice = {
        value,
        basis: canSeeCost
          ? `Giá nhập ${vnd(purchase.unitCost)} × ${String(rule.markup).replace('.', ',')} (danh mục ${categoryName}), làm tròn ${vnd(rule.roundTo)}`
          : `Giá nhập gần nhất × hệ số danh mục ${categoryName}`,
      };
    } else {
      const sibling = siblings.find((x) => currentOf(p.companyId, x.id).standardPrice !== null);
      if (sibling) {
        out.standardPrice = {
          value: currentOf(p.companyId, sibling.id).standardPrice!,
          basis: `Theo SKU cùng sản phẩm ${sibling.sku}`,
        };
      }
    }
  }

  if (current.minQty === null) {
    const qty = sold.get(v.id) ?? 0;
    if (qty > 0) {
      const perDay = qty / VELOCITY_DAYS;
      out.minQty = {
        value: Math.ceil(perDay * rule.leadDays + rule.safetyStock),
        basis: `Bán ${perDay.toFixed(2).replace('.', ',')}/ngày × ${rule.leadDays} ngày NCC giao + ${rule.safetyStock} dự phòng`,
      };
    }
  }

  const sibling = siblings.find((x) => SPEC_FIELDS.some((f) => specOf(x.id)[f] !== null));
  if (sibling) {
    for (const f of SPEC_FIELDS) {
      const value = specOf(sibling.id)[f];
      if (current[f] === null && value !== null) out[f] = { value, basis: `Theo SKU cùng sản phẩm ${sibling.sku}` };
    }
  }
  return out;
}

function toRow(p: MockProduct, v: MockVariant, sold: Map<string, number>, canSeeCost: boolean): BulkEditRow {
  const current = currentOf(p.companyId, v.id);
  const purchase = lastPurchase(p.companyId, v.id);
  return {
    variantId: v.id,
    productId: p.id,
    productName: p.name,
    sku: v.sku,
    attributesLabel: variantAttributes(p.companyId, v.valueIds).map((a) => a.value).join(' / '),
    categoryName: catalog.categories.find((c) => c.id === p.categoryId)?.name ?? '',
    version: specOf(v.id).version,
    reorderVersion: ruleFor(p.companyId, v.id)?.version ?? null,
    current,
    source: purchase
      ? {
          purchaseRequestNumber: purchase.number,
          supplierName: purchase.supplierName,
          lastCost: canSeeCost ? purchase.unitCost : null,
        }
      : null,
    suggestions: suggestionsOf(p, v, current, sold, canSeeCost),
  };
}

function isPositiveInt(v: unknown) {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

export const catalogBulkHandlers = [
  http.get(`${API}/catalog/variants/bulk-edit`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productManage);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    const search = url.searchParams.get('search')?.trim().toLowerCase();
    const categoryId = url.searchParams.get('categoryId');
    const incomplete = url.searchParams.get('incomplete') === 'true';
    const sold = soldInWindow(companyId);
    const canSeeCost = permissions.includes(PERMISSIONS.costView);

    let rows = companyProducts(companyId)
      .filter((p) => !p.archivedAt && (!categoryId || p.categoryId === categoryId))
      .flatMap((p) => p.variants.filter((v) => !v.archivedAt).map((v) => toRow(p, v, sold, canSeeCost)));
    if (search) {
      rows = rows.filter((r) => r.productName.toLowerCase().includes(search) || r.sku.toLowerCase().includes(search));
    }
    if (incomplete) rows = rows.filter((r) => FIELDS.some((f) => r.current[f] === null));
    return HttpResponse.json<PageResult<BulkEditRow>>(paginate(rows, page, pageSize));
  }),

  http.patch(`${API}/catalog/variants/bulk`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.productManage);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const body = (await request.json()) as { rows?: BulkSaveRow[] };
    const rows = body.rows ?? [];
    if (!rows.length) return problem(400, 'Chưa có dòng nào để lưu', { code: 'validation_failed' });
    if (rows.length > SPEC_LIMITS.maxRows) {
      return problem(400, `Mỗi lần lưu tối đa ${SPEC_LIMITS.maxRows} SKU`, { code: 'too_many_rows' });
    }
    const variants = new Map(
      companyProducts(companyId).flatMap((p) => p.variants.filter((v) => !v.archivedAt).map((v) => [v.id, p] as const)),
    );
    const result: BulkSaveResult = { saved: [], failed: [] };

    for (const row of rows) {
      const fail = (code: string, message: string, errors?: BulkSaveResult['failed'][number]['errors']) =>
        result.failed.push({ variantId: row.variantId, code, message, ...(errors ? { errors } : {}) });
      if (!variants.has(row.variantId)) {
        fail('not_found', 'SKU không còn hoặc đã lưu trữ');
        continue;
      }
      const spec = specOf(row.variantId);
      if (row.version !== spec.version) {
        fail('version_conflict', 'SKU vừa được người khác sửa, tải lại để xem số mới');
        continue;
      }
      // Kiểm cả dòng trước khi ghi: một ô sai thì cả dòng không ghi
      const errors: Partial<Record<BulkField, string>> = {};
      for (const f of FIELDS) {
        const v = row[f];
        if (v === undefined || v === null) continue;
        if (!isPositiveInt(v)) errors[f] = 'Phải là số nguyên dương';
        else if (f === 'weightG' && v > SPEC_LIMITS.weightG) errors[f] = 'Quá 50 kg, kiểm tra lại đơn vị gram';
        else if (f !== 'weightG' && f !== 'standardPrice' && f !== 'minQty' && v > SPEC_LIMITS.sizeMm) {
          errors[f] = 'Quá 2 m, kiểm tra lại đơn vị mm';
        }
      }
      if (row.minQty !== undefined && !permissions.includes(PERMISSIONS.reorderManage)) {
        errors.minQty = 'Không có quyền đặt ngưỡng tồn';
      }
      if (Object.keys(errors).length) {
        fail('validation_failed', 'Có ô chưa hợp lệ', errors);
        continue;
      }
      const rule = ruleFor(companyId, row.variantId);
      if (row.minQty !== undefined && (rule?.version ?? null) !== (row.reorderVersion ?? null)) {
        fail('version_conflict', 'Ngưỡng tồn vừa được người khác sửa, tải lại để xem số mới');
        continue;
      }

      const now = new Date().toISOString();
      const list = standardList(companyId);
      if (row.standardPrice !== undefined && list) {
        if (row.standardPrice === null) delete list.prices[row.variantId];
        else list.prices[row.variantId] = row.standardPrice;
        list.version += 1;
        list.updatedAt = now;
      }
      if (row.minQty !== undefined) {
        if (row.minQty === null) {
          if (rule) inventory.reorderRules.splice(inventory.reorderRules.indexOf(rule), 1);
        } else if (rule) {
          Object.assign(rule, { minQty: row.minQty, version: rule.version + 1, updatedAt: now });
        } else {
          inventory.reorderRules.push({ companyId, variantId: row.variantId, minQty: row.minQty, version: 1, updatedAt: now });
        }
      }
      for (const f of SPEC_FIELDS) if (row[f] !== undefined) spec[f] = row[f] ?? null;
      spec.version += 1;
      result.saved.push({ variantId: row.variantId, version: spec.version });
    }
    return HttpResponse.json<BulkSaveResult>(result);
  }),
];
