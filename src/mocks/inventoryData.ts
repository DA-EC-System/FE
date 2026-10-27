/**
 * Dữ liệu giả inventory.* theo ERD và sơ đồ Tồn kho, Phiếu kho (FE#56). Chỉ dùng cho MSW.
 * stock_levels và stock_moves dựng từ các phiếu đã ghi sổ trong seed để số liệu khớp nhau.
 */

import type { StatusChange } from '@/lib/stateMachine';
import type { DocRef, RejectDecision, StockArea, StockDocKind, StockDocStatus, StockDocType } from '@/types/inventory';
import type { StockNumbers } from './engine/stock';
import { reviveOnArrival } from './catalogData';

export interface MockStockLevel extends StockNumbers {
  companyId: string;
  variantId: string;
  avgCost: number;
  /** Hàng các kiện Thiếu hàng cần; kiện (FE#59) sẽ tính thay số này */
  backordered: number;
  /** Số trên sàn khác khả dụng sau lần đẩy gần nhất */
  drift: boolean;
}

export interface MockReorderRule {
  companyId: string;
  variantId: string;
  minQty: number;
  version: number;
  updatedAt: string;
}

export interface MockStockDocLine {
  variantId: string;
  /** Xem StockDocLine.quantity */
  quantity: number;
  unitCost: number | null;
  bookQty?: number;
  counted?: number;
  expected?: number;
  resell?: number;
  damaged?: number;
  toSupplier?: number;
  locked?: number;
}

export interface MockStockDoc {
  id: string;
  companyId: string;
  number: string;
  type: StockDocType;
  kind: StockDocKind;
  status: StockDocStatus;
  area: StockArea | null;
  note: string;
  /** sales.orders.id cho phiếu xuất theo đơn và kiểm hàng về của đơn */
  orderId: string | null;
  source: DocRef | null;
  claimFlag: boolean;
  lines: MockStockDocLine[];
  /** 'system' khi hệ thống sinh */
  createdBy: string;
  /** Kiểm hàng về: người lưu số quét gần nhất (người thứ hai phải khác người này) */
  scannedBy?: string | null;
  createdAt: string;
  postedBy: string | null;
  postedAt: string | null;
  version: number;
  statusHistory: StatusChange<StockDocStatus>[];
  followUps: DocRef[];
  rejectDecision: RejectDecision | null;
}

export interface MockStockMove {
  id: string;
  companyId: string;
  variantId: string;
  area: StockArea;
  qtyChange: number;
  onHandAfter: number;
  docId: string;
  /** Chứng từ ngoài phiếu kho (phiếu nhận, phiếu trả NCC; FE#17) */
  ref?: DocRef;
  unitCost: number;
  doneAt: string;
  doneBy: string;
}

const KHO = 'acc-003';
const KHO_REF = { id: KHO, name: 'Lê Văn Kho' };

/** Phiếu đã ghi sổ trong seed: lịch sử một bước */
const postedHistory = (at: string, by = KHO_REF): StatusChange<StockDocStatus>[] => [
  { at, from: null, to: 'posted', by, source: 'user' },
];

const base = {
  area: null,
  orderId: null,
  source: null,
  claimFlag: false,
  followUps: [],
  rejectDecision: null,
} satisfies Partial<MockStockDoc>;

