import { http, HttpResponse, delay } from 'msw';
import { db } from '../db';
import * as catalog from '../catalogData';
import type { MockProduct, MockVariant } from '../catalogData';
import { formatCurrency } from '@/utils/format';
import * as inventory from '../inventoryData';
import type { MockStockDoc, MockStockDocLine } from '../inventoryData';
import * as purchasing from '../purchasingData';
import { availableOf, needsReorder, shortageOf, stockState, violations } from '../engine/stock';
import { dueState, registerTaskSource, REMIND } from '../engine/tasks';
import { isDecreaseDoc, stockDocMachine, type StockDocRecord } from '@/lib/machines/stockDocument';
import type {
  DocRef,
  RejectDecision,
  ReorderRuleInput,
  StockArea,
  StockDetail,
  StockDoc,
  StockDocAction,
  StockDocCreateInput,
  StockDocLineInput,
  StockDocStatus,
  StockDocSummary,
  StockDocType,
  StockDocUpdateInput,
  StockLevel,
  StockListResult,
  StockMove,
  StockMoveDocType,
} from '@/types/inventory';
import { PERMISSIONS } from '@/utils/permissions';
import type { PageResult } from '@/api/types';
import { API, LATENCY, checkTransition, pageParams, paginate, problem, requireCompany, type CompanyActor } from './utils';
import { versionConflict, writeCompanyLog } from './identity';
import { findOwned, rid, variantAttributes } from './catalog';
import { sellableVariants, skuOf } from './pricing';
import { purchasable } from '@/lib/machines/product';
import { stockDrift } from './channel';

// ---------- Tồn kho, phiếu kho (UC-IN-01..03; sơ đồ B2, B3, FE#56) ----------
export const MAX_QTY = 1_000_000;
export const isQty = (n: unknown, min: number, max = MAX_QTY): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;

export const accountName = (id: string | null) =>
  id === 'system' ? 'Hệ thống' : (id && db.accounts.find((a) => a.id === id)?.fullName) || '—';

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

export const stockLevelOf = inventory.levelOf;

export function toStockLevel(product: MockProduct, variant: MockVariant, canCost: boolean): StockLevel {
  const level = stockLevelOf(product.companyId, variant.id);
  const rule = inventory.reorderRules.find(
    (r) => r.companyId === product.companyId && r.variantId === variant.id,
  );
  const available = availableOf(level);
  const shortage = shortageOf(level, level.backordered);
  const minQty = rule?.minQty ?? null;
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
    locked: level.locked,
    available,
    incoming: level.incoming,
    quarantine: level.quarantine,
    shortage,
    minQty,
    state: stockState(available, minQty),
    belowMin: purchasable(variant.businessStatus) && needsReorder(level, shortage, minQty),
    negative: violations(level).length > 0,
    drift: stockDrift(product.companyId, variant.id),
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

/** Phiếu nhập: người lập phiếu thấy giá nhập; còn lại là giá vốn, cần quyền giá vốn */
export function canSeeLineCost(doc: MockStockDoc, permissions: string[]) {
  if (permissions.includes(PERMISSIONS.costView)) return true;
  return doc.type === 'receipt' && permissions.includes(PERMISSIONS.stockDocManage);
}

/** Tổng số dự kiến − số quét của phiếu kiểm hàng về, tính theo từng dòng */
const missingOf = (doc: MockStockDoc) =>
  doc.lines.reduce((s, l) => s + Math.max(0, (l.expected ?? 0) - l.quantity), 0);

const needsDecision = (doc: MockStockDoc) =>
  doc.type === 'write_off' && doc.area === 'quarantine' && doc.status === 'rejected' && !doc.rejectDecision;

export function toStockDocSummary(doc: MockStockDoc): StockDocSummary {
  return {
    id: doc.id,
    number: doc.number,
    type: doc.type,
    kind: doc.kind,
    status: doc.status,
    area: doc.area,
    note: doc.note,
    source: doc.source,
    claimFlag: doc.claimFlag,
    lineCount: doc.lines.length,
    totalQty: doc.lines.reduce((s, l) => s + l.quantity, 0),
    createdBy: accountName(doc.createdBy),
    createdById: doc.type === 'return_inspection' ? doc.scannedBy ?? doc.createdBy : doc.createdBy,
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
      bookQty: l.bookQty,
      counted: l.counted,
      expected: l.expected,
      resell: l.resell,
      damaged: l.damaged,
      toSupplier: l.toSupplier,
      locked: l.locked,
      unitCost: showCost ? l.unitCost : null,
    })),
    statusHistory: doc.statusHistory,
    followUps: doc.followUps,
    rejectDecision: doc.rejectDecision,
    needsDecision: needsDecision(doc),
  };
}

