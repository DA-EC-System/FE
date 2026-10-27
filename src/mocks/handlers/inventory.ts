import { http, HttpResponse, delay } from 'msw';
import { db } from '../db';
import * as catalog from '../catalogData';
import type { MockProduct, MockVariant } from '../catalogData';
import { formatCurrency } from '@/utils/format';
import * as inventory from '../inventoryData';
import type { MockReturnOrder, MockStockDoc, MockStockDocLine } from '../inventoryData';
import type { ReorderRuleInput, ReturnOrder, ReturnReceiptInput, StockDetail, StockDoc, StockDocCreateInput, StockDocLineInput, StockDocSummary, StockDocType, StockDocUpdateInput, StockLevel, StockListResult, StockMove } from '@/types/inventory';
import { PERMISSIONS } from '@/utils/permissions';
import { API, LATENCY, pageParams, paginate, problem, requireCompany } from './utils';
import { versionConflict, writeCompanyLog } from './identity';
import { findOwned, rid, variantAttributes } from './catalog';
import { MAX_PRICE, sellableVariants, skuOf } from './pricing';

// ---------- Inventory (UC-IN-01..03) ----------
export const MAX_QTY = 1_000_000;
export const isQty = (n: unknown, min: number, max = MAX_QTY): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;

export const accountName = (id: string | null) =>
  (id && db.accounts.find((a) => a.id === id)?.fullName) || '—';

/** Biến thể (kể cả đã lưu trữ) của công ty; null nếu không có ở công ty nào */
export function findVariant(variantId: string) {
  for (const product of catalog.products) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (variant) return { product, variant };
  }
  return null;
}

export function variantLabel(companyId: string, variantId: string) {
  const found = findVariant(variantId);
  return {
    sku: found?.variant.sku ?? variantId,
    productName: found?.product.name ?? '',
    attributesLabel: found
      ? variantAttributes(companyId, found.variant.valueIds)
          .map((a) => a.value)
          .join(' / ')
      : '',
  };
}

export function stockLevelOf(companyId: string, variantId: string) {
  let level = inventory.levels.find((l) => l.companyId === companyId && l.variantId === variantId);
  if (!level) {
    level = { companyId, variantId, onHand: 0, reserved: 0, avgCost: 0 };
    inventory.levels.push(level);
  }
  return level;
}

export function toStockLevel(product: MockProduct, variant: MockVariant, canCost: boolean): StockLevel {
  const level = stockLevelOf(product.companyId, variant.id);
  const rule = inventory.reorderRules.find(
    (r) => r.companyId === product.companyId && r.variantId === variant.id,
  );
  const available = level.onHand - level.reserved;
  return {
    variantId: variant.id,
    productId: product.id,
    productName: product.name,
    sku: variant.sku,
    attributesLabel: variantAttributes(product.companyId, variant.valueIds)
      .map((a) => a.value)
      .join(' / '),
    category: {
      id: product.categoryId,
      name: catalog.categories.find((c) => c.id === product.categoryId)?.name ?? '',
    },
    onHand: level.onHand,
    reserved: level.reserved,
    available,
    minQty: rule?.minQty ?? null,
    belowMin: rule ? available < rule.minQty : false,
    reorderVersion: rule?.version ?? 0,
    avgCost: canCost ? level.avgCost : null,
    stockValue: canCost ? level.onHand * level.avgCost : null,
  };
}

/** Biến thể đang bán của công ty, hoặc lỗi 404/403 */
export function ownedVariant(variantId: unknown, companyId: string) {
  const found = findVariant(String(variantId));
  if (!found) return { ok: false as const, response: problem(404, 'Không tìm thấy biến thể') };
  if (found.product.companyId !== companyId) {
    return { ok: false as const, response: problem(403, 'Biến thể thuộc công ty khác') };
  }
  return { ok: true as const, value: found };
}

/** Phiếu nhập tay và nhận hàng: người lập phiếu thấy giá nhập; còn lại là giá vốn, cần quyền giá vốn */
export function canSeeLineCost(doc: MockStockDoc, permissions: string[]) {
  if (permissions.includes(PERMISSIONS.costView)) return true;
  return (
    doc.type === 'receipt' &&
    doc.kind !== 'delivery_return' &&
    permissions.includes(PERMISSIONS.stockDocManage)
  );
}