export const docs: MockStockDoc[] = [
  {
    ...base,
    id: 'sd-001',
    companyId: 'cmp-001',
    number: 'PN-000001',
    type: 'receipt',
    kind: 'manual',
    status: 'posted',
    note: 'Tồn đầu kỳ',
    lines: [
      { variantId: 'prd-001-v1', quantity: 40, unitCost: 80000 },
      { variantId: 'prd-001-v2', quantity: 18, unitCost: 80000 },
      { variantId: 'prd-001-v3', quantity: 22, unitCost: 80000 },
      { variantId: 'prd-001-v4', quantity: 10, unitCost: 80000 },
      { variantId: 'prd-002-v1', quantity: 25, unitCost: 190000 },
      { variantId: 'prd-002-v2', quantity: 20, unitCost: 190000 },
      { variantId: 'prd-002-v3', quantity: 6, unitCost: 190000 },
      { variantId: 'prd-003-v1', quantity: 15, unitCost: 210000 },
    ],
    createdBy: KHO,
    createdAt: '2026-10-01T02:00:00.000Z',
    postedBy: KHO,
    postedAt: '2026-10-01T02:30:00.000Z',
    version: 2,
    statusHistory: postedHistory('2026-10-01T02:30:00.000Z'),
  },
  {
    // Lô thứ hai giá nhập khác: giá vốn bình quân của prd-001-v1 thành 84.000 đ
    ...base,
    id: 'sd-002',
    companyId: 'cmp-001',
    number: 'PN-000002',
    type: 'receipt',
    kind: 'purchase',
    status: 'posted',
    note: 'Nhập bổ sung áo thun trắng',
    lines: [{ variantId: 'prd-001-v1', quantity: 20, unitCost: 92000 }],
    createdBy: KHO,
    createdAt: '2026-10-05T03:00:00.000Z',
    postedBy: KHO,
    postedAt: '2026-10-05T03:10:00.000Z',
    version: 2,
    statusHistory: postedHistory('2026-10-05T03:10:00.000Z'),
  },
  {
    ...base,
    id: 'sd-003',
    companyId: 'cmp-001',
    number: 'PX-000001',
    type: 'issue',
    kind: 'order',
    status: 'posted',
    note: '',
    orderId: 'ord-1001',
    source: { type: 'order', id: 'ord-1001', number: 'DH-1001' },
    lines: [
      { variantId: 'prd-001-v1', quantity: 2, unitCost: null },
      { variantId: 'prd-002-v3', quantity: 3, unitCost: null },
    ],
    createdBy: KHO,
    createdAt: '2026-10-08T07:00:00.000Z',
    postedBy: KHO,
    postedAt: '2026-10-08T07:00:00.000Z',
    version: 1,
    statusHistory: postedHistory('2026-10-08T07:00:00.000Z'),
  },
  {
    ...base,
    id: 'sd-004',
    companyId: 'cmp-001',
    number: 'PX-000002',
    type: 'issue',
    kind: 'order',
    status: 'posted',
    note: '',
    orderId: 'ord-1002',
    source: { type: 'order', id: 'ord-1002', number: 'DH-1002' },
    lines: [{ variantId: 'prd-003-v1', quantity: 1, unitCost: null }],
    createdBy: KHO,
    createdAt: '2026-10-09T07:00:00.000Z',
    postedBy: KHO,
    postedAt: '2026-10-09T07:00:00.000Z',
    version: 1,
    statusHistory: postedHistory('2026-10-09T07:00:00.000Z'),
  },
  {
    // Hàng lỗi phát hiện trên kệ: chuyển chờ xử lý, đã ghi sổ
    ...base,
    id: 'sd-005',
    companyId: 'cmp-001',
    number: 'CXL-000001',
    type: 'to_quarantine',
    kind: 'manual',
    status: 'posted',
    note: 'Quần jean bung chỉ, phát hiện khi soạn kệ',
    lines: [{ variantId: 'prd-002-v1', quantity: 2, unitCost: null }],
    createdBy: KHO,
    createdAt: '2026-10-10T02:00:00.000Z',
    postedBy: 'acc-001',
    postedAt: '2026-10-10T04:00:00.000Z',
    version: 3,
    statusHistory: [
      { at: '2026-10-10T02:05:00.000Z', from: 'draft', to: 'pending', by: KHO_REF, source: 'user' },
      {
        at: '2026-10-10T04:00:00.000Z',
        from: 'pending',
        to: 'posted',
        by: { id: 'acc-001', name: 'Nguyễn Minh CEO' },
        source: 'user',
      },
    ],
  },
  {
    // Xuất huỷ đang chờ CEO duyệt: 2 áo đang tạm khoá
    ...base,
    id: 'sd-006',
    companyId: 'cmp-001',
    number: 'XH-000001',
    type: 'write_off',
    kind: 'manual',
    status: 'pending',
    area: 'stock',
    note: 'Áo rách khi kiểm kệ, không sửa được',
    lines: [{ variantId: 'prd-001-v3', quantity: 2, unitCost: null, locked: 2 }],
    createdBy: KHO,
    createdAt: '2026-10-15T02:00:00.000Z',
    postedBy: null,
    postedAt: null,
    version: 2,
    statusHistory: [{ at: '2026-10-15T02:10:00.000Z', from: 'draft', to: 'pending', by: KHO_REF, source: 'user' }],
  },
  {
    ...base,
    id: 'sd-007',
    companyId: 'cmp-001',
    number: 'KK-000001',
    type: 'stocktake',
    kind: 'manual',
    status: 'draft',
    area: 'stock',
    note: 'Kiểm kê kệ quần jean cuối tuần',
    lines: [{ variantId: 'prd-002-v2', quantity: -2, counted: 18, bookQty: 20, unitCost: null }],
    createdBy: KHO,
    createdAt: '2026-10-16T02:00:00.000Z',
    postedBy: null,
    postedAt: null,
    version: 1,
    statusHistory: [],
  },
  {
    // Kiện của DH-1001 hoàn về kho: hệ thống sinh phiếu kiểm hàng về
    ...base,
    id: 'sd-008',
    companyId: 'cmp-001',
    number: 'KHV-000001',
    type: 'return_inspection',
    kind: 'auto',
    status: 'draft',
    note: 'Khách từ chối nhận hàng',
    orderId: 'ord-1001',
    source: { type: 'order', id: 'ord-1001', number: 'DH-1001' },
    lines: [
      { variantId: 'prd-001-v1', quantity: 0, expected: 2, resell: 0, damaged: 0, toSupplier: 0, unitCost: null },
      { variantId: 'prd-002-v3', quantity: 0, expected: 3, resell: 0, damaged: 0, toSupplier: 0, unitCost: null },
    ],
    createdBy: 'system',
    createdAt: '2026-10-12T09:00:00.000Z',
    postedBy: null,
    postedAt: null,
    version: 1,
    statusHistory: [{ at: '2026-10-12T09:00:00.000Z', from: null, to: 'draft', by: null, source: 'marketplace' }],
  },
  {
    ...base,
    id: 'sd-009',
    companyId: 'cmp-001',
    number: 'KHV-000002',
    type: 'return_inspection',
    kind: 'auto',
    status: 'draft',
    note: 'Không liên lạc được người nhận',
    orderId: 'ord-1002',
    source: { type: 'order', id: 'ord-1002', number: 'DH-1002' },
    lines: [{ variantId: 'prd-003-v1', quantity: 0, expected: 1, resell: 0, damaged: 0, toSupplier: 0, unitCost: null }],
    createdBy: 'system',
    createdAt: '2026-10-13T10:30:00.000Z',
    postedBy: null,
    postedAt: null,
    version: 1,
    statusHistory: [{ at: '2026-10-13T10:30:00.000Z', from: null, to: 'draft', by: null, source: 'marketplace' }],
  },
  {
    ...base,
    id: 'sd-101',
    companyId: 'cmp-002',
    number: 'PN-000001',
    type: 'receipt',
    kind: 'manual',
    status: 'posted',
    note: 'Tồn đầu kỳ',
    lines: [
      { variantId: 'prd-101-v1', quantity: 100, unitCost: 120000 },
      { variantId: 'prd-101-v2', quantity: 50, unitCost: 230000 },
    ],
    createdBy: KHO,
    createdAt: '2026-10-01T02:00:00.000Z',
    postedBy: KHO,
    postedAt: '2026-10-01T02:30:00.000Z',
    version: 2,
    statusHistory: postedHistory('2026-10-01T02:30:00.000Z'),
  },
  {
    ...base,
    id: 'sd-102',
    companyId: 'cmp-002',
    number: 'KHV-000001',
    type: 'return_inspection',
    kind: 'auto',
    status: 'draft',
    note: 'Sai địa chỉ',
    orderId: 'ord-2001',
    source: { type: 'order', id: 'ord-2001', number: 'DH-2001' },
    lines: [{ variantId: 'prd-101-v1', quantity: 0, expected: 2, resell: 0, damaged: 0, toSupplier: 0, unitCost: null }],
    createdBy: 'system',
    createdAt: '2026-10-12T09:00:00.000Z',
    postedBy: null,
    postedAt: null,
    version: 1,
    statusHistory: [{ at: '2026-10-12T09:00:00.000Z', from: null, to: 'draft', by: null, source: 'marketplace' }],
  },
];

