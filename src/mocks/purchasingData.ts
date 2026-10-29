/**
 * Dữ liệu giả purchasing.* theo sơ đồ Đề nghị nhập, Phiếu nhận, Phiếu trả NCC (FE#17). Chỉ dùng cho MSW.
 * Phiếu nhận đã ghi sổ và phiếu trả đã gửi trong seed đổi tồn qua inventoryData để số liệu khớp thẻ kho.
 */

import type { StatusChange } from '@/lib/stateMachine';
import type { DocRef } from '@/types/inventory';
import type {
  DeliveryMode,
  GoodsReceiptStatus,
  NewProductInput,
  PurchaseRequestStatus,
  ShortResolutionKind,
  SupplierReturnCancelDecision,
  SupplierReturnStatus,
} from '@/types/purchasing';
import { levelOf, levels, postMove, receiveStock } from './inventoryData';

export interface MockSupplier {
  id: string;
  companyId: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  note: string;
  active: boolean;
  version: number;
  createdAt: string;
}

export interface MockPurchaseRequestLine {
  id: string;
  /** null khi là sản phẩm mới chưa duyệt; duyệt xong sinh biến thể */
  variantId: string | null;
  newProduct: NewProductInput | null;
  quantity: number;
  unitCost: number;
  excluded: boolean;
  received: number;
  defective: number;
  closedShort: number;
}

export interface MockPurchaseRequest {
  id: string;
  companyId: string;
  number: string;
  status: PurchaseRequestStatus;
  supplierId: string;
  note: string;
  lines: MockPurchaseRequestLine[];
  sourceReturnId?: string | null;
  createdBy: string;
  createdAt: string;
  version: number;
  statusHistory: StatusChange<PurchaseRequestStatus>[];
}

export interface MockGoodsReceiptLine {
  lineId: string;
  variantId: string;
  announced: number;
  accepted: number;
  defectKept: number;
  returnedOnSpot: number;
  reason: string;
}

export interface MockShortResolution {
  kind: ShortResolutionKind;
  followUp: DocRef | null;
  note: string;
  by: string;
  at: string;
}

export interface MockGoodsReceipt {
  id: string;
  companyId: string;
  number: string;
  status: GoodsReceiptStatus;
  requestId: string;
  deliveryMode: DeliveryMode;
  note: string;
  lines: MockGoodsReceiptLine[];
  attachmentIds: string[];
  createdBy: string;
  createdAt: string;
  postedBy: string | null;
  postedAt: string | null;
  shortResolution: MockShortResolution | null;
  followUps: DocRef[];
  version: number;
  statusHistory: StatusChange<GoodsReceiptStatus>[];
}

export interface MockSupplierReturnLine {
  variantId: string;
  quantity: number;
  unitCost: number | null;
}

export interface MockSupplierReturn {
  id: string;
  companyId: string;
  number: string;
  status: SupplierReturnStatus;
  supplierId: string | null;
  source: DocRef | null;
  note: string;
  lines: MockSupplierReturnLine[];
  /** 'system' khi hệ thống sinh */
  createdBy: string;
  createdAt: string;
  sentBy: string | null;
  sentAt: string | null;
  refundAmount: number | null;
  replacementRequest: DocRef | null;
  cancelDecision: SupplierReturnCancelDecision | null;
  followUps: DocRef[];
  version: number;
  statusHistory: StatusChange<SupplierReturnStatus>[];
}

const CEO = { id: 'acc-001', name: 'Lê Hoàng Minh' };
const KHO = { id: 'acc-003', name: 'Ngô Văn Kho' };
const MUA = { id: 'acc-011', name: 'Trịnh Văn Mua' };

