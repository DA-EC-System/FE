/**
 * Dữ liệu giả inventory.* theo ERD. Chỉ dùng cho MSW.
 * stock_levels và stock_moves dựng từ các phiếu đã ghi sổ trong seed để số liệu khớp nhau.
 * Đơn giao không thành công là dữ liệu tạm cho UC-IN-03 tới khi có phân hệ Bán hàng.
 */

import type { StockDocKind, StockDocStatus, StockDocType } from '@/types/inventory';

export interface MockStockLevel {
  companyId: string;
  variantId: string;
  onHand: number;
  reserved: number;
  avgCost: number;
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
  quantity: number;
  unitCost: number | null;
}

export interface MockStockDoc {
  id: string;
  companyId: string;
  number: string;
  type: StockDocType;
  kind: StockDocKind;
  status: StockDocStatus;
  note: string;
  /** sales.orders.id cho phiếu xuất theo đơn và phiếu nhập hoàn */
  orderId: string | null;
  reference: string | null;
  lines: MockStockDocLine[];
  createdBy: string;
  createdAt: string;
  postedBy: string | null;
  postedAt: string | null;
  version: number;
}

export interface MockStockMove {
  id: string;
  companyId: string;
  variantId: string;
  qtyChange: number;
  onHandAfter: number;
  docId: string;
  unitCost: number;
  doneAt: string;
  doneBy: string;
}

export interface MockReturnOrder {
  orderId: string;
  companyId: string;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  shipmentCode: string;
  failedReason: string;
  failedAt: string;
  lines: { variantId: string; quantity: number }[];
}

const KHO = 'acc-003';

