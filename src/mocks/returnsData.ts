/**
 * Dữ liệu mẫu yêu cầu trả hàng (sơ đồ D3, FE#60). Logic ở handlers/returns.ts.
 */

import type { ReturnCloseResult, ReturnSource, ReturnStatus, UnmatchedStatus } from '@/types/returns';
import { isOpenReturn } from '@/lib/machines/returns';
import type { MockStatusChange } from './salesData';

export interface MockReturnLine {
  variantId: string;
  quantity: number;
  packageId: string;
  unitPrice: number;
  /** Giá vốn bình quân lúc lập yêu cầu: giá vốn giảm theo phần bán lại */
  unitCost: number;
}

/** Một bước của đơn ngược phía sàn (Lazada reverse_status, ofc_status) */
export interface MockPlatformStep {
  at: string;
  reverseStatus: string;
  ofcStatus: string | null;
  note: string | null;
}

export interface MockReturnRequest {
  id: string;
  companyId: string;
  code: string;
  orderId: string;
  source: ReturnSource;
  status: ReturnStatus;
  closeResult: ReturnCloseResult | null;
  reason: string;
  rawMarketplaceStatus: string | null;
  returnTrackingCode: string | null;
  lines: MockReturnLine[];
  /** Phiếu kiểm hàng về lập khi nhận hàng */
  inspectionId: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
  /** Số bán lại được, ghi khi kiểm hàng về ghi sổ */
  resellQty: number | null;
  history: MockStatusChange<ReturnStatus>[];
  /** Lý do từ chối theo danh sách của sàn và ảnh kèm (§20.1) */
  rejectReasonId: string | null;
  attachmentIds: string[];
  /** Lịch sử phía sàn, cũ trước; rỗng với yêu cầu tạo tay */
  platformSteps: MockPlatformStep[];
  disputeInProgress: boolean;
  createdAt: string;
  createdBy: string | null;
  version: number;
}

export interface MockUnmatchedParcel {
  id: string;
  companyId: string;
  code: string;
  note: string;
  status: UnmatchedStatus;
  receivedAt: string;
  receivedBy: string;
  returnRequestId: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolution: string | null;
  version: number;
}

const SALE = 'acc-002';

export const requests: MockReturnRequest[] = [
  {
    id: 'rr-001',
    companyId: 'cmp-001',
    code: 'YCT-000001',
    orderId: 'ord-1020',
    source: 'manual',
    status: 'requested',
    closeResult: null,
    reason: 'Khách nhắn hộp thư: áo bị sờn chỉ ở cổ',
    rawMarketplaceStatus: null,
    returnTrackingCode: null,
    lines: [{ variantId: 'prd-003-v1', quantity: 1, packageId: 'pkg-1020', unitPrice: 180000, unitCost: 210000 }],
    inspectionId: null,
    receivedAt: null,
    receivedBy: null,
    resellQty: null,
    history: [{ from: null, to: 'requested', at: '2026-10-15T03:00:00.000Z', by: SALE }],
    rejectReasonId: null,
    attachmentIds: [],
    platformSteps: [],
    disputeInProgress: false,
    createdAt: '2026-10-15T03:00:00.000Z',
    createdBy: SALE,
    version: 1,
  },
  {
    id: 'rr-002',
    companyId: 'cmp-001',
    code: 'YCT-000002',
    orderId: 'ord-1019',
    source: 'manual',
    status: 'awaiting_return',
    closeResult: null,
    reason: 'Không vừa, khách đổi ý',
    rawMarketplaceStatus: null,
    returnTrackingCode: null,
    lines: [{ variantId: 'prd-002-v2', quantity: 1, packageId: 'pkg-1019', unitPrice: 320000, unitCost: 190000 }],
    inspectionId: null,
    receivedAt: null,
    receivedBy: null,
    resellQty: null,
    history: [
      { from: null, to: 'requested', at: '2026-10-14T02:00:00.000Z', by: SALE },
      { from: 'requested', to: 'awaiting_return', at: '2026-10-14T04:00:00.000Z', by: SALE },
    ],
    rejectReasonId: null,
    attachmentIds: [],
    platformSteps: [],
    disputeInProgress: false,
    createdAt: '2026-10-14T02:00:00.000Z',
    createdBy: SALE,
    version: 2,
  },
];

export const unmatchedParcels: MockUnmatchedParcel[] = [];

export const returnCounters: Record<string, number> = { 'cmp-001': 2 };

export function nextReturnCode(companyId: string) {
  returnCounters[companyId] = (returnCounters[companyId] ?? 0) + 1;
  return `YCT-${String(returnCounters[companyId]).padStart(6, '0')}`;
}

/** Yêu cầu còn mở của đơn: chặn hoàn tất, đơn mang cờ Có yêu cầu trả */
export const openRequestsOf = (orderId: string) =>
  requests.filter((r) => r.orderId === orderId && isOpenReturn(r.status)).length;