export const suppliers: MockSupplier[] = [
  {
    id: 'sup-001',
    companyId: 'cmp-001',
    name: 'Xưởng may Thành Công',
    phone: '0283 812 3456',
    email: 'donhang@thanhcong.vn',
    address: '12 Tân Kỳ Tân Quý, Tân Phú, TP.HCM',
    note: 'Áo thun, quần kaki. Giao trong 7 ngày.',
    active: true,
    version: 1,
    createdAt: '2026-09-01T02:00:00.000Z',
  },
  {
    id: 'sup-002',
    companyId: 'cmp-001',
    name: 'Công ty Da thuộc Sài Gòn',
    phone: '0283 765 4321',
    email: 'sales@dathuocsg.vn',
    address: '88 Kinh Dương Vương, Bình Tân, TP.HCM',
    note: 'Thắt lưng, ví da.',
    active: true,
    version: 1,
    createdAt: '2026-09-01T02:00:00.000Z',
  },
  {
    id: 'sup-003',
    companyId: 'cmp-001',
    name: 'Dệt may Phương Nam',
    phone: '0274 222 3333',
    email: '',
    address: 'KCN Sóng Thần, Dĩ An, Bình Dương',
    note: '',
    active: true,
    version: 1,
    createdAt: '2026-09-05T02:00:00.000Z',
  },
];

const line = (
  id: string,
  variantId: string | null,
  quantity: number,
  unitCost: number,
  rest: Partial<MockPurchaseRequestLine> = {},
): MockPurchaseRequestLine => ({
  id,
  variantId,
  newProduct: null,
  quantity,
  unitCost,
  excluded: false,
  received: 0,
  defective: 0,
  closedShort: 0,
  ...rest,
});

const step = <S extends string>(at: string, from: S | null, to: S, by: { id: string; name: string } | null, reason?: string) =>
  ({ at, from, to, by, source: by ? 'user' : 'system', ...(reason ? { reason } : {}) }) as StatusChange<S>;

export const requests: MockPurchaseRequest[] = [
  {
    id: 'pr-001',
    companyId: 'cmp-001',
    number: 'DN-000001',
    status: 'ordered',
    supplierId: 'sup-001',
    note: 'Bổ sung áo trắng L và quần XL cho đơn thiếu hàng.',
    lines: [line('prl-001', 'prd-001-v4', 20, 82000), line('prl-002', 'prd-002-v3', 6, 195000)],
    createdBy: MUA.id,
    createdAt: '2026-10-14T02:00:00.000Z',
    version: 4,
    statusHistory: [
      step('2026-10-14T02:00:00.000Z', null, 'draft', MUA),
      step('2026-10-14T02:10:00.000Z', 'draft', 'pending_approval', MUA),
      step('2026-10-14T08:00:00.000Z', 'pending_approval', 'approved', CEO),
      step('2026-10-15T01:30:00.000Z', 'approved', 'ordered', MUA),
    ],
  },
  {
    id: 'pr-002',
    companyId: 'cmp-001',
    number: 'DN-000002',
    status: 'partially_received',
    supplierId: 'sup-001',
    note: 'Nhập áo đen L, áo trắng M đầu tháng.',
    lines: [
      line('prl-003', 'prd-001-v2', 30, 80000, { received: 22, defective: 1 }),
      line('prl-004', 'prd-001-v3', 10, 80000, { received: 8, defective: 2 }),
    ],
    createdBy: MUA.id,
    createdAt: '2026-10-02T02:00:00.000Z',
    version: 5,
    statusHistory: [
      step('2026-10-02T02:00:00.000Z', null, 'draft', MUA),
      step('2026-10-02T02:20:00.000Z', 'draft', 'pending_approval', MUA),
      step('2026-10-02T07:00:00.000Z', 'pending_approval', 'approved', CEO),
      step('2026-10-03T01:00:00.000Z', 'approved', 'ordered', MUA),
      step('2026-10-08T04:00:00.000Z', 'ordered', 'partially_received', null),
    ],
  },
  {
    id: 'pr-003',
    companyId: 'cmp-001',
    number: 'DN-000003',
    status: 'pending_approval',
    supplierId: 'sup-002',
    note: 'Thắt lưng sắp hết; thử thêm ví da nam.',
    lines: [
      line('prl-005', 'prd-003-v1', 30, 205000),
      line('prl-006', null, 10, 150000, { newProduct: { name: 'Ví da nam', categoryId: 'cat-pk' } }),
    ],
    createdBy: CEO.id,
    createdAt: '2026-10-24T02:00:00.000Z',
    version: 2,
    statusHistory: [
      step('2026-10-24T02:00:00.000Z', null, 'draft', CEO),
      step('2026-10-24T02:15:00.000Z', 'draft', 'pending_approval', CEO),
    ],
  },
  {
    id: 'pr-004',
    companyId: 'cmp-001',
    number: 'DN-000004',
    status: 'draft',
    supplierId: 'sup-003',
    note: '',
    lines: [line('prl-007', 'prd-002-v1', 10, 190000)],
    createdBy: MUA.id,
    createdAt: '2026-10-26T03:00:00.000Z',
    version: 1,
    statusHistory: [step('2026-10-26T03:00:00.000Z', null, 'draft', MUA)],
  },
];

