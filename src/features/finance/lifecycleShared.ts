import { z } from 'zod';
import type { StatusMeta } from '@/components/common/StatusBadge';
import type { ConfigKind, ConfigStatus, CreateFinanceConfig, FinanceConfig } from '@/types/finance';
import type { SettlementStatus } from '@/types/settlement';

export const PAYMENT_STATES: Record<SettlementStatus, StatusMeta> = {
  none: { label: 'Chưa phát sinh', variant: 'outline' }, pending: { label: 'Chờ quyết toán', variant: 'warning' },
  settled: { label: 'Đã khớp', variant: 'success' }, mismatch: { label: 'Lệch tiền', variant: 'destructive' },
  resolved: { label: 'Đã chốt lệch', variant: 'info' },
};
export const CONFIG_STATES: Record<ConfigStatus, StatusMeta> = {
  draft: { label: 'Nháp', variant: 'outline' }, pending_approval: { label: 'Chờ duyệt', variant: 'warning' },
  scheduled: { label: 'Chờ hiệu lực', variant: 'info' }, active: { label: 'Đang áp dụng', variant: 'success' },
  expired: { label: 'Hết hiệu lực', variant: 'secondary' }, rejected: { label: 'Bị từ chối', variant: 'destructive' },
  cancelled: { label: 'Đã huỷ', variant: 'secondary' },
};
export const CONFIG_KINDS: Record<ConfigKind, string> = { fee: 'Phí sàn', tax_regime: 'Loại hình thuế', tax_rules: 'Quy tắc thuế', mismatch_threshold: 'Ngưỡng lệch', min_margin: 'Biên tối thiểu' };
export const PAYLOAD_FIELDS: Record<ConfigKind, Record<string, string>> = {
  fee: { fixedPct: 'Phí cố định (%)', transactionPct: 'Phí giao dịch (%)', servicePct: 'Phí dịch vụ (%)', optionalPct: 'Phí tuỳ chọn (%)', returnFee: 'Phí hoàn hàng (đ)' },
  tax_regime: { regime: 'Loại hình thuế' }, tax_rules: { vatPct: 'Thuế GTGT (%)', pitPct: 'Thuế TNCN (%)', milestones: 'Mốc doanh thu (đ, cách nhau bằng dấu phẩy)' },
  mismatch_threshold: { abs: 'Ngưỡng tuyệt đối (đ)', pct: 'Ngưỡng phần trăm (%)', resolveLimit: 'Hạn mức tự chốt (đ)' }, min_margin: { pct: 'Biên tối thiểu (%)' },
};
const pct = z.number('Nhập số hợp lệ').min(0, 'Từ 0 đến 100%').max(100, 'Từ 0 đến 100%').multipleOf(0.01, 'Tối đa hai chữ số thập phân');
const money = z.number('Nhập số hợp lệ').int('Nhập số nguyên đồng').nonnegative('Không được âm');
export const PAYLOAD_SCHEMAS = {
  fee: z.strictObject({ fixedPct: pct, transactionPct: pct, servicePct: pct, optionalPct: pct, returnFee: money }),
  tax_regime: z.strictObject({ regime: z.enum(['company', 'household', 'individual'], 'Chọn loại hình thuế') }),
  tax_rules: z.strictObject({ vatPct: pct, pitPct: pct, milestones: z.array(money).max(5, 'Tối đa 5 mốc') }),
  mismatch_threshold: z.strictObject({ abs: money, pct, resolveLimit: money }), min_margin: z.strictObject({ pct }),
};
export const reasonSchema = z.string().trim().min(1, 'Nhập lý do').max(500, 'Tối đa 500 ký tự');
export const bankRefSchema = z.string().trim().min(1, 'Nhập mã sao kê').max(100, 'Tối đa 100 ký tự');
export const todayVn = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
export const configRecord = (config: FinanceConfig) => ({ createdBy: config.createdBy?.id ?? null,
  effectiveFrom: config.effectiveFrom, today: todayVn(), hasDryRun: Boolean(config.dryRun) });
export function validateConfig(input: CreateFinanceConfig): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!z.iso.date().safeParse(input.effectiveFrom).success) errors.effectiveFrom = 'Nhập ngày hiệu lực hợp lệ';
  if (input.kind === 'fee' && !input.shopId) errors.shopId = 'Chọn gian hàng';
  if (input.isCorrection) {
    if (!input.supersedesId) errors.supersedesId = 'Chọn bản được sửa';
    if (!input.retroactiveFrom || !z.iso.date().safeParse(input.retroactiveFrom).success) errors.retroactiveFrom = 'Nhập ngày hồi tố hợp lệ';
    else if (input.retroactiveFrom > input.effectiveFrom) errors.retroactiveFrom = 'Ngày hồi tố không sau ngày hiệu lực';
  }
  const payload = PAYLOAD_SCHEMAS[input.kind].safeParse(input.payload);
  if (!payload.success) payload.error.issues.forEach((issue) => { errors[`payload.${String(issue.path[0])}`] = issue.message; });
  return errors;
}
