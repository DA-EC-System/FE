/**
 * Dữ liệu giả lô nhặt hàng cho MSW (FE#10, đề xuất ở commerio-backend#25).
 * Đơn trong lô nằm ở salesData; lô chỉ giữ danh sách id đơn.
 */

import type { BatchStatus } from '@/types/fulfillment';

export interface MockBatch {
  id: string;
  companyId: string;
  code: string;
  status: BatchStatus;
  orderIds: string[];
  createdAt: string;
  createdBy: string;
  version: number;
}

const KHO = 'acc-003';

export const batches: MockBatch[] = [
  {
    id: 'bat-001',
    companyId: 'cmp-001',
    code: 'LO-000001',
    status: 'picking',
    orderIds: ['ord-1010', 'ord-1011', 'ord-1012'],
    createdAt: '2026-10-18T01:00:00.000Z',
    createdBy: KHO,
    version: 1,
  },
  {
    id: 'bat-002',
    companyId: 'cmp-001',
    code: 'LO-000002',
    status: 'packed',
    orderIds: ['ord-1014', 'ord-1015'],
    createdAt: '2026-10-17T02:00:00.000Z',
    createdBy: KHO,
    version: 2,
  },
  {
    id: 'bat-003',
    companyId: 'cmp-001',
    code: 'LO-000003',
    status: 'done',
    orderIds: ['ord-1016', 'ord-1017'],
    createdAt: '2026-10-14T01:00:00.000Z',
    createdBy: KHO,
    version: 3,
  },
];

/** Bộ đếm mã lô theo công ty (LO-000001) */
export const batchCounters: Record<string, number> = { 'cmp-001': 3 };

export function nextBatchCode(companyId: string) {
  const n = (batchCounters[companyId] ?? 0) + 1;
  batchCounters[companyId] = n;
  return `LO-${String(n).padStart(6, '0')}`;
}
