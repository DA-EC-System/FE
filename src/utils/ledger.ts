import type { LedgerKind, LedgerLine } from '@/types/finance';

/** Tên khoản theo enum `kind` của sổ (Documents/21 §21.1), dùng chung cho sổ tiền và đối soát */
export const LEDGER_KIND_LABELS: Record<LedgerKind, string> = {
  revenue: 'Doanh thu',
  platform_subsidy: 'Sàn trợ giá',
  shipping_income: 'Phí ship thu khách',
  shipping_cost: 'Phí vận chuyển',
  fee_fixed: 'Phí cố định',
  fee_transaction: 'Phí giao dịch',
  fee_service: 'Phí dịch vụ',
  fee_optional: 'Phí tuỳ chọn',
  withholding_tax: 'Thuế sàn khấu trừ',
  customer_refund: 'Hoàn tiền khách',
  return_fee: 'Phí hoàn hàng',
  lost_compensation: 'Bồi thường mất hàng',
  penalty: 'Phạt',
  cogs: 'Giá vốn',
  cogs_reversal: 'Hoàn giá vốn',
  ads: 'Quảng cáo',
  opex: 'Chi phí vận hành',
  supplier_payment: 'Trả nhà cung cấp',
  supplier_refund: 'Nhà cung cấp hoàn tiền',
  cod_collected: 'Thu COD',
  withdrawal: 'Rút về ngân hàng',
  adjustment: 'Điều chỉnh',
};

/** Giá vốn và hoàn giá vốn: không phải tiền mặt, chỉ người có `inventory.cost.view` thấy (§21.0) */
export const isCostKind = (kind: LedgerKind) => kind === 'cogs' || kind === 'cogs_reversal';

/** Dòng đã bị dòng thực tế thay: giữ để đối chiếu, không tính vào tổng */
export const isReplaced = (line: Pick<LedgerLine, 'replacedBy'>) => line.replacedBy !== null;

/** Mốc doanh thu năm cần cảnh báo; cảnh báo từ 90% mốc */
export const TAX_MILESTONES = [500_000_000, 3_000_000_000];
export const TAX_WARN_RATIO = 0.9;

/** Cảnh báo doanh thu luỹ kế năm theo mốc */
export function taxWarnings(ytdRevenue: number) {
  return TAX_MILESTONES.filter((m) => ytdRevenue >= m * TAX_WARN_RATIO).map((milestone) => ({
    milestone,
    ytdRevenue,
    over: ytdRevenue >= milestone,
  }));
}

/** 500.000.000 → "500 triệu", 3.000.000.000 → "3 tỷ" */
export function formatMilestone(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString('vi-VN')} tỷ`;
  return `${(value / 1_000_000).toLocaleString('vi-VN')} triệu`;
}

/** Biên lãi gộp: 12.5 → "12,5%"; null → "—" */
export function formatMargin(value: number | null): string {
  return value === null ? '—' : `${value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
}