export function toStockDocSummary(doc: MockStockDoc): StockDocSummary {
  return {
    id: doc.id,
    number: doc.number,
    type: doc.type,
    kind: doc.kind,
    status: doc.status,
    note: doc.note,
    reference: doc.reference,
    lineCount: doc.lines.length,
    totalQty: doc.lines.reduce((s, l) => s + l.quantity, 0),
    createdBy: accountName(doc.createdBy),
    createdAt: doc.createdAt,
    postedBy: doc.postedBy ? accountName(doc.postedBy) : null,
    postedAt: doc.postedAt,
    version: doc.version,
  };
}

export function toStockDoc(doc: MockStockDoc, permissions: string[]): StockDoc {
  const showCost = canSeeLineCost(doc, permissions);
  return {
    ...toStockDocSummary(doc),
    lines: doc.lines.map((l) => ({
      variantId: l.variantId,
      ...variantLabel(doc.companyId, l.variantId),
      quantity: l.quantity,
      unitCost: showCost ? l.unitCost : null,
    })),
  };
}

export const stockDocEntity = (d: MockStockDoc) => ({
  type: d.type === 'receipt' ? 'inventory.stock_receipts' : 'inventory.stock_issues',
  id: d.id,
  label: d.number,
});
export function stockDocSnapshot(d: MockStockDoc) {
  return {
    status: d.status,
    note: d.note,
    lines: d.lines.map(
      (l) =>
        `${skuOf(d.companyId, l.variantId)}: ${l.quantity}` +
        (d.type === 'receipt' && d.kind === 'manual' && l.unitCost !== null
          ? ` × ${formatCurrency(l.unitCost)}`
          : ''),
    ),
  };
}

export function nextDocNumber(companyId: string, type: StockDocType) {
  const count = inventory.docs.filter((d) => d.companyId === companyId && d.type === type).length;
  return `${type === 'receipt' ? 'PN' : 'PX'}-${String(count + 1).padStart(6, '0')}`;
}

/** Kiểm dòng phiếu nhập tay, xuất tay; lỗi theo đường dẫn "lines.<i>.<trường>" */
export function validateDocInput(
  type: StockDocType,
  body: { note?: string; lines?: StockDocLineInput[] },
  companyId: string,
) {
  const errors: Record<string, string> = {};
  const note = body.note?.trim() ?? '';
  if (note.length > 500) errors.note = 'Ghi chú tối đa 500 ký tự';
  else if (type === 'issue' && !note) errors.note = 'Nhập lý do xuất kho';
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (!lines.length) errors.lines = 'Thêm ít nhất một dòng';
  if (lines.length > 200) errors.lines = 'Tối đa 200 dòng một phiếu';
  const seen = new Set<string>();
  lines.forEach((line, i) => {
    const found = findVariant(String(line.variantId));
    if (
      !found ||
      found.product.companyId !== companyId ||
      found.product.archivedAt ||
      found.variant.archivedAt
    ) {
      errors[`lines.${i}.variantId`] = 'Biến thể không còn bán';
    } else if (seen.has(line.variantId)) {
      errors[`lines.${i}.variantId`] = 'Biến thể bị lặp';
    }
    seen.add(line.variantId);
    if (!isQty(line.quantity, 1)) errors[`lines.${i}.quantity`] = 'Số lượng là số nguyên từ 1';
    if (type === 'receipt' && !isQty(line.unitCost, 0, MAX_PRICE)) {
      errors[`lines.${i}.unitCost`] = 'Giá nhập là số nguyên đồng, không âm';
    }
  });
  return { errors, note, lines };
}

export const toDocLines = (type: StockDocType, lines: StockDocLineInput[]): MockStockDocLine[] =>
  lines.map((l) => ({
    variantId: l.variantId,
    quantity: l.quantity,
    unitCost: type === 'receipt' ? l.unitCost ?? 0 : null,
  }));

export function toReturnOrder(o: MockReturnOrder): ReturnOrder {
  const receipt = inventory.docs.find(
    (d) => d.kind === 'delivery_return' && d.orderId === o.orderId && d.status !== 'cancelled',
  );
  return {
    orderId: o.orderId,
    orderCode: o.orderCode,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    shipmentCode: o.shipmentCode,
    failedReason: o.failedReason,
    failedAt: o.failedAt,
    lines: o.lines.map((l) => ({ variantId: l.variantId, ...variantLabel(o.companyId, l.variantId), quantity: l.quantity })),
    receipt: receipt ? { id: receipt.id, number: receipt.number } : null,
  };
}