export const docs: MockStockDoc[] = [
  {
    id: 'sd-001',
    companyId: 'cmp-001',
    number: 'PN-000001',
    type: 'receipt',
    kind: 'manual',
    status: 'done',
    note: 'Tồn đầu kỳ',
    orderId: null,
    reference: null,
    lines: [
      { variantId: 'prd-001-v1', quantity: 40, unitCost: 80000 },
      { variantId: 'prd-001-v2', quantity: 40, unitCost: 80000 },
      { variantId: 'prd-001-v3', quantity: 30, unitCost: 80000 },
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
  },
  {
    // Lô thứ hai giá nhập khác: giá vốn bình quân của prd-001-v1 thành 84.000 đ
    id: 'sd-002',
    companyId: 'cmp-001',
    number: 'PN-000002',
    type: 'receipt',
    kind: 'manual',
    status: 'done',
    note: 'Nhập bổ sung áo thun trắng',
    orderId: null,
    reference: null,
    lines: [{ variantId: 'prd-001-v1', quantity: 20, unitCost: 92000 }],
    createdBy: KHO,
    createdAt: '2026-10-05T03:00:00.000Z',
    postedBy: KHO,
    postedAt: '2026-10-05T03:10:00.000Z',
    version: 2,
  },
  {
    id: 'sd-003',
    companyId: 'cmp-001',
    number: 'PX-000001',
    type: 'issue',
    kind: 'order',
    status: 'done',
    note: '',
    orderId: 'ord-1001',
    reference: 'DH-1001',
    lines: [
      { variantId: 'prd-001-v1', quantity: 2, unitCost: null },
      { variantId: 'prd-002-v3', quantity: 3, unitCost: null },
    ],
    createdBy: KHO,
    createdAt: '2026-10-08T07:00:00.000Z',
    postedBy: KHO,
    postedAt: '2026-10-08T07:00:00.000Z',
    version: 1,
  },
  {
    id: 'sd-004',
    companyId: 'cmp-001',
    number: 'PX-000002',
    type: 'issue',
    kind: 'order',
    status: 'done',
    note: '',
    orderId: 'ord-1002',
    reference: 'DH-1002',
    lines: [{ variantId: 'prd-003-v1', quantity: 1, unitCost: null }],
    createdBy: KHO,
    createdAt: '2026-10-09T07:00:00.000Z',
    postedBy: KHO,
    postedAt: '2026-10-09T07:00:00.000Z',
    version: 1,
  },
  {
    id: 'sd-005',
    companyId: 'cmp-001',
    number: 'PN-000003',
    type: 'receipt',
    kind: 'manual',
    status: 'draft',
    note: 'Hàng mẫu nhà cung cấp gửi',
    orderId: null,
    reference: null,
    lines: [{ variantId: 'prd-002-v2', quantity: 5, unitCost: 185000 }],
    createdBy: KHO,
    createdAt: '2026-10-14T02:00:00.000Z',
    postedBy: null,
    postedAt: null,
    version: 1,
  },
  {
    id: 'sd-101',
    companyId: 'cmp-002',
    number: 'PN-000001',
    type: 'receipt',
    kind: 'manual',
    status: 'done',
    note: 'Tồn đầu kỳ',
    orderId: null,
    reference: null,
    lines: [
      { variantId: 'prd-101-v1', quantity: 100, unitCost: 120000 },
      { variantId: 'prd-101-v2', quantity: 50, unitCost: 230000 },
    ],
    createdBy: KHO,
    createdAt: '2026-10-01T02:00:00.000Z',
    postedBy: KHO,
    postedAt: '2026-10-01T02:30:00.000Z',
    version: 2,
  },
];

export const levels: MockStockLevel[] = [];
export const moves: MockStockMove[] = [];

/** Ghi sổ như BE: phiếu nhập tính lại giá vốn bình quân (QT-15), phiếu xuất lấy giá vốn hiện tại */
export function applyDoc(doc: MockStockDoc, at: string, by: string) {
  for (const line of doc.lines) {
    let level = levels.find((l) => l.companyId === doc.companyId && l.variantId === line.variantId);
    if (!level) {
      level = { companyId: doc.companyId, variantId: line.variantId, onHand: 0, reserved: 0, avgCost: 0 };
      levels.push(level);
    }
    if (doc.type === 'receipt') {
      // Nhập hoàn trả hàng về theo giá vốn hiện tại nên không đổi bình quân
      const cost = doc.kind === 'delivery_return' ? level.avgCost : line.unitCost ?? level.avgCost;
      const total = level.onHand + line.quantity;
      level.avgCost = total > 0 ? Math.round((level.onHand * level.avgCost + line.quantity * cost) / total) : cost;
      level.onHand = total;
      line.unitCost = cost;
    } else {
      level.onHand -= line.quantity;
      line.unitCost = level.avgCost;
    }
    moves.push({
      id: `mv-${moves.length + 1}`,
      companyId: doc.companyId,
      variantId: line.variantId,
      qtyChange: doc.type === 'receipt' ? line.quantity : -line.quantity,
      onHandAfter: level.onHand,
      docId: doc.id,
      unitCost: line.unitCost ?? 0,
      doneAt: at,
      doneBy: by,
    });
  }
}

docs
  .filter((d) => d.status === 'done')
  .sort((a, b) => (a.postedAt ?? '').localeCompare(b.postedAt ?? ''))
  .forEach((d) => applyDoc(d, d.postedAt ?? d.createdAt, d.postedBy ?? d.createdBy));

// Hàng đang giữ cho các đơn đã xác nhận chưa xuất kho (QT-14, D8)
const RESERVED: Record<string, number> = {
  'prd-001-v1': 5,
  'prd-001-v4': 6,
  'prd-002-v1': 3,
  'prd-002-v3': 2,
  'prd-003-v1': 4,
};
for (const level of levels) level.reserved = RESERVED[level.variantId] ?? 0;

export const reorderRules: MockReorderRule[] = [
  // prd-001-v4: khả dụng 4 < 5 → dưới ngưỡng
  { companyId: 'cmp-001', variantId: 'prd-001-v4', minQty: 5, version: 1, updatedAt: '2026-10-02T03:00:00.000Z' },
  // prd-002-v3: khả dụng 1 < 3 → dưới ngưỡng
  { companyId: 'cmp-001', variantId: 'prd-002-v3', minQty: 3, version: 1, updatedAt: '2026-10-02T03:00:00.000Z' },
  { companyId: 'cmp-001', variantId: 'prd-001-v1', minQty: 10, version: 2, updatedAt: '2026-10-03T03:00:00.000Z' },
  { companyId: 'cmp-002', variantId: 'prd-101-v1', minQty: 20, version: 1, updatedAt: '2026-10-02T03:00:00.000Z' },
];

export const returnOrders: MockReturnOrder[] = [
  {
    orderId: 'ord-1001',
    companyId: 'cmp-001',
    orderCode: 'DH-1001',
    customerName: 'Nguyễn Văn An',
    customerPhone: '0901234567',
    shipmentCode: 'GHN-88001',
    failedReason: 'Khách từ chối nhận hàng',
    failedAt: '2026-10-12T09:00:00.000Z',
    lines: [
      { variantId: 'prd-001-v1', quantity: 2 },
      { variantId: 'prd-002-v3', quantity: 3 },
    ],
  },
  {
    orderId: 'ord-1002',
    companyId: 'cmp-001',
    orderCode: 'DH-1002',
    customerName: 'Phạm Thị Bình',
    customerPhone: '0912345678',
    shipmentCode: 'GHTK-55102',
    failedReason: 'Không liên lạc được người nhận',
    failedAt: '2026-10-13T10:30:00.000Z',
    lines: [{ variantId: 'prd-003-v1', quantity: 1 }],
  },
  {
    orderId: 'ord-2001',
    companyId: 'cmp-002',
    orderCode: 'DH-2001',
    customerName: 'Lý Văn Cường',
    customerPhone: '0987654321',
    shipmentCode: 'GHN-90001',
    failedReason: 'Sai địa chỉ',
    failedAt: '2026-10-12T09:00:00.000Z',
    lines: [{ variantId: 'prd-101-v1', quantity: 2 }],
  },
];