export const levels: MockStockLevel[] = [];
export const moves: MockStockMove[] = [];

export function levelOf(companyId: string, variantId: string): MockStockLevel {
  let level = levels.find((l) => l.companyId === companyId && l.variantId === variantId);
  if (!level) {
    level = {
      companyId,
      variantId,
      onHand: 0,
      reserved: 0,
      locked: 0,
      quarantine: 0,
      incoming: 0,
      avgCost: 0,
      backordered: 0,
      drift: false,
    };
    levels.push(level);
  }
  return level;
}

/** Đổi số một khu vực và ghi thẻ kho; ref khi chứng từ không phải phiếu kho */
export function postMove(
  companyId: string,
  source: { docId: string; ref?: DocRef },
  variantId: string,
  area: StockArea,
  qtyChange: number,
  unitCost: number,
  at: string,
  by: string,
) {
  if (!qtyChange) return;
  if (qtyChange > 0) reviveOnArrival(variantId);
  const level = levelOf(companyId, variantId);
  if (area === 'stock') level.onHand += qtyChange;
  else level.quarantine += qtyChange;
  moves.push({
    id: `mv-${moves.length + 1}`,
    companyId,
    variantId,
    area,
    qtyChange,
    onHandAfter: area === 'stock' ? level.onHand : level.quarantine,
    ...source,
    unitCost,
    doneAt: at,
    doneBy: by,
  });
}