export const inventoryHandlers = [
  http.get(`${API}/inventory/stock`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.stockView);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const canCost = permissions.includes(PERMISSIONS.costView);
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const categoryId = url.searchParams.get('categoryId');
    const belowMin = url.searchParams.get('belowMin') === 'true';
    const all = sellableVariants(companyId).map(({ product, variant }) => toStockLevel(product, variant, canCost));
    const items = all.filter(
      (l) =>
        (!search || l.productName.toLowerCase().includes(search) || l.sku.toLowerCase().includes(search)) &&
        (!categoryId || l.category.id === categoryId) &&
        (!belowMin || l.belowMin),
    );
    const result: StockListResult = {
      ...paginate(items, page, pageSize),
      summary: {
        variantCount: all.length,
        belowMinCount: all.filter((l) => l.belowMin).length,
        totalValue: canCost ? all.reduce((s, l) => s + (l.stockValue ?? 0), 0) : null,
      },
    };
    return HttpResponse.json(result);
  }),

  http.get(`${API}/inventory/stock/:variantId`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.stockView);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const found = ownedVariant(params.variantId, companyId);
    if (!found.ok) return found.response;
    const canCost = permissions.includes(PERMISSIONS.costView);
    const { product, variant } = found.value;
    const moves: StockMove[] = inventory.moves
      .filter((m) => m.companyId === companyId && m.variantId === variant.id)
      .sort((a, b) => b.doneAt.localeCompare(a.doneAt) || Number(b.id.slice(3)) - Number(a.id.slice(3)))
      .slice(0, 100)
      .map((m) => {
        const doc = inventory.docs.find((d) => d.id === m.docId)!;
        return {
          id: m.id,
          qtyChange: m.qtyChange,
          onHandAfter: m.onHandAfter,
          document: { id: doc.id, number: doc.number, type: doc.type, kind: doc.kind },
          unitCost: canCost ? m.unitCost : null,
          doneAt: m.doneAt,
          doneBy: accountName(m.doneBy),
        };
      });
    const detail: StockDetail = { level: toStockLevel(product, variant, canCost), moves };
    return HttpResponse.json(detail);
  }),

  http.put(`${API}/inventory/stock/:variantId/reorder-rule`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.reorderManage);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const found = ownedVariant(params.variantId, companyId);
    if (!found.ok) return found.response;
    const { product, variant } = found.value;
    const canCost = permissions.includes(PERMISSIONS.costView);
    const body = (await request.json()) as ReorderRuleInput;
    const idx = inventory.reorderRules.findIndex((r) => r.companyId === companyId && r.variantId === variant.id);
    const rule = idx >= 0 ? inventory.reorderRules[idx] : null;
    if (body.version !== (rule?.version ?? 0)) {
      return versionConflict(
        toStockLevel(product, variant, canCost),
        'Ngưỡng tồn vừa được người khác sửa. Xem lại số mới rồi lưu lại.',
      );
    }
    if (body.minQty !== null && !isQty(body.minQty, 0)) {
      return problem(422, 'Dữ liệu không hợp lệ', {
        errors: { minQty: 'Ngưỡng là số nguyên không âm' },
      });
    }
    const before = rule ? { minQty: rule.minQty } : null;
    if (body.minQty === null) {
      if (rule) inventory.reorderRules.splice(idx, 1);
    } else if (rule) {
      rule.minQty = body.minQty;
      rule.version += 1;
      rule.updatedAt = db.now();
    } else {
      inventory.reorderRules.push({
        companyId,
        variantId: variant.id,
        minQty: body.minQty,
        version: 1,
        updatedAt: db.now(),
      });
    }
    const after = body.minQty === null ? null : { minQty: body.minQty };
    if (before?.minQty !== after?.minQty) {
      writeCompanyLog(
        guard.value,
        !before ? 'create' : !after ? 'delete' : 'update',
        { type: 'inventory.reorder_rules', id: variant.id, label: variant.sku },
        before,
        after,
      );
    }
    // Dưới ngưỡng thì BE phát sự kiện để báo Nhân viên kho, Admin (QT-16); mock không gửi thông báo
    return HttpResponse.json(toStockLevel(product, variant, canCost));
  }),

  http.get(`${API}/inventory/documents`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.stockView);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    const type = url.searchParams.get('type');
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const items = inventory.docs
      .filter(
        (d) =>
          d.companyId === guard.value.companyId &&
          (!type || d.type === type) &&
          (!status || d.status === status) &&
          (!search ||
            d.number.toLowerCase().includes(search) ||
            d.note.toLowerCase().includes(search) ||
            (d.reference ?? '').toLowerCase().includes(search)),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toStockDocSummary);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.get(`${API}/inventory/documents/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.stockView);
    if (!guard.ok) return guard.response;
    const found = findOwned(inventory.docs, params.id, guard.value.companyId, 'phiếu kho');
    if (!found.ok) return found.response;
    return HttpResponse.json(toStockDoc(found.value, guard.value.permissions));
  }),

  http.post(`${API}/inventory/documents`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.stockDocManage);
    if (!guard.ok) return guard.response;
    const { companyId } = guard.value;
    const body = (await request.json()) as StockDocCreateInput;
    if (body.type !== 'receipt' && body.type !== 'issue') {
      return problem(422, 'Dữ liệu không hợp lệ', { errors: { type: 'Chọn phiếu nhập hoặc phiếu xuất' } });
    }
    const { errors, note, lines } = validateDocInput(body.type, body, companyId);
    if (Object.keys(errors).length) return problem(422, 'Dữ liệu không hợp lệ', { errors });
    const doc: MockStockDoc = {
      id: rid('sd'),
      companyId,
      number: nextDocNumber(companyId, body.type),
      type: body.type,
      // Phiếu nhập theo đơn mua lập ở UC-PU-05, phiếu xuất theo đơn ở UC-SF-08
      kind: 'manual',
      status: 'draft',
      note,
      orderId: null,
      reference: null,
      lines: toDocLines(body.type, lines),
      createdBy: guard.value.account.id,
      createdAt: db.now(),
      postedBy: null,
      postedAt: null,
      version: 1,
    };
    inventory.docs.push(doc);
    writeCompanyLog(guard.value, 'create', stockDocEntity(doc), null, stockDocSnapshot(doc));
    return HttpResponse.json(toStockDoc(doc, guard.value.permissions), { status: 201 });
  }),

  http.put(`${API}/inventory/documents/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.stockDocManage);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const found = findOwned(inventory.docs, params.id, companyId, 'phiếu kho');
    if (!found.ok) return found.response;
    const doc = found.value;
    const body = (await request.json()) as StockDocUpdateInput;
    if (body.version !== doc.version) {
      return versionConflict(toStockDoc(doc, permissions), 'Phiếu vừa được người khác sửa hoặc ghi sổ.');
    }
    if (doc.status !== 'draft' || doc.kind !== 'manual') {
      return problem(409, 'Phiếu không còn sửa được', {
        code: 'not_draft',
        detail: 'Chỉ sửa được phiếu nháp lập tay.',
      });
    }
    const { errors, note, lines } = validateDocInput(doc.type, body, companyId);
    if (Object.keys(errors).length) return problem(422, 'Dữ liệu không hợp lệ', { errors });
    const before = stockDocSnapshot(doc);
    doc.note = note;
    doc.lines = toDocLines(doc.type, lines);
    doc.version += 1;
    writeCompanyLog(guard.value, 'update', stockDocEntity(doc), before, stockDocSnapshot(doc));
    return HttpResponse.json(toStockDoc(doc, permissions));
  }),

  /** Ghi sổ: Template Method ở BE — kiểm, cập nhật stock_levels, ghi stock_moves, đẩy tồn lên sàn (QT-46) */
  http.post(`${API}/inventory/documents/:id/post`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.stockDocManage);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const found = findOwned(inventory.docs, params.id, companyId, 'phiếu kho');
    if (!found.ok) return found.response;
    const doc = found.value;
    const body = (await request.json()) as { version: number };
    if (body.version !== doc.version) {
      return versionConflict(toStockDoc(doc, permissions), 'Phiếu vừa được người khác sửa hoặc ghi sổ.');
    }
    if (doc.status !== 'draft') {
      return problem(409, 'Phiếu đã ghi sổ hoặc đã huỷ', { code: 'not_draft' });
    }
    if (doc.type === 'issue') {
      // Xuất tay chỉ lấy phần khả dụng, không đụng hàng đang giữ cho đơn (QT-14)
      const errors: Record<string, string> = {};
      doc.lines.forEach((l, i) => {
        const level = stockLevelOf(companyId, l.variantId);
        const available = level.onHand - level.reserved;
        if (l.quantity > available) errors[`lines.${i}.quantity`] = `Chỉ còn ${Math.max(available, 0)} khả dụng`;
      });
      if (Object.keys(errors).length) {
        return problem(422, 'Không đủ hàng khả dụng để xuất', { code: 'insufficient_stock', errors });
      }
    }
    const before = stockDocSnapshot(doc);
    const at = db.now();
    inventory.applyDoc(doc, at, guard.value.account.id);
    doc.status = 'done';
    doc.postedBy = guard.value.account.id;
    doc.postedAt = at;
    doc.version += 1;
    writeCompanyLog(guard.value, 'update', stockDocEntity(doc), before, stockDocSnapshot(doc));
    return HttpResponse.json(toStockDoc(doc, permissions));
  }),

  http.post(`${API}/inventory/documents/:id/cancel`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.stockDocManage);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const found = findOwned(inventory.docs, params.id, companyId, 'phiếu kho');
    if (!found.ok) return found.response;
    const doc = found.value;
    const body = (await request.json()) as { version: number };
    if (body.version !== doc.version) {
      return versionConflict(toStockDoc(doc, permissions), 'Phiếu vừa được người khác sửa hoặc ghi sổ.');
    }
    if (doc.status !== 'draft') {
      return problem(409, 'Chỉ huỷ được phiếu nháp', {
        code: 'not_draft',
        detail: 'Phiếu đã ghi sổ thì lập phiếu ngược lại để điều chỉnh.',
      });
    }
    const before = stockDocSnapshot(doc);
    doc.status = 'cancelled';
    doc.version += 1;
    writeCompanyLog(guard.value, 'update', stockDocEntity(doc), before, stockDocSnapshot(doc));
    return HttpResponse.json(toStockDoc(doc, permissions));
  }),

  http.get(`${API}/inventory/returns`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.stockDocManage);
    if (!guard.ok) return guard.response;
    const list = inventory.returnOrders
      .filter((o) => o.companyId === guard.value.companyId)
      .map(toReturnOrder)
      // Chưa xử lý lên đầu, mới nhất trước
      .sort((a, b) => Number(Boolean(a.receipt)) - Number(Boolean(b.receipt)) || b.failedAt.localeCompare(a.failedAt));
    return HttpResponse.json(list);
  }),

  /** UC-IN-03: lập và ghi sổ ngay phiếu nhập hoàn, tăng tồn khả dụng (QT-31) */
  http.post(`${API}/inventory/returns`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.stockDocManage);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const body = (await request.json()) as ReturnReceiptInput;
    const order = inventory.returnOrders.find((o) => o.orderId === body.orderId);
    if (!order) return problem(404, 'Không tìm thấy đơn giao không thành công');
    if (order.companyId !== companyId) return problem(403, 'Đơn thuộc công ty khác');
    const done = toReturnOrder(order).receipt;
    if (done) {
      return problem(409, 'Đơn đã được xử lý', {
        code: 'already_processed',
        detail: `Đơn ${order.orderCode} đã có phiếu nhập hoàn ${done.number}.`,
      });
    }
    const errors: Record<string, string> = {};
    const input = Array.isArray(body.lines) ? body.lines : [];
    const lines = order.lines.map((ol, i) => {
      const got = input.find((l) => l.variantId === ol.variantId);
      if (!got || !isQty(got.quantity, 0, ol.quantity)) {
        errors[`lines.${i}.quantity`] = `Số nguyên từ 0 đến ${ol.quantity}`;
      }
      return { variantId: ol.variantId, quantity: got?.quantity ?? 0, shipped: ol.quantity };
    });
    const note = body.note?.trim() ?? '';
    if (!Object.keys(errors).length) {
      if (lines.every((l) => l.quantity === 0)) errors.lines = 'Không có hàng nào quay về thì không lập phiếu';
      else if (lines.some((l) => l.quantity !== l.shipped) && !note) {
        errors.note = 'Ghi lý do số thực nhận khác số đã xuất';
      }
    }
    if (note.length > 500) errors.note = 'Ghi chú tối đa 500 ký tự';
    if (Object.keys(errors).length) return problem(422, 'Dữ liệu không hợp lệ', { errors });
    const at = db.now();
    const doc: MockStockDoc = {
      id: rid('sd'),
      companyId,
      number: nextDocNumber(companyId, 'receipt'),
      type: 'receipt',
      kind: 'delivery_return',
      status: 'done',
      note,
      orderId: order.orderId,
      reference: order.orderCode,
      lines: lines.filter((l) => l.quantity > 0).map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitCost: null })),
      createdBy: guard.value.account.id,
      createdAt: at,
      postedBy: guard.value.account.id,
      postedAt: at,
      version: 1,
    };
    inventory.applyDoc(doc, at, guard.value.account.id);
    inventory.docs.push(doc);
    writeCompanyLog(guard.value, 'create', stockDocEntity(doc), null, stockDocSnapshot(doc));
    return HttpResponse.json(toStockDoc(doc, permissions), { status: 201 });
  }),
];