export const receipts: MockGoodsReceipt[] = [
  {
    id: 'gr-001',
    companyId: 'cmp-001',
    number: 'NH-000001',
    status: 'short',
    requestId: 'pr-002',
    deliveryMode: 'waiting',
    note: 'Xe giao chỉ chở được 30 cái áo đen.',
    lines: [
      { lineId: 'prl-003', variantId: 'prd-001-v2', announced: 30, accepted: 22, defectKept: 1, returnedOnSpot: 0, reason: 'Thiếu 7 cái so với phiếu giao' },
      { lineId: 'prl-004', variantId: 'prd-001-v3', announced: 10, accepted: 8, defectKept: 2, returnedOnSpot: 0, reason: 'Hai cái lem màu' },
    ],
    attachmentIds: [],
    createdBy: KHO.id,
    createdAt: '2026-10-08T03:00:00.000Z',
    postedBy: KHO.id,
    postedAt: '2026-10-08T04:00:00.000Z',
    shortResolution: null,
    followUps: [{ type: 'supplier_return', id: 'srt-001', number: 'TN-000001' }],
    version: 2,
    statusHistory: [
      step('2026-10-08T03:00:00.000Z', null, 'counting', KHO),
      step('2026-10-08T04:00:00.000Z', 'counting', 'short', KHO),
    ],
  },
  {
    id: 'gr-002',
    companyId: 'cmp-001',
    number: 'NH-000002',
    status: 'counting',
    requestId: 'pr-001',
    deliveryMode: 'left',
    note: 'Người giao để hàng ở cửa kho rồi đi.',
    lines: [
      { lineId: 'prl-001', variantId: 'prd-001-v4', announced: 10, accepted: 0, defectKept: 0, returnedOnSpot: 0, reason: '' },
      { lineId: 'prl-002', variantId: 'prd-002-v3', announced: 0, accepted: 0, defectKept: 0, returnedOnSpot: 0, reason: '' },
    ],
    attachmentIds: [],
    createdBy: KHO.id,
    createdAt: '2026-10-20T02:00:00.000Z',
    postedBy: null,
    postedAt: null,
    shortResolution: null,
    followUps: [],
    version: 1,
    statusHistory: [step('2026-10-20T02:00:00.000Z', null, 'counting', KHO)],
  },
];

export const returns: MockSupplierReturn[] = [
  {
    id: 'srt-001',
    companyId: 'cmp-001',
    number: 'TN-000001',
    status: 'sent',
    supplierId: 'sup-001',
    source: { type: 'goods_receipt', id: 'gr-001', number: 'NH-000001' },
    note: 'Hàng lỗi giữ lại khi nhận NH-000001',
    lines: [
      { variantId: 'prd-001-v2', quantity: 1, unitCost: 80000 },
      { variantId: 'prd-001-v3', quantity: 2, unitCost: 80000 },
    ],
    createdBy: 'system',
    createdAt: '2026-10-08T04:00:00.000Z',
    sentBy: CEO.id,
    sentAt: '2026-10-10T03:00:00.000Z',
    refundAmount: null,
    replacementRequest: null,
    cancelDecision: null,
    followUps: [],
    version: 3,
    statusHistory: [
      step('2026-10-08T04:00:00.000Z', null, 'draft', null),
      step('2026-10-09T02:00:00.000Z', 'draft', 'pending_approval', MUA),
      step('2026-10-10T03:00:00.000Z', 'pending_approval', 'sent', CEO),
    ],
  },
  {
    id: 'srt-002',
    companyId: 'cmp-001',
    number: 'TN-000002',
    status: 'draft',
    supplierId: 'sup-001',
    source: null,
    note: 'Quần kaki M bị rách đường may, đang ở chờ xử lý.',
    lines: [{ variantId: 'prd-002-v1', quantity: 2, unitCost: null }],
    createdBy: MUA.id,
    createdAt: '2026-10-22T02:00:00.000Z',
    sentBy: null,
    sentAt: null,
    refundAmount: null,
    replacementRequest: null,
    cancelDecision: null,
    followUps: [],
    version: 1,
    statusHistory: [step('2026-10-22T02:00:00.000Z', null, 'draft', MUA)],
  },
];