export const stockDocEntity = (d: MockStockDoc) => ({
  type: 'inventory.stock_documents',
  id: d.id,
  label: d.number,
});
export function stockDocSnapshot(d: MockStockDoc) {
  const lineText = (l: MockStockDocLine) => {
    const sku = skuOf(d.companyId, l.variantId);
    if (d.type === 'stocktake') return `${sku}: đếm ${l.counted} (sổ ${l.bookQty})`;
    if (d.type === 'return_inspection') {
      return `${sku}: quét ${l.quantity}/${l.expected ?? 0} (bán lại ${l.resell ?? 0}, hỏng ${l.damaged ?? 0}, trả NCC ${l.toSupplier ?? 0})`;
    }
    return (
      `${sku}: ${l.quantity}` +
      (d.type === 'receipt' && d.kind === 'manual' && l.unitCost !== null ? ` × ${formatCurrency(l.unitCost)}` : '')
    );
  };
  return {
    status: d.status,
    area: d.area,
    note: d.note,
    lines: d.lines.map(lineText),
    ...(d.rejectDecision ? { rejectDecision: d.rejectDecision } : {}),
  };
}

const DOC_PREFIX: Record<StockDocType, string> = {
  receipt: 'PN',
  issue: 'PX',
  stocktake: 'KK',
  write_off: 'XH',
  to_quarantine: 'CXL',
  return_inspection: 'KHV',
};

export function nextDocNumber(companyId: string, type: StockDocType) {
  const count = inventory.docs.filter((d) => d.companyId === companyId && d.type === type).length;
  return `${DOC_PREFIX[type]}-${String(count + 1).padStart(6, '0')}`;
}

const docRef = (d: MockStockDoc): DocRef => ({ type: 'stock_document', id: d.id, number: d.number });

function pushStatus(doc: MockStockDoc, to: StockDocStatus, actor: CompanyActor | null, at: string, reason?: string | null) {
  doc.statusHistory.push({
    at,
    from: doc.status,
    to,
    by: actor ? { id: actor.account.id, name: actor.account.fullName } : null,
    source: actor ? 'user' : 'system',
    reason: reason ?? null,
  });
  doc.status = to;
}

/** Kiểm hàng về (sơ đồ B3): hệ thống lập khi kiện hoàn về hoặc nhận hàng trả; kho quét và chia */
export function createReturnInspection(
  companyId: string,
  source: DocRef,
  lines: { variantId: string; quantity: number }[],
  note: string,
  at: string,
  orderId?: string,
): MockStockDoc {
  const doc: MockStockDoc = {
    id: rid('sd'),
    companyId,
    number: nextDocNumber(companyId, 'return_inspection'),
    type: 'return_inspection',
    kind: 'auto',
    status: 'draft',
    area: null,
    note,
    orderId: orderId ?? (source.type === 'order' ? source.id : null),
    source,
    claimFlag: false,
    lines: lines.map((l) => ({
      variantId: l.variantId,
      quantity: 0,
      expected: l.quantity,
      resell: 0,
      damaged: 0,
      toSupplier: 0,
      unitCost: null,
    })),
    createdBy: 'system',
    createdAt: at,
    postedBy: null,
    postedAt: null,
    version: 1,
    statusHistory: [{ at, from: null, to: 'draft', by: null, source: 'system' }],
    followUps: [],
    rejectDecision: null,
  };
  inventory.docs.push(doc);
  return doc;
}