function move(doc: MockStockDoc, variantId: string, area: StockArea, qtyChange: number, unitCost: number, at: string, by: string) {
  postMove(doc.companyId, { docId: doc.id }, variantId, area, qtyChange, unitCost, at, by);
}

/** Nhận hàng mua về tồn thực: tính lại giá vốn bình quân theo giá nhập (QT-15) */
export function receiveStock(companyId: string, ref: DocRef, variantId: string, qty: number, price: number, at: string, by: string) {
  const level = levelOf(companyId, variantId);
  const total = level.onHand + qty;
  level.avgCost = total > 0 ? Math.round((level.onHand * level.avgCost + qty * price) / total) : price;
  postMove(companyId, { docId: ref.id, ref }, variantId, 'stock', qty, price, at, by);
}

/** Gỡ tạm khoá của phiếu giảm (khi ghi sổ hoặc từ chối) */
export function unlockDoc(doc: MockStockDoc) {
  for (const line of doc.lines) {
    if (!line.locked) continue;
    const level = levelOf(doc.companyId, line.variantId);
    level.locked = Math.max(0, level.locked - line.locked);
    line.locked = 0;
  }
}

/**
 * Ghi sổ như BE (Template Method): đổi tồn trong một giao dịch, ghi thẻ kho gắn chứng từ gốc.
 * Nhập có giá tính lại giá vốn bình quân (QT-15); xuất lấy giá vốn hiện tại.
 */
