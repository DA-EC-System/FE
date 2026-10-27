/**
 * Dữ liệu giả đối soát tiền sàn cho MSW: bảng kê và dòng đối soát (UC-PF-10, FE#13).
 * Nối với đơn sàn ở salesData và phiếu thu `source=settlement` ở financeData (PT-000005 ↔ stl-line-0001).
 * Số đếm, `feeTotal`, `orderTotal`, phiếu thu tính lúc đọc ở handlers như BE. Dữ liệu giả.
 */

import type { DiscrepancyReason, MatchStatus, SettlementFees, SettlementLineKind } from '@/types/settlement';

export interface MockStatement {
  id: string;
  companyId: string;
  shopId: string;
  externalStatementId: string;
  statementTime: string;
  paymentStatus: string;
  createdAt: string;
}

export interface MockSettlementLine {
  id: string;
  companyId: string;
  statementId: string;
  kind: SettlementLineKind;
  externalTransactionId: string;
  externalOrderId: string | null;
  orderId: string | null;
  revenue: number;
  fees: SettlementFees;
  shippingCost: number;
  adjustment: number;
  settlement: number;
  matchStatus: MatchStatus;
  discrepancyReason: DiscrepancyReason | null;
  createdAt: string;
}

const NO_FEES: SettlementFees = {
  commission: 0,
  transactionFee: 0,
  infrastructureFee: 0,
  affiliate: 0,
  campaign: 0,
  tax: 0,
  other: 0,
};

export const statements: MockStatement[] = [
  {
    id: 'stm-0002',
    companyId: 'cmp-001',
    shopId: 'shp-002',
    externalStatementId: '7395018264001',
    statementTime: '2026-10-18T03:00:00.000Z',
    paymentStatus: 'PROCESSING',
    createdAt: '2026-10-18T03:05:00.000Z',
  },
  {
    id: 'stm-0001',
    companyId: 'cmp-001',
    shopId: 'shp-001',
    externalStatementId: '2026101400001',
    statementTime: '2026-10-14T03:00:00.000Z',
    paymentStatus: 'PAID',
    createdAt: '2026-10-14T03:05:00.000Z',
  },
  {
    id: 'stm-0003',
    companyId: 'cmp-001',
    shopId: 'shp-008',
    externalStatementId: '7395018263777',
    statementTime: '2026-10-10T03:00:00.000Z',
    paymentStatus: 'FAILED',
    createdAt: '2026-10-10T03:05:00.000Z',
  },
];

type LineSeed = Omit<MockSettlementLine, 'companyId' | 'fees' | 'createdAt' | 'externalOrderId' | 'orderId'> & {
  fees?: Partial<SettlementFees>;
  externalOrderId?: string | null;
  orderId?: string | null;
};

const line = (seed: LineSeed, createdAt: string): MockSettlementLine => ({
  companyId: 'cmp-001',
  externalOrderId: null,
  orderId: null,
  ...seed,
  fees: { ...NO_FEES, ...seed.fees },
  createdAt,
});

const PAID_AT = '2026-10-14T03:05:00.000Z';
const PROCESSING_AT = '2026-10-18T03:05:00.000Z';
const FAILED_AT = '2026-10-10T03:05:00.000Z';