/** Còn chờ = đặt − nhận − lỗi giữ − đóng thiếu (dòng bị loại không chờ) */
export const outstandingOf = (l: MockPurchaseRequestLine) =>
  l.excluded ? 0 : Math.max(0, l.quantity - l.received - l.defective - l.closedShort);

const PREFIX = { request: 'DN', receipt: 'NH', return: 'TN' } as const;

export function nextNumber(companyId: string, kind: keyof typeof PREFIX) {
  const list = kind === 'request' ? requests : kind === 'receipt' ? receipts : returns;
  const count = list.filter((x) => x.companyId === companyId).length;
  return `${PREFIX[kind]}-${String(count + 1).padStart(6, '0')}`;
}

export const receiptRef = (r: MockGoodsReceipt): DocRef => ({ type: 'goods_receipt', id: r.id, number: r.number });
export const returnRef = (r: MockSupplierReturn): DocRef => ({ type: 'supplier_return', id: r.id, number: r.number });
export const requestRef = (r: MockPurchaseRequest): DocRef => ({ type: 'purchase_request', id: r.id, number: r.number });

/** Đang về của tồn kho = còn chờ của các đề nghị đã đặt, đang nhận (sơ đồ B2) */
export function syncIncoming(companyId: string) {
  for (const level of levels) if (level.companyId === companyId) level.incoming = 0;
  for (const r of requests) {
    if (r.companyId !== companyId || (r.status !== 'ordered' && r.status !== 'partially_received')) continue;
    for (const l of r.lines) if (l.variantId) levelOf(companyId, l.variantId).incoming += outstandingOf(l);
  }
}

/** Phiếu trả NCC nháp do hệ thống lập: lỗi giữ lại khi nhận, phần trả NCC của kiểm hàng về, xuất huỷ bị từ chối */
export function createSupplierReturnDraft(
  companyId: string,
  source: DocRef | null,
  supplierId: string | null,
  lines: MockSupplierReturnLine[],
  note: string,
  at: string,
): MockSupplierReturn {
  const doc: MockSupplierReturn = {
    id: `srt-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    companyId,
    number: nextNumber(companyId, 'return'),
    status: 'draft',
    supplierId,
    source,
    note,
    lines,
    createdBy: 'system',
    createdAt: at,
    sentBy: null,
    sentAt: null,
    refundAmount: null,
    replacementRequest: null,
    cancelDecision: null,
    followUps: [],
    version: 1,
    statusHistory: [step(at, null, 'draft', null)],
  };
  returns.push(doc);
  return doc;
}

// Seed: NH-000001 ghi sổ (nhận đạt về tồn, lỗi giữ vào chờ xử lý), TN-000001 gửi đi (chờ xử lý giảm)
for (const r of receipts.filter((x) => x.postedAt)) {
  const req = requests.find((x) => x.id === r.requestId)!;
  for (const l of r.lines) {
    const price = req.lines.find((x) => x.id === l.lineId)!.unitCost;
    receiveStock(r.companyId, receiptRef(r), l.variantId, l.accepted, price, r.postedAt!, r.postedBy!);
    postMove(r.companyId, { docId: r.id, ref: receiptRef(r) }, l.variantId, 'quarantine', l.defectKept, price, r.postedAt!, r.postedBy!);
  }
}
for (const t of returns.filter((x) => x.sentAt)) {
  for (const l of t.lines) {
    postMove(t.companyId, { docId: t.id, ref: returnRef(t) }, l.variantId, 'quarantine', -l.quantity, l.unitCost ?? 0, t.sentAt!, t.sentBy!);
  }
}
syncIncoming('cmp-001');
