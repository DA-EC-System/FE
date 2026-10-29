import type { LedgerKind, LedgerLine } from '@/types/finance';

export const LEDGER_KIND_LABELS: Record<LedgerKind, string> = {
  revenue: 'Doanh thu',
  subsidy: 'Sàn trợ giá',
  fee_fixed: 'Phí cố định',
  fee_txn: 'Phí giao dịch',
  fee_optional: 'Phí tuỳ chọn',
  tax_withheld: 'Thuế khấu trừ',
  return_fee: 'Phí khi hoàn',
  compensation: 'Bồi thường',
  refund: 'Hoàn tiền khách',
  penalty: 'Phạt',
  ads: 'Quảng cáo',
  withdrawal: 'Rút về ngân hàng',
  supplier_refund: 'NCC hoàn tiền',
  adjustment: 'Điều chỉnh',
  cogs: 'Giá vốn',
};

/** Mốc doanh thu năm cần cảnh báo; cảnh báo từ 90% mốc */
export const TAX_MILESTONES = [500_000_000, 3_000_000_000];
export const TAX_WARN_RATIO = 0.9;

const sum = (lines: Pick<LedgerLine, 'amount'>[]) => lines.reduce((s, l) => s + l.amount, 0);

/** Dòng là tiền thật đi qua đơn: bỏ giá vốn, rút tiền, quảng cáo */
const isOrderCash = (kind: LedgerKind) => kind !== 'cogs' && kind !== 'withdrawal' && kind !== 'ads';

export interface LedgerSummary {
  net: number;
  ads: number;
  cogs: number;
  gross: number;
  /** Lãi đóng góp: lãi gộp sau quảng cáo */
  contribution: number;
  estimated: boolean;
  taxMismatch: number | null;
}

/** Tiền của một đơn từ các dòng sổ của đơn; dòng đã thay không tính */
export function summarizeLedger(lines: LedgerLine[]): LedgerSummary {
  const live = lines.filter((l) => !l.replaced);
  const net = sum(live.filter((l) => isOrderCash(l.kind)));
  const ads = sum(live.filter((l) => l.kind === 'ads'));
  const cogs = sum(live.filter((l) => l.kind === 'cogs'));
  const gross = net + cogs;
  return {
    net,
    ads,
    cogs,
    gross,
    contribution: gross + ads,
    estimated: live.some((l) => l.estimated && l.kind !== 'cogs'),
    taxMismatch: taxMismatch(lines),
  };
}

/** Lệch thuế: thuế khấu trừ theo quyết toán khác thuế đã ước tính */
export function taxMismatch(lines: LedgerLine[]): number | null {
  const tax = lines.filter((l) => l.kind === 'tax_withheld');
  const estimated = tax.filter((l) => l.estimated && l.replaced);
  const actual = tax.filter((l) => !l.estimated && !l.replaced);
  if (!estimated.length || !actual.length) return null;
  const diff = sum(actual) - sum(estimated);
  return diff === 0 ? null : diff;
}

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