type Errors = Record<string, string>;

/** Biến thể đang bán của công ty, không lặp; lỗi theo đường dẫn "lines.<i>.variantId" */
function checkVariant(line: StockDocLineInput, i: number, companyId: string, seen: Set<string>, errors: Errors) {
  const found = findVariant(String(line.variantId));
  if (!found || found.product.companyId !== companyId || found.product.archivedAt || found.variant.archivedAt) {
    errors[`lines.${i}.variantId`] = 'Biến thể không còn bán';
  } else if (seen.has(line.variantId)) {
    errors[`lines.${i}.variantId`] = 'Biến thể bị lặp';
  }
  seen.add(line.variantId);
}

/** Số của khu vực trên sổ lúc này */
const bookOf = (companyId: string, variantId: string, area: StockArea) => {
  const level = stockLevelOf(companyId, variantId);
  return area === 'stock' ? level.onHand : level.quarantine;
};

/**
 * Kiểm và dựng dòng phiếu lập tay. Kiểm kê chụp tồn sổ lúc lưu và tính Δ; xuất huỷ, chuyển chờ
 * xử lý nhận số lượng. Kiểm hàng về giữ số dự kiến, nhận thêm dòng SKU thực nhận khi sai mẫu.
 */
function buildLines(
  doc: Pick<MockStockDoc, 'type' | 'companyId' | 'lines'>,
  area: StockArea,
  body: { note?: string; lines?: StockDocLineInput[] },
) {
  const errors: Errors = {};
  const note = body.note?.trim() ?? '';
  if (note.length > 500) errors.note = 'Ghi chú tối đa 500 ký tự';
  else if ((doc.type === 'write_off' || doc.type === 'to_quarantine') && !note) errors.note = 'Nhập lý do';
  const input = Array.isArray(body.lines) ? body.lines : [];
  if (input.length > 200) errors.lines = 'Tối đa 200 dòng một phiếu';
  if (!input.length && doc.type !== 'return_inspection') errors.lines = 'Thêm ít nhất một dòng';
  const seen = new Set<string>();
  const lines: MockStockDocLine[] = [];

  if (doc.type === 'return_inspection') {
    // Dòng dự kiến luôn còn; dòng thêm là SKU thực nhận khi sai mẫu (dự kiến 0)
    const expected = doc.lines.filter((l) => (l.expected ?? 0) > 0);
    const extra = input.filter((l) => !expected.some((e) => e.variantId === l.variantId));
    const all = [...expected.map((e) => input.find((l) => l.variantId === e.variantId) ?? { variantId: e.variantId }), ...extra];
    all.forEach((line, i) => {
      const exp = expected.find((e) => e.variantId === line.variantId)?.expected ?? 0;
      if (!exp) checkVariant(line, i, doc.companyId, seen, errors);
      else seen.add(line.variantId);
      const scanned = line.scanned ?? 0;
      const parts = [line.resell ?? 0, line.damaged ?? 0, line.toSupplier ?? 0];
      if (!isQty(scanned, 0)) errors[`lines.${i}.scanned`] = 'Số quét là số nguyên không âm';
      else if (!exp && scanned < 1) errors[`lines.${i}.scanned`] = 'Dòng sai mẫu cần số quét từ 1';
      if (!parts.every((p) => isQty(p, 0))) errors[`lines.${i}.resell`] = 'Số chia là số nguyên không âm';
      else if (parts[0] + parts[1] + parts[2] !== scanned) {
        errors[`lines.${i}.resell`] = 'Bán lại + hỏng + trả NCC phải bằng số quét';
      }
      lines.push({
        variantId: line.variantId,
        quantity: scanned,
        expected: exp,
        resell: parts[0],
        damaged: parts[1],
        toSupplier: parts[2],
        unitCost: null,
      });
    });
    return { errors, note, lines };
  }

  input.forEach((line, i) => {
    checkVariant(line, i, doc.companyId, seen, errors);
    if (doc.type === 'stocktake') {
      if (!isQty(line.counted, 0)) errors[`lines.${i}.counted`] = 'Số đếm là số nguyên không âm';
      const bookQty = bookOf(doc.companyId, line.variantId, area);
      const counted = line.counted ?? 0;
      lines.push({ variantId: line.variantId, quantity: counted - bookQty, counted, bookQty, unitCost: null });
    } else {
      if (!isQty(line.quantity, 1)) errors[`lines.${i}.quantity`] = 'Số lượng là số nguyên từ 1';
      lines.push({ variantId: line.variantId, quantity: line.quantity ?? 0, unitCost: null });
    }
  });
  return { errors, note, lines };
}