export function applyDoc(doc: MockStockDoc, at: string, by: string) {
  unlockDoc(doc);
  for (const line of doc.lines) {
    const level = levelOf(doc.companyId, line.variantId);
    const cost = level.avgCost;
    switch (doc.type) {
      case 'receipt': {
        const price = line.unitCost ?? cost;
        const total = level.onHand + line.quantity;
        level.avgCost = total > 0 ? Math.round((level.onHand * cost + line.quantity * price) / total) : price;
        line.unitCost = price;
        move(doc, line.variantId, 'stock', line.quantity, price, at, by);
        break;
      }
      case 'issue':
      case 'write_off':
        line.unitCost = cost;
        move(doc, line.variantId, doc.area ?? 'stock', -line.quantity, cost, at, by);
        break;
      case 'to_quarantine':
        line.unitCost = cost;
        move(doc, line.variantId, 'stock', -line.quantity, cost, at, by);
        move(doc, line.variantId, 'quarantine', line.quantity, cost, at, by);
        break;
      case 'stocktake':
        // Δ tính lúc đếm; tồn có thể đã đổi sau đó, kiểm kê CEO duyệt vẫn ghi sổ (cờ Tồn âm)
        line.unitCost = cost;
        move(doc, line.variantId, doc.area ?? 'stock', line.quantity, cost, at, by);
        break;
      case 'return_inspection':
        // Bán lại về tồn thực theo giá vốn hiện tại; hỏng và trả NCC vào chờ xử lý
        line.unitCost = cost;
        move(doc, line.variantId, 'stock', line.resell ?? 0, cost, at, by);
        move(doc, line.variantId, 'quarantine', (line.damaged ?? 0) + (line.toSupplier ?? 0), cost, at, by);
        break;
    }
  }
}

/** Từ chối xuất huỷ hàng chờ xử lý, kho chọn nhập lại: chờ xử lý → tồn thực, thẻ kho gắn chính phiếu bị từ chối */
export function restockFromQuarantine(doc: MockStockDoc, at: string, by: string) {
  for (const line of doc.lines) {
    const cost = levelOf(doc.companyId, line.variantId).avgCost;
    move(doc, line.variantId, 'quarantine', -line.quantity, cost, at, by);
    move(doc, line.variantId, 'stock', line.quantity, cost, at, by);
  }
}

docs
  .filter((d) => d.status === 'posted')
  .sort((a, b) => (a.postedAt ?? '').localeCompare(b.postedAt ?? ''))
  .forEach((d) => applyDoc(d, d.postedAt ?? d.createdAt, d.postedBy ?? d.createdBy));

// Phiếu giảm đang chờ duyệt giữ tạm khoá
for (const d of docs.filter((x) => x.status === 'pending')) {
  for (const l of d.lines) levelOf(d.companyId, l.variantId).locked += l.locked ?? 0;
}

// Hàng đang giữ cho các đơn đã xác nhận chưa xuất kho (QT-14, D8)
const RESERVED: Record<string, number> = {
  'prd-001-v1': 5,
  'prd-001-v4': 6,
  'prd-002-v1': 3,
  'prd-002-v3': 2,
  'prd-003-v1': 4,
};
// Hàng kiện Thiếu hàng cần (FE#59 tính từ kiện); đang về do purchasingData tính từ đề nghị nhập
const BACKORDERED: Record<string, number> = { 'prd-001-v4': 8 };
for (const level of levels) {
  level.reserved = RESERVED[level.variantId] ?? 0;
  level.backordered = BACKORDERED[level.variantId] ?? 0;
}
// Lần đẩy gần nhất sàn trả số khác
levelOf('cmp-001', 'prd-003-v1').drift = true;

export const reorderRules: MockReorderRule[] = [
  // prd-001-v4: khả dụng 4 + đang về 20 − thiếu 4 = 20 > 5 → không gợi ý nhập dù sắp hết
  { companyId: 'cmp-001', variantId: 'prd-001-v4', minQty: 5, version: 1, updatedAt: '2026-10-02T03:00:00.000Z' },
  // prd-002-v3: khả dụng 1 + đang về 6 = 7 > 3 → sắp hết, đã có hàng về
  { companyId: 'cmp-001', variantId: 'prd-002-v3', minQty: 3, version: 1, updatedAt: '2026-10-02T03:00:00.000Z' },
  { companyId: 'cmp-001', variantId: 'prd-001-v1', minQty: 10, version: 2, updatedAt: '2026-10-03T03:00:00.000Z' },
  // prd-003-v1: khả dụng 10 ≤ 12, không có hàng về → gợi ý nhập lại
  { companyId: 'cmp-001', variantId: 'prd-003-v1', minQty: 12, version: 1, updatedAt: '2026-10-03T03:00:00.000Z' },
  { companyId: 'cmp-002', variantId: 'prd-101-v1', minQty: 20, version: 1, updatedAt: '2026-10-02T03:00:00.000Z' },
];
