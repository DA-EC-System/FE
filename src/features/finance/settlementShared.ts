import { formatCurrency } from '@/utils/format';
import { PLATFORM_LABELS } from '@/features/channel/shopSchemas';
import type { Marketplace } from '@/types/shop';
import type { BadgeVariant } from '@/features/sales/shared';
import type {
  DiscrepancyReason,
  MatchStatus,
  SettlementFees,
  SettlementLine,
  SettlementLineKind,
  SettlementShop,
} from '@/types/settlement';

type Labelled = { label: string; variant: BadgeVariant };

// ---------- Nhãn (AC-C2) ----------

export const MATCH_STATUS: Record<MatchStatus, Labelled> = {
  matched: { label: 'Khớp', variant: 'success' },
  discrepancy: { label: 'Chênh lệch', variant: 'warning' },
  refund_tagged: { label: 'Sàn đã hoàn', variant: 'info' },
};

export const DISCREPANCY_REASON_LABELS: Record<DiscrepancyReason, string> = {
  order_not_found: 'Không tìm thấy đơn',
  revenue_mismatch: 'Lệch doanh thu',
  formula_mismatch: 'Sai công thức',
};

export const LINE_KIND_LABELS: Record<SettlementLineKind, string> = {
  order: 'Đơn hàng',
  adjustment: 'Điều chỉnh',
  reserve: 'Giữ lại',
};

const PAYMENT_STATUS: Record<string, Labelled> = {
  PAID: { label: 'Đã trả', variant: 'success' },
  PROCESSING: { label: 'Đang xử lý', variant: 'info' },
  FAILED: { label: 'Thất bại', variant: 'destructive' },
};

/** Trạng thái trả giữ nguyên chữ của sàn; chữ lạ hiện nguyên văn */
export const paymentStatusOf = (status: string): Labelled =>
  PAYMENT_STATUS[status] ?? { label: status, variant: 'secondary' };

export const PAYMENT_STATUS_OPTIONS = Object.entries(PAYMENT_STATUS).map(([value, l]) => ({ value, label: l.label }));

export const FEE_LABELS: Record<keyof SettlementFees, string> = {
  commission: 'Hoa hồng',
  transactionFee: 'Phí giao dịch',
  infrastructureFee: 'Phí hạ tầng',
  affiliate: 'Tiếp thị liên kết',
  campaign: 'Chiến dịch',
  tax: 'Thuế',
  other: 'Khác',
};

export const FEE_KEYS = Object.keys(FEE_LABELS) as (keyof SettlementFees)[];

/** Gian hàng kèm sàn; gian hàng đã xoá khỏi kênh thì `shopName` là `null` */
export function shopText(shop: SettlementShop): string {
  if (shop.shopName === null) return 'Gian hàng đã xoá';
  const platform = shop.platform ? (PLATFORM_LABELS[shop.platform as Marketplace] ?? shop.platform) : null;
  return platform ? `${shop.shopName} (${platform})` : shop.shopName;
}

// ---------- Phép kiểm của một dòng (AC-S2) ----------

export interface FormulaCheck {
  /** `Doanh thu − Phí − Vận chuyển + Điều chỉnh` */
  expected: number;
  holds: boolean;
  /** Dòng chữ của phép kiểm */
  text: string;
  /** "Lệch … ₫" khi công thức sai */
  gap: string | null;
  /** "Doanh thu sàn … ₫, tổng đơn … ₫, lệch … ₫" khi lệch doanh thu */
  revenueGap: string | null;
}

type CheckInput = Pick<
  SettlementLine,
  'revenue' | 'feeTotal' | 'shippingCost' | 'adjustment' | 'settlement' | 'orderTotal' | 'discrepancyReason'
>;

/** Phép kiểm như `formulaHolds` của BE, đúng đến đồng */
export function formulaCheck(line: CheckInput): FormulaCheck {
  const expected = line.revenue - line.feeTotal - line.shippingCost + line.adjustment;
  const holds = expected === line.settlement;
  const text =
    `${formatCurrency(line.revenue)} − ${formatCurrency(line.feeTotal)} − ${formatCurrency(line.shippingCost)} ` +
    `+ ${formatCurrency(line.adjustment)} = ${formatCurrency(expected)}`;
  const revenueGap =
    line.discrepancyReason === 'revenue_mismatch' && line.orderTotal !== null
      ? `Doanh thu sàn ${formatCurrency(line.revenue)}, tổng đơn ${formatCurrency(line.orderTotal)}, ` +
        `lệch ${formatCurrency(Math.abs(line.revenue - line.orderTotal))}`
      : null;
  return {
    expected,
    holds,
    text,
    gap: holds ? null : `Lệch ${formatCurrency(Math.abs(line.settlement - expected))}`,
    revenueGap,
  };
}