/** Phiếu giảm lấy từ đâu: xuất huỷ theo khu vực, chuyển chờ xử lý luôn từ tồn */
const sourceArea = (doc: MockStockDoc): StockArea => (doc.type === 'write_off' ? doc.area ?? 'stock' : 'stock');

/**
 * Gửi duyệt phiếu giảm: đủ hàng thì tạm khoá phần lấy từ tồn thực (khả dụng giảm ngay).
 * Kiểm kê thiếu không chặn: CEO duyệt vẫn ghi sổ, tạm khoá tối đa phần khả dụng.
 */
function lockForApproval(doc: MockStockDoc): Errors {
  const errors: Errors = {};
  const area = sourceArea(doc);
  doc.lines.forEach((l, i) => {
    const level = stockLevelOf(doc.companyId, l.variantId);
    const need = doc.type === 'stocktake' ? Math.max(0, -l.quantity) : l.quantity;
    if (!need || doc.type === 'stocktake') return;
    const has = area === 'stock' ? availableOf(level) : level.quarantine;
    if (need > has) errors[`lines.${i}.quantity`] = `Chỉ còn ${has} ${area === 'stock' ? 'khả dụng' : 'chờ xử lý'}`;
  });
  if (Object.keys(errors).length || doc.area === 'quarantine') return errors;
  for (const l of doc.lines) {
    const level = stockLevelOf(doc.companyId, l.variantId);
    const need = doc.type === 'stocktake' ? Math.max(0, -l.quantity) : l.quantity;
    const lock = Math.min(need, availableOf(level));
    l.locked = lock;
    level.locked += lock;
  }
  return errors;
}

type Allocator = (companyId: string, variantIds: string[]) => void;
let allocator: Allocator | null = null;

/** Giao vận đăng ký cách chia hàng theo kiện (handlers/fulfillment.ts); tránh import vòng */
export function registerAllocator(fn: Allocator) {
  allocator = fn;
}

type InspectionPosted = (doc: MockStockDoc, at: string) => void;
let inspectionPosted: InspectionPosted | null = null;

/** Yêu cầu trả đăng ký việc đóng yêu cầu khi kiểm hàng về đã ghi sổ (handlers/returns.ts); tránh import vòng */
export function registerInspectionPosted(fn: InspectionPosted) {
  inspectionPosted = fn;
}

/**
 * Khả dụng tăng: chia cho kiện Thiếu hàng trước rồi mới đẩy tồn (sơ đồ B2).
 * Tồn thực xuống dưới đang giữ: lấy lại phần giữ của kiện chưa đóng gói.
 */
export function rebalance(companyId: string, variantIds: string[]) {
  allocator?.(companyId, variantIds);
}

