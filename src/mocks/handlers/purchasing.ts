import { http, HttpResponse, delay } from 'msw';
import { db } from '../db';
import * as catalog from '../catalogData';
import * as inventory from '../inventoryData';
import * as data from '../purchasingData';
import type {
  MockGoodsReceipt,
  MockPurchaseRequest,
  MockPurchaseRequestLine,
  MockSupplier,
  MockSupplierReturn,
} from '../purchasingData';
import { dueState, registerTaskSource, REMIND } from '../engine/tasks';
import {
  goodsReceiptMachine,
  purchaseRequestMachine,
  supplierReturnMachine,
  type GoodsReceiptRecord,
  type PurchaseRequestRecord,
  type SupplierReturnRecord,
} from '@/lib/machines/purchasing';
import type { StatusChange } from '@/lib/stateMachine';
import type {
  AddRequestLineInput,
  GoodsReceipt,
  GoodsReceiptAction,
  GoodsReceiptCreateInput,
  GoodsReceiptSummary,
  GoodsReceiptUpdateInput,
  PurchaseRequest,
  PurchaseRequestAction,
  PurchaseRequestInput,
  PurchaseRequestSummary,
  ShortResolutionInput,
  Supplier,
  SupplierInput,
  SupplierReport,
  SupplierReturn,
  SupplierReturnAction,
  SupplierReturnActionInput,
  SupplierReturnInput,
  SupplierReturnSummary,
} from '@/types/purchasing';
import { PERMISSIONS } from '@/utils/permissions';
import { API, LATENCY, checkTransition, pageParams, paginate, problem, requireCompany, type CompanyActor } from './utils';
import { versionConflict, writeCompanyLog } from './identity';
import { findOwned, nextVariant, rid } from './catalog';
import { purchasable } from '@/lib/machines/product';
import { MAX_QTY, accountName, createQuarantineWriteOff, findVariant, isQty, rebalance, stockLevelOf, variantLabel } from './inventory';

// ---------- Nhập hàng (sơ đồ A1, A2, B4; FE#17) ----------
const P = PERMISSIONS;
type Errors = Record<string, string>;
const MAX_COST = 1_000_000_000;
const isCost = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_COST;
const invalid = (errors: Errors, extra: Record<string, unknown> = {}) =>
  problem(422, 'Dữ liệu không hợp lệ', { errors, ...extra });
const hasErrors = (e: Errors) => Object.keys(e).length > 0;

/** Xem nhập hàng: có một trong các quyền purchasing.* (danh sách, chi tiết) */
function requireViewer(request: Request) {
  const guard = requireCompany(request, null);
  if (!guard.ok) return guard;
  if (!guard.value.permissions.some((p) => p.startsWith('purchasing.'))) {
    return { ok: false as const, response: problem(403, 'Không có quyền xem nhập hàng') };
  }
  return guard;
}

const canSeeCost = (permissions: string[]) =>
  permissions.includes(P.costView) || permissions.includes(P.purchaseRequestManage) || permissions.includes(P.purchaseRequestApprove);

const byOf = (actor: CompanyActor) => ({ id: actor.account.id, name: actor.account.fullName });

function pushStatus<S extends string>(
  rec: { status: S; statusHistory: StatusChange<S>[] },
  to: S,
  actor: CompanyActor | null,
  at: string,
  reason?: string | null,
) {
  rec.statusHistory.push({
    at,
    from: rec.status,
    to,
    by: actor ? byOf(actor) : null,
    source: actor ? 'user' : 'system',
    reason: reason ?? null,
  });
  rec.status = to;
}

const supplierOf = (id: string | null) => (id ? data.suppliers.find((s) => s.id === id) ?? null : null);
const supplierBrief = (id: string | null) => {
  const s = supplierOf(id);
  return s ? { id: s.id, name: s.name } : null;
};

// ---------- Nhà cung cấp ----------

const toSupplier = (s: MockSupplier): Supplier => ({
  id: s.id,
  name: s.name,
  phone: s.phone,
  email: s.email,
  address: s.address,
  note: s.note,
  active: s.active,
  version: s.version,
  createdAt: s.createdAt,
});