export const settlementLines: MockSettlementLine[] = [
  // Bảng kê PAID của Shopee: đủ khớp, ba lý do chênh lệch, sàn đã hoàn
  line(
    {
      // Sàn trợ giá 20.000 ₫ bù phí, tiền về đúng bằng tổng đơn; phiếu thu PT-000005
      id: 'stl-line-0001',
      statementId: 'stm-0001',
      kind: 'order',
      externalTransactionId: 'TX-260014-0001',
      externalOrderId: '2610140000012',
      orderId: 'ord-1012',
      revenue: 330000,
      fees: { commission: 15000, transactionFee: 5000 },
      shippingCost: 0,
      adjustment: 20000,
      settlement: 330000,
      matchStatus: 'matched',
      discrepancyReason: null,
    },
    PAID_AT,
  ),
  line(
    {
      id: 'stl-line-0002',
      statementId: 'stm-0001',
      kind: 'order',
      externalTransactionId: 'TX-260014-0002',
      externalOrderId: '2610149999999',
      revenue: 250000,
      fees: { commission: 12500, transactionFee: 5000, tax: 2500 },
      shippingCost: 0,
      adjustment: 0,
      settlement: 230000,
      matchStatus: 'discrepancy',
      discrepancyReason: 'order_not_found',
    },
    PAID_AT,
  ),
  line(
    {
      // Sàn ghi doanh thu 170.000 ₫, đơn trong hệ thống 180.000 ₫
      id: 'stl-line-0003',
      statementId: 'stm-0001',
      kind: 'order',
      externalTransactionId: 'TX-260014-0003',
      externalOrderId: '2610140000002',
      orderId: 'ord-1002',
      revenue: 170000,
      fees: { commission: 8500, transactionFee: 1500 },
      shippingCost: 0,
      adjustment: 0,
      settlement: 160000,
      matchStatus: 'discrepancy',
      discrepancyReason: 'revenue_mismatch',
    },
    PAID_AT,
  ),
  line(
    {
      // Giữ lại 30.000 ₫ nhưng tiền về ghi -25.000 ₫: lệch 5.000 ₫
      id: 'stl-line-0004',
      statementId: 'stm-0001',
      kind: 'reserve',
      externalTransactionId: 'TX-260014-0004',
      revenue: 0,
      shippingCost: 0,
      adjustment: -30000,
      settlement: -25000,
      matchStatus: 'discrepancy',
      discrepancyReason: 'formula_mismatch',
    },
    PAID_AT,
  ),
  line(
    {
      // Đơn giao thất bại: sàn hoàn phí 5.000 ₫, trừ 20.000 ₫ vận chuyển chiều về
      id: 'stl-line-0005',
      statementId: 'stm-0001',
      kind: 'order',
      externalTransactionId: 'TX-260014-0005',
      externalOrderId: '2610140000002',
      orderId: 'ord-1002',
      revenue: 0,
      fees: { commission: -5000 },
      shippingCost: 20000,
      adjustment: 0,
      settlement: -15000,
      matchStatus: 'refund_tagged',
      discrepancyReason: null,
    },
    PAID_AT,
  ),
  // Bảng kê PROCESSING của TikTok Shop: khớp nhưng sàn chưa trả nên chờ phiếu thu
  line(
    {
      id: 'stl-line-0006',
      statementId: 'stm-0002',
      kind: 'order',
      externalTransactionId: '7395018264001-01',
      externalOrderId: '579000000001005',
      orderId: 'ord-1005',
      revenue: 598000,
      fees: { commission: 29900, transactionFee: 11960, infrastructureFee: 3000, affiliate: 5980, tax: 2990 },
      shippingCost: 15000,
      adjustment: 0,
      settlement: 529170,
      matchStatus: 'matched',
      discrepancyReason: null,
    },
    PROCESSING_AT,
  ),
  line(
    {
      id: 'stl-line-0007',
      statementId: 'stm-0002',
      kind: 'order',
      externalTransactionId: '7395018264001-02',
      externalOrderId: '579000000001015',
      orderId: 'ord-1015',
      revenue: 360000,
      fees: { commission: 18000, transactionFee: 7200, infrastructureFee: 3000, campaign: 3600 },
      shippingCost: 15000,
      adjustment: 0,
      settlement: 313200,
      matchStatus: 'matched',
      discrepancyReason: null,
    },
    PROCESSING_AT,
  ),
  line(
    {
      // Sàn bù phí vận chuyển của tháng trước
      id: 'stl-line-0008',
      statementId: 'stm-0002',
      kind: 'adjustment',
      externalTransactionId: '7395018264001-03',
      revenue: 0,
      shippingCost: 0,
      adjustment: 12000,
      settlement: 12000,
      matchStatus: 'matched',
      discrepancyReason: null,
    },
    PROCESSING_AT,
  ),
  // Bảng kê FAILED của gian hàng outlet
  line(
    {
      id: 'stl-line-0009',
      statementId: 'stm-0003',
      kind: 'order',
      externalTransactionId: '7395018263777-01',
      externalOrderId: '579000000000777',
      revenue: 199000,
      fees: { commission: 9950, transactionFee: 3980, other: 1000 },
      shippingCost: 0,
      adjustment: 0,
      settlement: 184070,
      matchStatus: 'discrepancy',
      discrepancyReason: 'order_not_found',
    },
    FAILED_AT,
  ),
];