/** Ghi sổ: Template Method ở BE — đổi tồn, ghi thẻ kho, chia hàng cho kiện thiếu, đẩy khả dụng lên sàn (QT-46) */
function postDoc(doc: MockStockDoc, actor: CompanyActor, at: string) {
  inventory.applyDoc(doc, at, actor.account.id);
  doc.postedBy = actor.account.id;
  doc.postedAt = at;
  rebalance(doc.companyId, doc.lines.map((l) => l.variantId));
  if (doc.type !== 'return_inspection') return;
  inspectionPosted?.(doc, at);
  // Phần trả NCC sinh phiếu trả NCC nháp, mua hàng chọn NCC (FE#17)
  const toSupplier = doc.lines.filter((l) => (l.toSupplier ?? 0) > 0);
  if (toSupplier.length) {
    const ret = purchasing.createSupplierReturnDraft(
      doc.companyId,
      docRef(doc),
      null,
      toSupplier.map((l) => ({ variantId: l.variantId, quantity: l.toSupplier ?? 0, unitCost: l.unitCost })),
      `Hàng trả NCC từ ${doc.number}`,
      at,
    );
    doc.followUps.push(purchasing.returnRef(ret));
  }
  // Phần hỏng sinh phiếu xuất huỷ nháp từ chờ xử lý
  const damaged = doc.lines.filter((l) => (l.damaged ?? 0) > 0);
  if (damaged.length) {
    const writeOff = createQuarantineWriteOff(
      doc.companyId,
      docRef(doc),
      damaged.map((l) => ({ variantId: l.variantId, quantity: l.damaged ?? 0 })),
      `Hàng hỏng từ ${doc.number}`,
      at,
      actor.account.id,
      doc.orderId,
    );
    doc.followUps.push(docRef(writeOff));
  }
}

/** Phiếu xuất huỷ nháp từ chờ xử lý: hàng hỏng của kiểm hàng về, phiếu trả NCC bị huỷ (FE#17) */
export function createQuarantineWriteOff(
  companyId: string,
  source: DocRef,
  lines: { variantId: string; quantity: number }[],
  note: string,
  at: string,
  by: string,
  orderId: string | null = null,
): MockStockDoc {
  const writeOff: MockStockDoc = {
    id: rid('sd'),
    companyId,
    number: nextDocNumber(companyId, 'write_off'),
    type: 'write_off',
    kind: 'auto',
    status: 'draft',
    area: 'quarantine',
    note,
    orderId,
    source,
    claimFlag: false,
    lines: lines.map((l) => ({ ...l, unitCost: null })),
    createdBy: by,
    createdAt: at,
    postedBy: null,
    postedAt: null,
    version: 1,
    statusHistory: [{ at, from: null, to: 'draft', by: null, source: 'system' }],
    followUps: [],
    rejectDecision: null,
  };
  inventory.docs.push(writeOff);
  return writeOff;
}

const recordOf = (doc: MockStockDoc): StockDocRecord => ({
  // Kiểm hàng về: người thứ hai là khác người quét
  createdBy: doc.type === 'return_inspection' ? doc.scannedBy ?? doc.createdBy : doc.createdBy,
  lineCount: doc.lines.length,
  missing: missingOf(doc),
});

const ACTIONS: StockDocAction[] = ['submit', 'approve', 'reject', 'post', 'cancel'];
const DECISIONS: RejectDecision[] = ['restock', 'supplier_return'];

registerTaskSource({
  kind: 'stock_document.approve',
  permission: PERMISSIONS.stockDocApprove,
  collect: (companyId, now) =>
    inventory.docs
      .filter((d) => d.companyId === companyId && d.status === 'pending' && d.type !== 'return_inspection')
      .map((d) => ({
        id: `stock_document.approve:${d.id}`,
        kind: 'stock_document.approve',
        group: 'Kho',
        title: `Duyệt phiếu ${d.number}`,
        detail: d.note || 'Phiếu kho đang chờ duyệt, hàng đang tạm khoá.',
        ...dueState(d.statusHistory.at(-1)?.at ?? d.createdAt, REMIND.stockDocPending, now),
        ref: { type: 'stock_document', id: d.id },
      })),
});