function validateSupplier(companyId: string, body: SupplierInput, exceptId?: string) {
  const errors: Errors = {};
  const name = String(body.name ?? '').trim();
  if (!name) errors.name = 'Nhập tên nhà cung cấp';
  else if (name.length > 150) errors.name = 'Tối đa 150 ký tự';
  else if (
    data.suppliers.some(
      (s) => s.companyId === companyId && s.id !== exceptId && s.name.toLowerCase() === name.toLowerCase(),
    )
  ) {
    errors.name = 'Đã có nhà cung cấp tên này';
  }
  const email = String(body.email ?? '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Email không hợp lệ';
  const phone = String(body.phone ?? '').trim();
  if (phone && !/^[0-9 +().-]{8,20}$/.test(phone)) errors.phone = 'Số điện thoại không hợp lệ';
  return {
    errors,
    value: {
      name,
      email,
      phone,
      address: String(body.address ?? '').trim().slice(0, 300),
      note: String(body.note ?? '').trim().slice(0, 500),
      active: body.active !== false,
    },
  };
}

const supplierEntity = (s: MockSupplier) => ({ type: 'purchasing.suppliers', id: s.id, label: s.name });

/** Báo cáo theo NCC: số phiếu nhận từng giao thiếu, tỉ lệ lỗi trên hàng đã giao */
function supplierReport(companyId: string): SupplierReport[] {
  return data.suppliers
    .filter((s) => s.companyId === companyId)
    .map((s) => {
      const posted = data.receipts.filter((r) => {
        const req = data.requests.find((x) => x.id === r.requestId)!;
        return r.companyId === companyId && req.supplierId === s.id && r.postedAt;
      });
      const deliveredQty = posted.reduce(
        (sum, r) => sum + r.lines.reduce((x, l) => x + l.accepted + l.defectKept + l.returnedOnSpot, 0),
        0,
      );
      const defectQty = posted.reduce((sum, r) => sum + r.lines.reduce((x, l) => x + l.defectKept + l.returnedOnSpot, 0), 0);
      return {
        supplierId: s.id,
        supplierName: s.name,
        receiptCount: posted.length,
        shortReceiptCount: posted.filter((r) => r.status === 'short' || r.status === 'resolved').length,
        deliveredQty,
        defectQty,
        defectRate: deliveredQty ? defectQty / deliveredQty : null,
      };
    });
}

// ---------- Đề nghị nhập ----------

const receiptsOf = (req: MockPurchaseRequest) => data.receipts.filter((r) => r.requestId === req.id);

function requestRecord(req: MockPurchaseRequest): PurchaseRequestRecord {
  const receipts = receiptsOf(req).filter((r) => r.status !== 'cancelled');
  return {
    createdBy: req.createdBy,
    lineCount: req.lines.length,
    activeLines: req.lines.filter((l) => !l.excluded).length,
    receiptCount: receipts.length,
    countingReceipts: receipts.filter((r) => r.status === 'counting').length,
  };
}

function lineView(companyId: string, l: MockPurchaseRequestLine, showCost: boolean) {
  const label = l.variantId ? variantLabel(companyId, l.variantId) : null;
  return {
    id: l.id,
    variantId: l.variantId,
    sku: label?.sku ?? null,
    productName: label?.productName || l.newProduct?.name || '',
    attributesLabel: label?.attributesLabel ?? '',
    newProduct: l.newProduct
      ? { ...l.newProduct, categoryName: catalog.categories.find((c) => c.id === l.newProduct!.categoryId)?.name ?? '' }
      : null,
    quantity: l.quantity,
    unitCost: showCost ? l.unitCost : null,
    excluded: l.excluded,
    received: l.received,
    defective: l.defective,
    closedShort: l.closedShort,
    outstanding: data.outstandingOf(l),
  };
}

function toRequestSummary(req: MockPurchaseRequest, permissions: string[]): PurchaseRequestSummary {
  const active = req.lines.filter((l) => !l.excluded);
  return {
    id: req.id,
    number: req.number,
    status: req.status,
    supplier: supplierBrief(req.supplierId)!,
    note: req.note,
    lineCount: active.length,
    totalQty: active.reduce((s, l) => s + l.quantity, 0),
    totalCost: canSeeCost(permissions) ? active.reduce((s, l) => s + l.quantity * l.unitCost, 0) : null,
    outstanding: req.lines.reduce((s, l) => s + data.outstandingOf(l), 0),
    supplierShort: receiptsOf(req).some((r) => r.status === 'short'),
    createdBy: accountName(req.createdBy),
    createdById: req.createdBy,
    createdAt: req.createdAt,
    version: req.version,
  };
}

function toRequest(req: MockPurchaseRequest, permissions: string[]): PurchaseRequest {
  const showCost = canSeeCost(permissions);
  const source = req.sourceReturnId ? data.returns.find((r) => r.id === req.sourceReturnId) : null;
  return {
    ...toRequestSummary(req, permissions),
    lines: req.lines.map((l) => lineView(req.companyId, l, showCost)),
    receipts: receiptsOf(req).map((r) => ({ ...data.receiptRef(r), status: r.status })),
    sourceReturn: source ? data.returnRef(source) : null,
    countingReceipts: requestRecord(req).countingReceipts,
    statusHistory: req.statusHistory,
  };
}

const requestEntity = (r: MockPurchaseRequest) => ({ type: 'purchasing.purchase_requests', id: r.id, label: r.number });
const requestSnapshot = (r: MockPurchaseRequest) => ({
  status: r.status,
  supplierId: r.supplierId,
  note: r.note,
  lines: r.lines.map((l) => ({ ...l })),
});

/** Dòng đề nghị: biến thể đang bán hoặc sản phẩm mới; lỗi theo "lines.<i>.<field>" */
function buildRequestLines(companyId: string, body: PurchaseRequestInput, old: MockPurchaseRequestLine[] = []) {
  const errors: Errors = {};
  if (!Array.isArray(body.lines)) return { errors: { lines: 'Thêm ít nhất một dòng' }, lines: [] };
  if (body.lines.length > 100) errors.lines = 'Tối đa 100 dòng';
  const seen = new Set<string>();
  const lines: MockPurchaseRequestLine[] = body.lines.map((l, i) => {
    const path = `lines.${i}`;
    let variantId: string | null = null;
    let newProduct: MockPurchaseRequestLine['newProduct'] = null;
    if (l.newProduct) {
      const name = String(l.newProduct.name ?? '').trim();
      if (!name) errors[`${path}.newProduct.name`] = 'Nhập tên sản phẩm mới';
      else if (name.length > 120) errors[`${path}.newProduct.name`] = 'Tối đa 120 ký tự';
      const cat = catalog.categories.find((c) => c.id === l.newProduct!.categoryId && c.companyId === companyId);
      if (!cat) errors[`${path}.newProduct.categoryId`] = 'Chọn danh mục';
      newProduct = { name, categoryId: String(l.newProduct.categoryId ?? '') };
    } else {
      const found = findVariant(String(l.variantId ?? ''));
      if (!found || found.product.companyId !== companyId) errors[`${path}.variantId`] = 'Chọn sản phẩm';
      else if (!purchasable(found.variant.businessStatus)) errors[`${path}.variantId`] = 'SKU đã ngừng nhập';
      else if (seen.has(found.variant.id)) errors[`${path}.variantId`] = 'Sản phẩm bị lặp';
      else {
        variantId = found.variant.id;
        seen.add(variantId);
      }
    }
    if (!isQty(l.quantity, 1)) errors[`${path}.quantity`] = `Số lượng từ 1 đến ${MAX_QTY.toLocaleString('vi-VN')}`;
    if (!isCost(l.unitCost)) errors[`${path}.unitCost`] = 'Giá nhập không hợp lệ';
    const prev = old[i];
    return {
      id: prev?.id ?? rid('prl'),
      variantId,
      newProduct,
      quantity: l.quantity,
      unitCost: l.unitCost,
      excluded: false,
      received: 0,
      defective: 0,
      closedShort: 0,
    };
  });
  return { errors, lines };
}

function checkSupplier(companyId: string, supplierId: unknown, errors: Errors) {
  const s = data.suppliers.find((x) => x.id === supplierId && x.companyId === companyId);
  if (!s) errors.supplierId = 'Chọn nhà cung cấp';
  else if (!s.active) errors.supplierId = 'Nhà cung cấp đã ngừng giao dịch';
  return s ?? null;
}

/** Duyệt: chốt giá, dòng sản phẩm mới sinh sản phẩm + SKU theo quy tắc danh mục */
function createNewProducts(req: MockPurchaseRequest, at: string) {
  for (const l of req.lines) {
    if (l.excluded || !l.newProduct || l.variantId) continue;
    const category = catalog.categories.find((c) => c.id === l.newProduct!.categoryId)!;
    const variant = nextVariant(category, []);
    catalog.products.push({
      id: rid('prd'),
      companyId: req.companyId,
      categoryId: category.id,
      name: l.newProduct.name,
      description: `Tạo từ đề nghị nhập ${req.number}`,
      imageFileIds: [],
      variants: [variant],
      archivedAt: null,
      updatedAt: at,
      version: 1,
    });
    l.variantId = variant.id;
  }
}

/** Phiếu giao thiếu tự sang Đã xử lý khi đề nghị nhận đủ hoặc bị đóng thiếu */
function resolveShortReceipts(req: MockPurchaseRequest, at: string) {
  for (const r of receiptsOf(req).filter((x) => x.status === 'short')) {
    pushStatus(r, 'resolved', null, at);
    r.version += 1;
  }
}

function closeShort(req: MockPurchaseRequest, actor: CompanyActor, at: string, reason: string) {
  for (const l of req.lines) l.closedShort += data.outstandingOf(l);
  pushStatus(req, 'closed_short', actor, at, reason);
  resolveShortReceipts(req, at);
  data.syncIncoming(req.companyId);
}

/** Sau mỗi lần ghi sổ phiếu nhận: nhận một phần hoặc nhận xong */
function updateReceiveStatus(req: MockPurchaseRequest, at: string) {
  const left = req.lines.reduce((s, l) => s + data.outstandingOf(l), 0);
  const action: PurchaseRequestAction = left ? 'receive_partial' : 'receive_all';
  const next = purchaseRequestMachine.check(req.status, action);
  if (!next.ok) return;
  if (next.to !== req.status) pushStatus(req, next.to, null, at);
  if (next.to === 'received') resolveShortReceipts(req, at);
}

const REQUEST_ACTIONS: PurchaseRequestAction[] = [
  'submit',
  'withdraw',
  'resubmit',
  'approve',
  'request_changes',
  'reject',
  'order',
  'close_short',
  'cancel',
];

// ---------- Phiếu nhận ----------

const shortOf = (l: { announced: number; accepted: number; defectKept: number; returnedOnSpot: number }) =>
  Math.max(0, l.announced - l.accepted - l.defectKept - l.returnedOnSpot);

const requestOf = (r: MockGoodsReceipt) => data.requests.find((x) => x.id === r.requestId)!;
const requestLineOf = (r: MockGoodsReceipt, lineId: string) => requestOf(r).lines.find((l) => l.id === lineId)!;

function toReceiptSummary(r: MockGoodsReceipt): GoodsReceiptSummary {
  const req = requestOf(r);
  return {
    id: r.id,
    number: r.number,
    status: r.status,
    request: { id: req.id, number: req.number },
    supplier: supplierBrief(req.supplierId)!,
    deliveryMode: r.deliveryMode,
    note: r.note,
    totalAnnounced: r.lines.reduce((s, l) => s + l.announced, 0),
    shortQty: r.lines.reduce((s, l) => s + shortOf(l), 0),
    createdBy: accountName(r.createdBy),
    createdById: r.createdBy,
    createdAt: r.createdAt,
    postedBy: r.postedBy ? accountName(r.postedBy) : null,
    postedAt: r.postedAt,
    version: r.version,
  };
}

function toReceipt(r: MockGoodsReceipt): GoodsReceipt {
  const req = requestOf(r);
  return {
    ...toReceiptSummary(r),
    lines: r.lines.map((l) => {
      const label = variantLabel(r.companyId, l.variantId);
      return {
        lineId: l.lineId,
        variantId: l.variantId,
        ...label,
        outstanding: data.outstandingOf(requestLineOf(r, l.lineId)),
        announced: l.announced,
        accepted: l.accepted,
        defectKept: l.defectKept,
        returnedOnSpot: l.returnedOnSpot,
        short: shortOf(l),
        reason: l.reason,
      };
    }),
    attachments: r.attachmentIds.flatMap((id) => {
      const f = catalog.files.find((x) => x.id === id);
      return f?.url ? [{ fileId: f.id, name: f.fileName, url: f.url, contentType: f.contentType }] : [];
    }),
    requestCreatedById: req.createdBy,
    shortResolution: r.shortResolution
      ? { ...r.shortResolution, by: accountName(r.shortResolution.by) }
      : null,
    followUps: r.followUps,
    statusHistory: r.statusHistory,
  };
}

const receiptRecord = (r: MockGoodsReceipt): GoodsReceiptRecord => ({
  createdBy: requestOf(r).createdBy,
  short: r.lines.reduce((s, l) => s + shortOf(l), 0),
});

const receiptEntity = (r: MockGoodsReceipt) => ({ type: 'purchasing.goods_receipts', id: r.id, label: r.number });
const receiptSnapshot = (r: MockGoodsReceipt) => ({
  status: r.status,
  deliveryMode: r.deliveryMode,
  note: r.note,
  lines: r.lines.map((l) => ({ ...l })),
  shortResolution: r.shortResolution,
});

/** Nhận đạt + lỗi giữ không vượt còn chờ của dòng đề nghị */
function checkOutstanding(r: MockGoodsReceipt): Errors {
  const errors: Errors = {};
  r.lines.forEach((l, i) => {
    const left = data.outstandingOf(requestLineOf(r, l.lineId));
    if (l.accepted + l.defectKept > left) errors[`lines.${i}.accepted`] = `Còn chờ ${left}, nhận đạt và lỗi giữ vượt số này`;
  });
  return errors;
}

/** Ghi sổ một lần: nhận đạt vào tồn (tính lại giá vốn), lỗi giữ vào chờ xử lý và sinh phiếu trả NCC nháp */
function postReceipt(r: MockGoodsReceipt, actor: CompanyActor, at: string) {
  const req = requestOf(r);
  const ref = data.receiptRef(r);
  const defects: { variantId: string; quantity: number; unitCost: number }[] = [];
  for (const l of r.lines) {
    const rl = requestLineOf(r, l.lineId);
    inventory.receiveStock(r.companyId, ref, l.variantId, l.accepted, rl.unitCost, at, actor.account.id);
    inventory.postMove(r.companyId, { docId: r.id, ref }, l.variantId, 'quarantine', l.defectKept, rl.unitCost, at, actor.account.id);
    rl.received += l.accepted;
    rl.defective += l.defectKept;
    if (l.defectKept) defects.push({ variantId: l.variantId, quantity: l.defectKept, unitCost: rl.unitCost });
  }
  r.postedBy = actor.account.id;
  r.postedAt = at;
  if (defects.length) {
    const ret = data.createSupplierReturnDraft(r.companyId, ref, req.supplierId, defects, `Hàng lỗi giữ lại khi nhận ${r.number}`, at);
    r.followUps.push(data.returnRef(ret));
  }
  rebalance(r.companyId, r.lines.map((l) => l.variantId));
  data.syncIncoming(r.companyId);
  updateReceiveStatus(req, at);
}

const RECEIPT_ACTIONS: GoodsReceiptAction[] = ['post', 'post_short', 'cancel'];

// ---------- Phiếu trả NCC ----------

function toReturnSummary(t: MockSupplierReturn): SupplierReturnSummary {
  return {
    id: t.id,
    number: t.number,
    status: t.status,
    supplier: supplierBrief(t.supplierId),
    source: t.source,
    note: t.note,
    totalQty: t.lines.reduce((s, l) => s + l.quantity, 0),
    createdBy: accountName(t.createdBy),
    createdById: t.createdBy,
    createdAt: t.createdAt,
    sentAt: t.sentAt,
    version: t.version,
  };
}

function toReturn(t: MockSupplierReturn, permissions: string[]): SupplierReturn {
  const showCost = permissions.includes(P.costView);
  return {
    ...toReturnSummary(t),
    lines: t.lines.map((l) => ({
      variantId: l.variantId,
      ...variantLabel(t.companyId, l.variantId),
      quantity: l.quantity,
      quarantine: stockLevelOf(t.companyId, l.variantId).quarantine,
      unitCost: showCost ? l.unitCost : null,
    })),
    sentBy: t.sentBy ? accountName(t.sentBy) : null,
    sentById: t.sentBy,
    refundAmount: t.refundAmount,
    replacementRequest: t.replacementRequest,
    cancelDecision: t.cancelDecision,
    followUps: t.followUps,
    statusHistory: t.statusHistory,
  };
}

const returnRecord = (t: MockSupplierReturn): SupplierReturnRecord => ({
  createdBy: t.sentBy,
  lineCount: t.lines.length,
  hasSupplier: !!t.supplierId,
});

const returnEntity = (t: MockSupplierReturn) => ({ type: 'purchasing.supplier_returns', id: t.id, label: t.number });
const returnSnapshot = (t: MockSupplierReturn) => ({
  status: t.status,
  supplierId: t.supplierId,
  note: t.note,
  lines: t.lines.map((l) => ({ ...l })),
  refundAmount: t.refundAmount,
  cancelDecision: t.cancelDecision,
});

function buildReturnLines(companyId: string, body: SupplierReturnInput) {
  const errors: Errors = {};
  if (!Array.isArray(body.lines)) return { errors: { lines: 'Thêm ít nhất một dòng' }, lines: [] };
  const seen = new Set<string>();
  const lines = body.lines.map((l, i) => {
    const found = findVariant(String(l.variantId ?? ''));
    if (!found || found.product.companyId !== companyId) errors[`lines.${i}.variantId`] = 'Chọn sản phẩm';
    else if (seen.has(found.variant.id)) errors[`lines.${i}.variantId`] = 'Sản phẩm bị lặp';
    else seen.add(found.variant.id);
    if (!isQty(l.quantity, 1)) errors[`lines.${i}.quantity`] = 'Số lượng phải từ 1';
    else if (found && l.quantity > stockLevelOf(companyId, found.variant.id).quarantine) {
      errors[`lines.${i}.quantity`] = `Chỉ còn ${stockLevelOf(companyId, found.variant.id).quarantine} chờ xử lý`;
    }
    return {
      variantId: String(l.variantId),
      quantity: l.quantity,
      unitCost: found ? stockLevelOf(companyId, found.variant.id).avgCost : null,
    };
  });
  return { errors, lines };
}

const RETURN_ACTIONS: SupplierReturnAction[] = [
  'submit',
  'send_back',
  'approve_send',
  'record_refund',
  'record_replaced',
  'record_rejected',
  'cancel',
];

// ---------- Nhắc việc ----------

registerTaskSource({
  kind: 'purchase_request.approve',
  permission: P.purchaseRequestApprove,
  collect: (companyId, now) =>
    data.requests
      .filter((r) => r.companyId === companyId && r.status === 'pending_approval')
      .map((r) => ({
        id: `purchase_request.approve:${r.id}`,
        kind: 'purchase_request.approve',
        group: 'Mua hàng',
        title: `Duyệt đề nghị nhập ${r.number}`,
        detail: `${supplierOf(r.supplierId)?.name ?? ''} · ${r.lines.length} dòng`,
        ...dueState(r.statusHistory.at(-1)?.at ?? r.createdAt, REMIND.stockDocPending, now),
        ref: { type: 'purchase_request', id: r.id },
      })),
});

registerTaskSource({
  kind: 'goods_receipt.counting',
  permission: P.goodsReceiptManage,
  collect: (companyId, now) =>
    data.receipts
      .filter((r) => r.companyId === companyId && r.status === 'counting')
      .map((r) => ({
        id: `goods_receipt.counting:${r.id}`,
        kind: 'goods_receipt.counting',
        group: 'Mua hàng',
        title: `Kiểm xong phiếu nhận ${r.number}`,
        detail: r.deliveryMode === 'left' ? 'Người giao đã đi, kiểm trong 24 giờ.' : 'Người giao đang chờ.',
        ...dueState(r.createdAt, REMIND.goodsReceiptCounting, now),
        ref: { type: 'goods_receipt', id: r.id },
      })),
});

registerTaskSource({
  kind: 'goods_receipt.short',
  permission: P.purchaseRequestManage,
  collect: (companyId, now) =>
    data.receipts
      .filter((r) => r.companyId === companyId && r.status === 'short' && !r.shortResolution)
      .map((r) => ({
        id: `goods_receipt.short:${r.id}`,
        kind: 'goods_receipt.short',
        group: 'Mua hàng',
        title: `Ghi kết quả giao thiếu ${r.number}`,
        detail: `${supplierOf(requestOf(r).supplierId)?.name ?? ''} giao thiếu ${receiptRecord(r).short}`,
        ...dueState(r.postedAt ?? r.createdAt, REMIND.shortDelivery, now),
        ref: { type: 'goods_receipt', id: r.id },
      })),
});

registerTaskSource({
  kind: 'supplier_return.sent',
  permission: P.supplierReturnManage,
  collect: (companyId, now) =>
    data.returns
      .filter((t) => t.companyId === companyId && t.status === 'sent')
      .map((t) => ({
        id: `supplier_return.sent:${t.id}`,
        kind: 'supplier_return.sent',
        group: 'Mua hàng',
        title: `Ghi kết quả trả NCC ${t.number}`,
        detail: `${supplierOf(t.supplierId)?.name ?? ''} chưa phản hồi`,
        ...dueState(t.sentAt ?? t.createdAt, REMIND.supplierReturnSent, now),
        ref: { type: 'supplier_return', id: t.id },
      })),
});

// ---------- Handlers ----------

export const purchasingHandlers = [
  http.get(`${API}/purchasing/suppliers`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireViewer(request);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const activeOnly = url.searchParams.get('active') === 'true';
    const items = data.suppliers
      .filter(
        (s) =>
          s.companyId === guard.value.companyId &&
          (!activeOnly || s.active) &&
          (!search || s.name.toLowerCase().includes(search) || s.phone.includes(search)),
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
      .map(toSupplier);
    return HttpResponse.json(items);
  }),

  http.get(`${API}/purchasing/suppliers/report`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireViewer(request);
    if (!guard.ok) return guard.response;
    return HttpResponse.json(supplierReport(guard.value.companyId));
  }),

  http.post(`${API}/purchasing/suppliers`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, P.purchaseRequestManage);
    if (!guard.ok) return guard.response;
    const { companyId } = guard.value;
    const { errors, value } = validateSupplier(companyId, (await request.json()) as SupplierInput);
    if (hasErrors(errors)) return invalid(errors);
    const s: MockSupplier = { id: rid('sup'), companyId, ...value, version: 1, createdAt: db.now() };
    data.suppliers.push(s);
    writeCompanyLog(guard.value, 'create', supplierEntity(s), null, { ...value });
    return HttpResponse.json(toSupplier(s), { status: 201 });
  }),

  http.put(`${API}/purchasing/suppliers/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, P.purchaseRequestManage);
    if (!guard.ok) return guard.response;
    const { companyId } = guard.value;
    const found = findOwned(data.suppliers, params.id, companyId, 'nhà cung cấp');
    if (!found.ok) return found.response;
    const s = found.value;
    const body = (await request.json()) as SupplierInput;
    if (body.version !== s.version) return versionConflict(toSupplier(s), 'Nhà cung cấp vừa được người khác sửa.');
    const { errors, value } = validateSupplier(companyId, body, s.id);
    if (hasErrors(errors)) return invalid(errors);
    const before = toSupplier(s) as unknown as Record<string, unknown>;
    Object.assign(s, value);
    s.version += 1;
    writeCompanyLog(guard.value, 'update', supplierEntity(s), before, { ...value });
    return HttpResponse.json(toSupplier(s));
  }),

  // ----- Đề nghị nhập -----

  http.get(`${API}/purchasing/requests`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireViewer(request);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    const status = url.searchParams.get('status');
    const supplierId = url.searchParams.get('supplierId');
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const items = data.requests
      .filter(
        (r) =>
          r.companyId === companyId &&
          (!status || r.status === status) &&
          (!supplierId || r.supplierId === supplierId) &&
          (!search ||
            r.number.toLowerCase().includes(search) ||
            r.note.toLowerCase().includes(search) ||
            (supplierOf(r.supplierId)?.name.toLowerCase().includes(search) ?? false)),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => toRequestSummary(r, permissions));
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.get(`${API}/purchasing/requests/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireViewer(request);
    if (!guard.ok) return guard.response;
    const found = findOwned(data.requests, params.id, guard.value.companyId, 'đề nghị nhập');
    if (!found.ok) return found.response;
    return HttpResponse.json(toRequest(found.value, guard.value.permissions));
  }),

  http.post(`${API}/purchasing/requests`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, P.purchaseRequestManage);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const body = (await request.json()) as PurchaseRequestInput;
    const { errors, lines } = buildRequestLines(companyId, body);
    checkSupplier(companyId, body.supplierId, errors);
    const source = body.sourceReturnId
      ? data.returns.find((t) => t.id === body.sourceReturnId && t.companyId === companyId)
      : null;
    if (body.sourceReturnId && (!source || source.status !== 'replaced' || source.replacementRequest)) {
      errors.sourceReturnId = 'Phiếu trả NCC không ở trạng thái bù hàng, hoặc đã có đề nghị bù';
    }
    if (hasErrors(errors)) return invalid(errors);
    const at = db.now();
    const req: MockPurchaseRequest = {
      id: rid('pr'),
      companyId,
      number: data.nextNumber(companyId, 'request'),
      status: 'draft',
      supplierId: body.supplierId,
      note: String(body.note ?? '').trim().slice(0, 500),
      lines,
      sourceReturnId: source?.id ?? null,
      createdBy: guard.value.account.id,
      createdAt: at,
      version: 1,
      statusHistory: [{ at, from: null, to: 'draft', by: byOf(guard.value), source: 'user' }],
    };
    data.requests.push(req);
    if (source) {
      source.replacementRequest = data.requestRef(req);
      source.followUps.push(data.requestRef(req));
      source.version += 1;
    }
    writeCompanyLog(guard.value, 'create', requestEntity(req), null, requestSnapshot(req));
    return HttpResponse.json(toRequest(req, permissions), { status: 201 });
  }),

  /** Gợi ý nhập lại: thêm dòng vào đề nghị nháp có sẵn hoặc lập nháp mới */
  http.post(`${API}/purchasing/requests/add-line`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, P.purchaseRequestManage);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const body = (await request.json()) as AddRequestLineInput;
    const errors: Errors = {};
    const found = findVariant(String(body.variantId ?? ''));
    if (!found || found.product.companyId !== companyId) errors.variantId = 'Sản phẩm không còn bán';
    else if (!purchasable(found.variant.businessStatus)) errors.variantId = 'SKU đã ngừng nhập';
    if (!isQty(body.quantity, 1)) errors.quantity = 'Số lượng phải từ 1';
    let req: MockPurchaseRequest | null = null;
    if (body.requestId) {
      req = data.requests.find((r) => r.id === body.requestId && r.companyId === companyId) ?? null;
      if (!req || req.status !== 'draft') errors.requestId = 'Đề nghị không còn là nháp';
    } else {
      checkSupplier(companyId, body.supplierId, errors);
    }
    if (hasErrors(errors)) return invalid(errors);
    const at = db.now();
    const variantId = found!.variant.id;
    const unitCost = stockLevelOf(companyId, variantId).avgCost;
    if (!req) {
      req = {
        id: rid('pr'),
        companyId,
        number: data.nextNumber(companyId, 'request'),
        status: 'draft',
        supplierId: body.supplierId!,
        note: 'Lập từ gợi ý nhập lại',
        lines: [],
        createdBy: guard.value.account.id,
        createdAt: at,
        version: 0,
        statusHistory: [{ at, from: null, to: 'draft', by: byOf(guard.value), source: 'user' }],
      };
      data.requests.push(req);
    }
    const before = requestSnapshot(req);
    const existing = req.lines.find((l) => l.variantId === variantId);
    if (existing) existing.quantity = Math.min(MAX_QTY, existing.quantity + body.quantity);
    else {
      req.lines.push({
        id: rid('prl'),
        variantId,
        newProduct: null,
        quantity: body.quantity,
        unitCost,
        excluded: false,
        received: 0,
        defective: 0,
        closedShort: 0,
      });
    }
    req.version += 1;
    writeCompanyLog(guard.value, req.version === 1 ? 'create' : 'update', requestEntity(req), req.version === 1 ? null : before, requestSnapshot(req));
    return HttpResponse.json(toRequest(req, permissions));
  }),

  http.put(`${API}/purchasing/requests/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, P.purchaseRequestManage);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const found = findOwned(data.requests, params.id, companyId, 'đề nghị nhập');
    if (!found.ok) return found.response;
    const req = found.value;
    const body = (await request.json()) as PurchaseRequestInput;
    if (body.version !== req.version) {
      return versionConflict(toRequest(req, permissions), 'Đề nghị vừa được người khác sửa hoặc xử lý.');
    }
    if (req.status !== 'draft' && req.status !== 'changes_requested') {
      return problem(409, 'Đề nghị không còn sửa được', {
        code: 'not_draft',
        detail: 'Chỉ sửa được đề nghị nháp hoặc bị trả về.',
      });
    }
    const { errors, lines } = buildRequestLines(companyId, body, req.lines);
    checkSupplier(companyId, body.supplierId, errors);
    if (hasErrors(errors)) return invalid(errors);
    const before = requestSnapshot(req);
    req.supplierId = body.supplierId;
    req.note = String(body.note ?? '').trim().slice(0, 500);
    req.lines = lines;
    req.version += 1;
    writeCompanyLog(guard.value, 'update', requestEntity(req), before, requestSnapshot(req));
    return HttpResponse.json(toRequest(req, permissions));
  }),

  /** CEO loại / bỏ loại dòng khi duyệt; phải còn ít nhất một dòng */
  http.post(`${API}/purchasing/requests/:id/lines/:lineId/exclude`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, P.purchaseRequestApprove);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const found = findOwned(data.requests, params.id, companyId, 'đề nghị nhập');
    if (!found.ok) return found.response;
    const req = found.value;
    const body = (await request.json()) as { excluded: boolean; version: number };
    if (body.version !== req.version) {
      return versionConflict(toRequest(req, permissions), 'Đề nghị vừa được người khác sửa hoặc xử lý.');
    }
    if (req.status !== 'pending_approval') {
      return problem(409, 'Chỉ loại dòng khi đề nghị đang chờ duyệt', { code: 'invalid_transition', current: req.status });
    }
    const target = req.lines.find((l) => l.id === params.lineId);
    if (!target) return problem(404, 'Không tìm thấy dòng', { code: 'not_found' });
    if (body.excluded && req.lines.filter((l) => !l.excluded && l.id !== target.id).length === 0) {
      return problem(409, 'Phải còn ít nhất một dòng', { code: 'all_lines_excluded' });
    }
    const before = requestSnapshot(req);
    target.excluded = !!body.excluded;
    req.version += 1;
    writeCompanyLog(guard.value, 'update', requestEntity(req), before, requestSnapshot(req));
    return HttpResponse.json(toRequest(req, permissions));
  }),

  /** Chuyển trạng thái theo lib/machines/purchasing */
  http.post(`${API}/purchasing/requests/:id/:action`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, null);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const found = findOwned(data.requests, params.id, companyId, 'đề nghị nhập');
    if (!found.ok) return found.response;
    const req = found.value;
    const action = params.action as PurchaseRequestAction;
    if (!REQUEST_ACTIONS.includes(action)) return problem(404, 'Không có thao tác này');
    const body = (await request.json()) as { version: number; reason?: string | null };
    if (body.version !== req.version) {
      return versionConflict(toRequest(req, permissions), 'Đề nghị vừa được người khác sửa hoặc xử lý.');
    }
    const reason = body.reason?.trim() || null;
    const next = checkTransition(purchaseRequestMachine, req.status, action, guard.value, requestRecord(req), reason);
    if (!next.ok) return next.response;
    if ((action === 'submit' || action === 'resubmit') && !supplierOf(req.supplierId)?.active) {
      return problem(409, 'Nhà cung cấp đã ngừng giao dịch', { code: 'supplier_inactive' });
    }
    const before = requestSnapshot(req);
    const at = db.now();
    if (action === 'close_short') {
      closeShort(req, guard.value, at, reason!);
    } else {
      if (action === 'approve') createNewProducts(req, at);
      pushStatus(req, next.value, guard.value, at, reason);
      if (action === 'order' || action === 'cancel') data.syncIncoming(companyId);
    }
    req.version += 1;
    writeCompanyLog(guard.value, 'update', requestEntity(req), before, requestSnapshot(req));
    return HttpResponse.json(toRequest(req, permissions));
  }),

  // ----- Phiếu nhận -----

  http.get(`${API}/purchasing/goods-receipts`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireViewer(request);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    const status = url.searchParams.get('status');
    const requestId = url.searchParams.get('requestId');
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const items = data.receipts
      .filter(
        (r) =>
          r.companyId === guard.value.companyId &&
          (!status || r.status === status) &&
          (!requestId || r.requestId === requestId) &&
          (!search || r.number.toLowerCase().includes(search) || requestOf(r).number.toLowerCase().includes(search)),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toReceiptSummary);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.get(`${API}/purchasing/goods-receipts/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireViewer(request);
    if (!guard.ok) return guard.response;
    const found = findOwned(data.receipts, params.id, guard.value.companyId, 'phiếu nhận');
    if (!found.ok) return found.response;
    return HttpResponse.json(toReceipt(found.value));
  }),

  /** Kho lập phiếu nhận khi hàng tới: dòng lấy từ còn chờ của đề nghị */
  http.post(`${API}/purchasing/goods-receipts`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, P.goodsReceiptManage);
    if (!guard.ok) return guard.response;
    const { companyId } = guard.value;
    const body = (await request.json()) as GoodsReceiptCreateInput;
    const req = data.requests.find((r) => r.id === body.requestId && r.companyId === companyId);
    if (!req) return invalid({ requestId: 'Chọn đề nghị nhập' });
    if (req.status !== 'ordered' && req.status !== 'partially_received') {
      return problem(409, 'Đề nghị chưa đặt NCC hoặc đã đóng', { code: 'invalid_transition', current: req.status });
    }
    const lines = req.lines.filter((l) => l.variantId && data.outstandingOf(l) > 0);
    if (!lines.length) return problem(409, 'Đề nghị không còn hàng chờ', { code: 'empty_document' });
    if (body.deliveryMode !== 'waiting' && body.deliveryMode !== 'left') {
      return invalid({ deliveryMode: 'Chọn cách giao' });
    }
    const at = db.now();
    const r: MockGoodsReceipt = {
      id: rid('gr'),
      companyId,
      number: data.nextNumber(companyId, 'receipt'),
      status: 'counting',
      requestId: req.id,
      deliveryMode: body.deliveryMode,
      note: String(body.note ?? '').trim().slice(0, 500),
      lines: lines.map((l) => ({
        lineId: l.id,
        variantId: l.variantId!,
        announced: 0,
        accepted: 0,
        defectKept: 0,
        returnedOnSpot: 0,
        reason: '',
      })),
      attachmentIds: [],
      createdBy: guard.value.account.id,
      createdAt: at,
      postedBy: null,
      postedAt: null,
      shortResolution: null,
      followUps: [],
      version: 1,
      statusHistory: [{ at, from: null, to: 'counting', by: byOf(guard.value), source: 'user' }],
    };
    data.receipts.push(r);
    writeCompanyLog(guard.value, 'create', receiptEntity(r), null, receiptSnapshot(r));
    return HttpResponse.json(toReceipt(r), { status: 201 });
  }),

  /** Lưu số kiểm đếm khi phiếu đang kiểm */
  http.put(`${API}/purchasing/goods-receipts/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, P.goodsReceiptManage);
    if (!guard.ok) return guard.response;
    const { companyId } = guard.value;
    const found = findOwned(data.receipts, params.id, companyId, 'phiếu nhận');
    if (!found.ok) return found.response;
    const r = found.value;
    const body = (await request.json()) as GoodsReceiptUpdateInput;
    if (body.version !== r.version) return versionConflict(toReceipt(r), 'Phiếu vừa được người khác sửa hoặc ghi sổ.');
    if (r.status !== 'counting') {
      return problem(409, 'Phiếu không còn sửa được', { code: 'not_draft', detail: 'Chỉ sửa được phiếu đang kiểm.' });
    }
    const errors: Errors = {};
    if (body.deliveryMode !== 'waiting' && body.deliveryMode !== 'left') errors.deliveryMode = 'Chọn cách giao';
    const input = Array.isArray(body.lines) ? body.lines : [];
    const lines = r.lines.map((l, i) => {
      const x = input.find((y) => y.lineId === l.lineId);
      if (!x) return l;
      const path = `lines.${i}`;
      for (const f of ['announced', 'accepted', 'defectKept', 'returnedOnSpot'] as const) {
        if (!isQty(x[f], 0)) errors[`${path}.${f}`] = 'Nhập số nguyên từ 0';
      }
      const next = {
        ...l,
        announced: x.announced,
        accepted: x.accepted,
        defectKept: x.defectKept,
        returnedOnSpot: x.returnedOnSpot,
        reason: String(x.reason ?? '').trim().slice(0, 300),
      };
      if (next.accepted + next.defectKept + next.returnedOnSpot > next.announced) {
        errors[`${path}.accepted`] = 'Nhận đạt, lỗi giữ, trả tại chỗ cộng lại vượt số báo giao';
      }
      if ((shortOf(next) || next.defectKept || next.returnedOnSpot) && !next.reason) {
        errors[`${path}.reason`] = 'Ghi lý do khi có thiếu, lỗi hoặc trả tại chỗ';
      }
      return next;
    });
    const ids = Array.isArray(body.attachmentIds) ? body.attachmentIds : [];
    if (ids.length > 10) errors.attachments = 'Tối đa 10 tệp';
    else if (ids.some((id) => !catalog.files.some((f) => f.id === id && f.companyId === companyId && f.url))) {
      errors.attachments = 'Có tệp chưa tải xong hoặc không thuộc công ty';
    }
    if (hasErrors(errors)) return invalid(errors);
    const before = receiptSnapshot(r);
    const prev = r.lines;
    r.lines = lines;
    const over = checkOutstanding(r);
    if (hasErrors(over)) {
      r.lines = prev;
      return invalid(over, { code: 'over_outstanding' });
    }
    r.deliveryMode = body.deliveryMode;
    r.note = String(body.note ?? '').trim().slice(0, 500);
    r.attachmentIds = ids;
    r.version += 1;
    writeCompanyLog(guard.value, 'update', receiptEntity(r), before, receiptSnapshot(r));
    return HttpResponse.json(toReceipt(r));
  }),

  /** Ghi kết quả giao thiếu: giao bù, đóng thiếu (CEO), NCC nhận sai */
  http.post(`${API}/purchasing/goods-receipts/:id/short-resolution`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, P.purchaseRequestManage);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const found = findOwned(data.receipts, params.id, companyId, 'phiếu nhận');
    if (!found.ok) return found.response;
    const r = found.value;
    const body = (await request.json()) as ShortResolutionInput;
    if (body.version !== r.version) return versionConflict(toReceipt(r), 'Phiếu vừa được người khác xử lý.');
    if (r.status !== 'short') {
      return problem(409, 'Phiếu không ở trạng thái giao thiếu', { code: 'invalid_transition', current: r.status });
    }
    if (r.shortResolution) return problem(409, 'Đã ghi kết quả', { code: 'resolution_recorded' });
    const note = String(body.note ?? '').trim().slice(0, 500);
    const req = requestOf(r);
    const at = db.now();
    let followUp: MockGoodsReceipt | null = null;
    if (body.kind === 'close_short') {
      if (!permissions.includes(P.purchaseRequestApprove)) {
        return problem(403, 'Chỉ CEO đóng thiếu đề nghị', { code: 'forbidden' });
      }
      if (!note) return invalid({ note: 'Nhập lý do đóng thiếu' }, { code: 'reason_required' });
      const next = checkTransition(purchaseRequestMachine, req.status, 'close_short', guard.value, requestRecord(req), note);
      if (!next.ok) return next.response;
    } else if (body.kind === 'follow_up') {
      const number = String(body.followUpNumber ?? '').trim().toUpperCase();
      followUp =
        data.receipts.find(
          (x) => x.number === number && x.requestId === r.requestId && x.id !== r.id && x.status !== 'cancelled',
        ) ?? null;
      if (!followUp) return invalid({ followUpNumber: 'Không có phiếu nhận này trong cùng đề nghị' }, { code: 'follow_up_invalid' });
    } else if (body.kind === 'supplier_wrong') {
      if (!note) return invalid({ note: 'Ghi NCC nhận sai thế nào' });
    } else {
      return invalid({ kind: 'Chọn kết quả' });
    }
    const before = receiptSnapshot(r);
    r.shortResolution = {
      kind: body.kind,
      followUp: followUp ? data.receiptRef(followUp) : null,
      note,
      by: guard.value.account.id,
      at,
    };
    if (body.kind === 'close_short') {
      const reqBefore = requestSnapshot(req);
      closeShort(req, guard.value, at, note);
      req.version += 1;
      writeCompanyLog(guard.value, 'update', requestEntity(req), reqBefore, requestSnapshot(req));
    }
    r.version += 1;
    writeCompanyLog(guard.value, 'update', receiptEntity(r), before, receiptSnapshot(r));
    return HttpResponse.json(toReceipt(r));
  }),

  http.post(`${API}/purchasing/goods-receipts/:id/:action`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, null);
    if (!guard.ok) return guard.response;
    const { companyId } = guard.value;
    const found = findOwned(data.receipts, params.id, companyId, 'phiếu nhận');
    if (!found.ok) return found.response;
    const r = found.value;
    const action = params.action as GoodsReceiptAction;
    if (!RECEIPT_ACTIONS.includes(action)) return problem(404, 'Không có thao tác này');
    const body = (await request.json()) as { version: number; reason?: string | null };
    if (body.version !== r.version) return versionConflict(toReceipt(r), 'Phiếu vừa được người khác sửa hoặc ghi sổ.');
    const reason = body.reason?.trim() || null;
    const next = checkTransition(goodsReceiptMachine, r.status, action, guard.value, receiptRecord(r), reason);
    if (!next.ok) return next.response;
    const at = db.now();
    const before = receiptSnapshot(r);
    if (action === 'post' || action === 'post_short') {
      if (!r.lines.some((l) => l.announced > 0)) return problem(409, 'Phiếu chưa có số báo giao', { code: 'empty_document' });
      const over = checkOutstanding(r);
      if (hasErrors(over)) return invalid(over, { code: 'over_outstanding' });
      postReceipt(r, guard.value, at);
    }
    pushStatus(r, next.value, guard.value, at, reason);
    // Đề nghị đã nhận đủ trong lần ghi sổ này: phiếu giao thiếu cũng xong luôn
    if (next.value === 'short' && requestOf(r).status === 'received') pushStatus(r, 'resolved', null, at);
    r.version += 1;
    writeCompanyLog(guard.value, 'update', receiptEntity(r), before, receiptSnapshot(r));
    return HttpResponse.json(toReceipt(r));
  }),

  // ----- Phiếu trả NCC -----

  http.get(`${API}/purchasing/supplier-returns`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireViewer(request);
    if (!guard.ok) return guard.response;
    const url = new URL(request.url);
    const { page, pageSize } = pageParams(url);
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const items = data.returns
      .filter(
        (t) =>
          t.companyId === guard.value.companyId &&
          (!status || t.status === status) &&
          (!search ||
            t.number.toLowerCase().includes(search) ||
            t.note.toLowerCase().includes(search) ||
            (t.source?.number ?? '').toLowerCase().includes(search)),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toReturnSummary);
    return HttpResponse.json(paginate(items, page, pageSize));
  }),

  http.get(`${API}/purchasing/supplier-returns/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireViewer(request);
    if (!guard.ok) return guard.response;
    const found = findOwned(data.returns, params.id, guard.value.companyId, 'phiếu trả NCC');
    if (!found.ok) return found.response;
    return HttpResponse.json(toReturn(found.value, guard.value.permissions));
  }),

  /** Lập tay phiếu trả NCC từ hàng đang ở chờ xử lý */
  http.post(`${API}/purchasing/supplier-returns`, async ({ request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, P.supplierReturnManage);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const body = (await request.json()) as SupplierReturnInput;
    const { errors, lines } = buildReturnLines(companyId, body);
    if (body.supplierId) checkSupplier(companyId, body.supplierId, errors);
    if (hasErrors(errors)) return invalid(errors);
    const at = db.now();
    const t: MockSupplierReturn = {
      id: rid('srt'),
      companyId,
      number: data.nextNumber(companyId, 'return'),
      status: 'draft',
      supplierId: body.supplierId || null,
      source: null,
      note: String(body.note ?? '').trim().slice(0, 500),
      lines,
      createdBy: guard.value.account.id,
      createdAt: at,
      sentBy: null,
      sentAt: null,
      refundAmount: null,
      replacementRequest: null,
      cancelDecision: null,
      followUps: [],
      version: 1,
      statusHistory: [{ at, from: null, to: 'draft', by: byOf(guard.value), source: 'user' }],
    };
    data.returns.push(t);
    writeCompanyLog(guard.value, 'create', returnEntity(t), null, returnSnapshot(t));
    return HttpResponse.json(toReturn(t, permissions), { status: 201 });
  }),

  http.put(`${API}/purchasing/supplier-returns/:id`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, P.supplierReturnManage);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const found = findOwned(data.returns, params.id, companyId, 'phiếu trả NCC');
    if (!found.ok) return found.response;
    const t = found.value;
    const body = (await request.json()) as SupplierReturnInput;
    if (body.version !== t.version) {
      return versionConflict(toReturn(t, permissions), 'Phiếu vừa được người khác sửa hoặc xử lý.');
    }
    if (t.status !== 'draft') {
      return problem(409, 'Phiếu không còn sửa được', { code: 'not_draft', detail: 'Chỉ sửa được phiếu nháp.' });
    }
    const { errors, lines } = buildReturnLines(companyId, body);
    if (body.supplierId) checkSupplier(companyId, body.supplierId, errors);
    if (hasErrors(errors)) return invalid(errors);
    const before = returnSnapshot(t);
    t.supplierId = body.supplierId || null;
    t.note = String(body.note ?? '').trim().slice(0, 500);
    t.lines = lines;
    t.version += 1;
    writeCompanyLog(guard.value, 'update', returnEntity(t), before, returnSnapshot(t));
    return HttpResponse.json(toReturn(t, permissions));
  }),

  http.post(`${API}/purchasing/supplier-returns/:id/:action`, async ({ params, request }) => {
    await delay(LATENCY);
    const guard = requireCompany(request, null);
    if (!guard.ok) return guard.response;
    const { companyId, permissions } = guard.value;
    const found = findOwned(data.returns, params.id, companyId, 'phiếu trả NCC');
    if (!found.ok) return found.response;
    const t = found.value;
    const action = params.action as SupplierReturnAction;
    if (!RETURN_ACTIONS.includes(action)) return problem(404, 'Không có thao tác này');
    const body = (await request.json()) as SupplierReturnActionInput;
    if (body.version !== t.version) {
      return versionConflict(toReturn(t, permissions), 'Phiếu vừa được người khác sửa hoặc xử lý.');
    }
    const reason = body.reason?.trim() || null;
    const next = checkTransition(supplierReturnMachine, t.status, action, guard.value, returnRecord(t), reason);
    if (!next.ok) return next.response;
    const at = db.now();
    const by = guard.value.account.id;
    const ref = data.returnRef(t);
    const before = returnSnapshot(t);

    if (action === 'record_refund') {
      if (typeof body.refundAmount !== 'number' || !Number.isInteger(body.refundAmount) || body.refundAmount <= 0 || body.refundAmount > MAX_COST) {
        return invalid({ refundAmount: 'Nhập số tiền NCC hoàn' }, { code: 'refund_required' });
      }
      t.refundAmount = body.refundAmount;
    }
    if (action === 'cancel') {
      if (body.cancelDecision !== 'restock' && body.cancelDecision !== 'write_off') {
        return invalid({ cancelDecision: 'Chọn cách xử lý hàng' }, { code: 'cancel_decision_required' });
      }
      t.cancelDecision = body.cancelDecision;
    }
    if (action === 'approve_send' || (action === 'cancel' && t.cancelDecision === 'restock')) {
      const errors: Errors = {};
      t.lines.forEach((l, i) => {
        const has = stockLevelOf(companyId, l.variantId).quarantine;
        if (l.quantity > has) errors[`lines.${i}.quantity`] = `Chỉ còn ${has} chờ xử lý`;
      });
      if (hasErrors(errors)) return problem(422, 'Không đủ hàng chờ xử lý', { code: 'stock_insufficient', errors });
    }

    if (action === 'approve_send') {
      // Gửi đi: chờ xử lý giảm
      for (const l of t.lines) {
        const cost = l.unitCost ?? stockLevelOf(companyId, l.variantId).avgCost;
        inventory.postMove(companyId, { docId: t.id, ref }, l.variantId, 'quarantine', -l.quantity, cost, at, by);
      }
      t.sentBy = by;
      t.sentAt = at;
    }
    if (action === 'record_rejected') {
      // NCC không nhận: hàng về lại chờ xử lý
      for (const l of t.lines) {
        const cost = l.unitCost ?? stockLevelOf(companyId, l.variantId).avgCost;
        inventory.postMove(companyId, { docId: t.id, ref }, l.variantId, 'quarantine', l.quantity, cost, at, by);
      }
    }
    if (action === 'cancel' && t.cancelDecision === 'restock') {
      for (const l of t.lines) {
        const cost = stockLevelOf(companyId, l.variantId).avgCost;
        inventory.postMove(companyId, { docId: t.id, ref }, l.variantId, 'quarantine', -l.quantity, cost, at, by);
        inventory.postMove(companyId, { docId: t.id, ref }, l.variantId, 'stock', l.quantity, cost, at, by);
      }
      rebalance(companyId, t.lines.map((l) => l.variantId));
    }
    if (action === 'cancel' && t.cancelDecision === 'write_off') {
      const writeOff = createQuarantineWriteOff(companyId, ref, t.lines, `Huỷ phiếu trả NCC ${t.number}`, at, by);
      t.followUps.push({ type: 'stock_document', id: writeOff.id, number: writeOff.number });
    }

    pushStatus(t, next.value, guard.value, at, reason);
    t.version += 1;
    writeCompanyLog(guard.value, 'update', returnEntity(t), before, returnSnapshot(t));
    return HttpResponse.json(toReturn(t, permissions));
  }),
];