registerTaskSource({
  kind: 'stock_document.inspection',
  permission: PERMISSIONS.stockDocManage,
  collect: (companyId, now) =>
    inventory.docs
      .filter(
        (d) =>
          d.companyId === companyId &&
          ((d.type === 'return_inspection' && (d.status === 'draft' || d.status === 'pending')) || needsDecision(d)),
      )
      .map((d) => ({
        id: `stock_document.inspection:${d.id}`,
        kind: 'stock_document.inspection',
        group: 'Kho',
        title: needsDecision(d)
          ? `Chọn cách xử lý hàng của ${d.number}`
          : d.status === 'pending'
            ? `Duyệt phần thiếu ${d.number}`
            : `Kiểm hàng về ${d.number}`,
        detail: needsDecision(d)
          ? 'Xuất huỷ bị từ chối: nhập lại tồn hoặc trả NCC.'
          : `${d.source?.number ?? ''} ${d.note}`.trim(),
        ...dueState(d.createdAt, REMIND.stockDocPending, now),
        ref: { type: 'stock_document', id: d.id },
      })),
});

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
    const quarantine = url.searchParams.get('quarantine') === 'true';
    const all = sellableVariants(companyId).map(({ product, variant }) => toStockLevel(product, variant, canCost));
    const items = all.filter(
      (l) =>
        (!search || l.productName.toLowerCase().includes(search) || l.sku.toLowerCase().includes(search)) &&
        (!categoryId || l.category.id === categoryId) &&
        (!belowMin || l.belowMin) &&
        (!quarantine || l.quarantine > 0),
    );
    const result: StockListResult = {
      ...paginate(items, page, pageSize),
      summary: {
        variantCount: all.length,
        belowMinCount: all.filter((l) => l.belowMin).length,
        quarantineCount: all.filter((l) => l.quarantine > 0).length,
        negativeCount: all.filter((l) => l.negative).length,
        totalValue: canCost ? all.reduce((s, l) => s + (l.stockValue ?? 0), 0) : null,
      },
    };
    return HttpResponse.json<StockListResult>(result);
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
        const doc = m.ref ? null : inventory.docs.find((d) => d.id === m.docId)!;
        return {
          id: m.id,
          qtyChange: m.qtyChange,
          area: m.area,
          onHandAfter: m.onHandAfter,
          document: doc
            ? { id: doc.id, number: doc.number, type: doc.type, kind: doc.kind }
            : { id: m.ref!.id, number: m.ref!.number, type: m.ref!.type as StockMoveDocType, kind: 'purchase' as const },
          unitCost: canCost ? m.unitCost : null,
          doneAt: m.doneAt,
          doneBy: accountName(m.doneBy),
        };
      });
    const detail: StockDetail = { level: toStockLevel(product, variant, canCost), moves };
    return HttpResponse.json<StockDetail>(detail);
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
    // Cần nhập lại thì BE phát sự kiện để báo Nhân viên kho, Admin (QT-16); mock không gửi thông báo
    return HttpResponse.json<StockLevel>(toStockLevel(product, variant, canCost));
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
            (d.source?.number ?? '').toLowerCase().includes(search)),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toStockDocSummary);
    return HttpResponse.json<PageResult<StockDocSummary>>(paginate(items, page, pageSize));
  }),

  http.get(`${API}/inventory/documents/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.stockView);
    if (!guard.ok) return guard.response;
    const found = findOwned(inventory.docs, params.id, guard.value.companyId, 'phiếu kho');
    if (!found.ok) return found.response;
    return HttpResponse.json<StockDoc>(toStockDoc(found.value, guard.value.permissions));
  }),

  /** Lập phiếu kiểm kê, xuất huỷ, chuyển chờ xử lý (nháp) */
  http.post(`${API}/inventory/documents`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.stockDocManage);
    if (!guard.ok) return guard.response;
    const { companyId } = guard.value;
    const body = (await request.json()) as StockDocCreateInput;
    if (body.type !== 'stocktake' && body.type !== 'write_off' && body.type !== 'to_quarantine') {
      return problem(422, 'Dữ liệu không hợp lệ', {
        errors: { type: 'Chọn kiểm kê, xuất huỷ hoặc chuyển chờ xử lý' },
      });
    }
    const area: StockArea = body.type === 'to_quarantine' ? 'stock' : body.area === 'quarantine' ? 'quarantine' : 'stock';
    const { errors, note, lines } = buildLines({ type: body.type, companyId, lines: [] }, area, body);
    if (Object.keys(errors).length) return problem(422, 'Dữ liệu không hợp lệ', { errors });
    const at = db.now();
    const doc: MockStockDoc = {
      id: rid('sd'),
      companyId,
      number: nextDocNumber(companyId, body.type),
      type: body.type,
      kind: 'manual',
      status: 'draft',
      area: body.type === 'to_quarantine' ? null : area,
      note,
      orderId: null,
      source: null,
      claimFlag: false,
      lines,
      createdBy: guard.value.account.id,
      createdAt: at,
      postedBy: null,
      postedAt: null,
      version: 1,
      statusHistory: [
        {
          at,
          from: null,
          to: 'draft',
          by: { id: guard.value.account.id, name: accountName(guard.value.account.id) },
          source: 'user',
        },
      ],
      followUps: [],
      rejectDecision: null,
    };
    inventory.docs.push(doc);
    writeCompanyLog(guard.value, 'create', stockDocEntity(doc), null, stockDocSnapshot(doc));
    return HttpResponse.json<StockDoc>(toStockDoc(doc, guard.value.permissions), { status: 201 });
  }),

  /** Sửa phiếu nháp; kiểm hàng về: ghi số quét và cách chia */
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
    if (doc.status !== 'draft' || doc.type === 'receipt' || doc.type === 'issue') {
      return problem(409, 'Phiếu không còn sửa được', {
        code: 'not_draft',
        detail: 'Chỉ sửa được phiếu nháp.',
      });
    }
    const area: StockArea =
      doc.type === 'stocktake' || (doc.type === 'write_off' && doc.kind === 'manual')
        ? body.area === 'quarantine'
          ? 'quarantine'
          : 'stock'
        : doc.area ?? 'stock';
    const { errors, note, lines } = buildLines(doc, area, body);
    if (Object.keys(errors).length) return problem(422, 'Dữ liệu không hợp lệ', { errors });
    const before = stockDocSnapshot(doc);
    if (doc.area) doc.area = area;
    doc.note = note;
    doc.lines = lines;
    if (doc.type === 'return_inspection') {
      doc.scannedBy = guard.value.account.id;
      doc.claimFlag = missingOf(doc) > 0;
    }
    doc.version += 1;
    writeCompanyLog(guard.value, 'update', stockDocEntity(doc), before, stockDocSnapshot(doc));
    return HttpResponse.json<StockDoc>(toStockDoc(doc, permissions));
  }),

  /** Xuất huỷ hàng chờ xử lý bị từ chối: kho chọn nhập lại tồn hoặc trả NCC */
  http.post(`${API}/inventory/documents/:id/decide`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, PERMISSIONS.stockDocManage);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const found = findOwned(inventory.docs, params.id, companyId, 'phiếu kho');
    if (!found.ok) return found.response;
    const doc = found.value;
    const body = (await request.json()) as { decision: RejectDecision; version: number };
    if (body.version !== doc.version) {
      return versionConflict(toStockDoc(doc, permissions), 'Phiếu vừa được người khác xử lý.');
    }
    if (!needsDecision(doc)) {
      return problem(409, 'Phiếu không cần chọn cách xử lý', {
        code: doc.rejectDecision ? 'decision_made' : 'invalid_transition',
      });
    }
    if (!DECISIONS.includes(body.decision)) {
      return problem(422, 'Dữ liệu không hợp lệ', { errors: { decision: 'Chọn nhập lại tồn hoặc trả NCC' } });
    }
    const before = stockDocSnapshot(doc);
    const at = db.now();
    doc.rejectDecision = body.decision;
    if (body.decision === 'restock') {
      inventory.restockFromQuarantine(doc, at, guard.value.account.id);
      rebalance(companyId, doc.lines.map((l) => l.variantId));
    }
    if (body.decision === 'supplier_return') {
      // Hàng nằm lại chờ xử lý, sinh phiếu trả NCC nháp (FE#17)
      const ret = purchasing.createSupplierReturnDraft(
        companyId,
        docRef(doc),
        null,
        doc.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitCost: l.unitCost })),
        `Xuất huỷ ${doc.number} bị từ chối, trả NCC`,
        at,
      );
      doc.followUps.push(purchasing.returnRef(ret));
    }
    doc.version += 1;
    writeCompanyLog(guard.value, 'update', stockDocEntity(doc), before, stockDocSnapshot(doc));
    return HttpResponse.json<StockDoc>(toStockDoc(doc, permissions));
  }),

  /** Chuyển trạng thái theo lib/machines/stockDocument: submit, approve, reject, post, cancel */
  http.post(`${API}/inventory/documents/:id/:action`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, null);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const found = findOwned(inventory.docs, params.id, companyId, 'phiếu kho');
    if (!found.ok) return found.response;
    const doc = found.value;
    const action = params.action as StockDocAction;
    if (!ACTIONS.includes(action)) return problem(404, 'Không có thao tác này');
    const body = (await request.json()) as { version: number; reason?: string | null };
    if (body.version !== doc.version) {
      return versionConflict(toStockDoc(doc, permissions), 'Phiếu vừa được người khác sửa hoặc xử lý.');
    }
    const reason = body.reason?.trim() || null;
    const next = checkTransition(stockDocMachine(doc.type), doc.status, action, guard.value, recordOf(doc), reason);
    if (!next.ok) return next.response;
    const before = stockDocSnapshot(doc);
    const at = db.now();

    if (action === 'submit' && isDecreaseDoc(doc.type)) {
      const errors = lockForApproval(doc);
      if (Object.keys(errors).length) {
        return problem(422, 'Không đủ hàng để giảm', { code: 'stock_insufficient', errors });
      }
    }
    if (action === 'submit' && doc.type === 'return_inspection') {
      // Gửi phiếu chưa sửa gì: người gửi là người quét, phần thiếu bật cờ khiếu nại
      doc.scannedBy ??= guard.value.account.id;
      doc.claimFlag = missingOf(doc) > 0;
    }
    if (action === 'approve' || action === 'post') {
      if (doc.type === 'write_off' && doc.area === 'quarantine') {
        const errors: Errors = {};
        doc.lines.forEach((l, i) => {
          const has = stockLevelOf(companyId, l.variantId).quarantine;
          if (l.quantity > has) errors[`lines.${i}.quantity`] = `Chỉ còn ${has} chờ xử lý`;
        });
        if (Object.keys(errors).length) {
          return problem(422, 'Không đủ hàng chờ xử lý', { code: 'stock_insufficient', errors });
        }
      }
      postDoc(doc, guard.value, at);
    }
    if (action === 'reject' && doc.type !== 'return_inspection') inventory.unlockDoc(doc);

    pushStatus(doc, next.value, guard.value, at, reason);
    doc.version += 1;
    writeCompanyLog(guard.value, 'update', stockDocEntity(doc), before, stockDocSnapshot(doc));
    return HttpResponse.json<StockDoc>(toStockDoc(doc, permissions));
  }),
];
