import { z } from 'zod';
import type { StatusMeta } from '@/components/common/StatusBadge';
import type { ConfigKind, ConfigStatus, CreateFinanceConfig, FinanceConfig } from '@/types/finance';
import type { SettlementStatus } from '@/types/settlement';

export const PAYMENT_STATES: Record<SettlementStatus, StatusMeta> = {
  none: { label: 'Chưa phát sinh', variant: 'outline', hint: 'Chưa có kiện nào giao thành công nên chưa phát sinh tiền.' },
  pending: { label: 'Chờ quyết toán', variant: 'warning', hint: 'Đang chờ sàn quyết toán; số tiền hiện là số Commerio ước tính.' },
  settled: { label: 'Đã khớp', variant: 'success', hint: 'Sàn quyết toán khớp ước tính trong ngưỡng lệch.' },
  mismatch: { label: 'Lệch tiền', variant: 'destructive', hint: 'Lệch quá ngưỡng, cần chốt kèm lý do.' },
  resolved: { label: 'Đã chốt lệch', variant: 'info', hint: 'Khoản lệch đã được chốt kèm lý do.' },
};
export const CONFIG_STATES: Record<ConfigStatus, StatusMeta> = {
  draft: { label: 'Nháp', variant: 'outline' }, pending_approval: { label: 'Chờ duyệt', variant: 'warning' },
  scheduled: { label: 'Chờ hiệu lực', variant: 'info' }, active: { label: 'Đang áp dụng', variant: 'success' },
  superseded: { label: 'Hết hiệu lực', variant: 'secondary' }, rejected: { label: 'Bị từ chối', variant: 'destructive' },
  cancelled: { label: 'Đã huỷ', variant: 'secondary' },
};
export const CONFIG_KINDS: Record<ConfigKind, string> = { fee: 'Phí sàn', tax_regime: 'Loại hình thuế', tax_rules: 'Quy tắc thuế', mismatch_threshold: 'Ngưỡng lệch', min_margin: 'Biên tối thiểu' };
export const PAYLOAD_FIELDS: Record<ConfigKind, Record<string, string>> = {
  fee: { fixedPct: 'Phí cố định (%)', transactionPct: 'Phí giao dịch (%)', servicePct: 'Phí dịch vụ (%)', optionalPct: 'Phí tuỳ chọn (%)', returnFee: 'Phí hoàn hàng (đ)' },
  tax_regime: { regime: 'Loại hình thuế' }, tax_rules: { vatPct: 'Thuế GTGT sàn khấu trừ (%)', pitPct: 'Thuế TNCN sàn khấu trừ (%)', outputVatPct: 'Thuế suất GTGT đầu ra (%)', milestones: 'Mốc doanh thu (đ, cách nhau bằng dấu phẩy)' },
  mismatch_threshold: { abs: 'Ngưỡng tuyệt đối (đ)', pct: 'Ngưỡng phần trăm (%)', resolveLimit: 'Hạn mức tự chốt (đ)' }, min_margin: { pct: 'Biên tối thiểu (%)' },
};
/** Giải thích ngắn cạnh nhãn ô (HelpTip). `outputVatPct` theo Documents/21 §21.4, 25 §10.2 */
export const PAYLOAD_HINTS: Record<string, string> = {
  vatPct: 'Tỷ lệ % trên doanh thu mà sàn khấu trừ, nộp thay thuế GTGT cho hộ, cá nhân kinh doanh (Nghị định 117/2025/NĐ-CP; bán hàng hoá: 1%). Doanh nghiệp không bị sàn khấu trừ.',
  pitPct: 'Tỷ lệ % trên doanh thu mà sàn khấu trừ, nộp thay thuế TNCN cho hộ, cá nhân kinh doanh (Nghị định 117/2025/NĐ-CP; bán hàng hoá: 0,5%). Doanh nghiệp không bị sàn khấu trừ.',
  outputVatPct: 'Chỉ dùng cho doanh nghiệp nộp thuế GTGT theo phương pháp khấu trừ. Giá bán trên sàn đã gồm thuế GTGT: doanh thu chưa thuế = giá bán / (1 + thuế suất), lợi nhuận tính trên doanh thu chưa thuế. Sổ giao dịch vẫn ghi đủ giá bán.',
  resolveLimit: 'Lệch quá số này thì cần CEO duyệt trước khi chốt.',
};
export const REGIMES: Record<string, string> = { company: 'Doanh nghiệp', household: 'Hộ kinh doanh', individual: 'Cá nhân' };
/** Một giá trị trong payload để hiện: % cho trường *Pct, đồng cho số tiền, danh sách mốc, tên loại hình */
export function formatPayloadValue(key: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (key === 'regime') return REGIMES[String(value)] ?? String(value);
  const money = (n: unknown) => `${Number(n).toLocaleString('de-DE')} ₫`;
  if (Array.isArray(value)) return value.length ? value.map(money).join(', ') : 'Không có mốc';
  if (/pct$/i.test(key)) return `${String(value).replace('.', ',')}%`;
  return money(value);
}
/** Tóm tắt một dòng cho thẻ Đang áp dụng */
export function payloadSummary(kind: ConfigKind, payload: Record<string, unknown>): string {
  if (kind === 'fee') return `Tổng phí ${formatPayloadValue('pct', ['fixedPct', 'transactionPct', 'servicePct', 'optionalPct'].reduce((n, k) => n + Number(payload[k] ?? 0), 0))}, hoàn hàng ${formatPayloadValue('returnFee', payload.returnFee)}`;
  return Object.keys(PAYLOAD_FIELDS[kind]).filter((k) => k !== 'milestones').map((k) => `${PAYLOAD_FIELDS[kind][k].replace(/ \(.*\)$/, '')} ${formatPayloadValue(k, payload[k])}`).join(', ');
}
const pct = z.number('Nhập số hợp lệ').min(0, 'Từ 0 đến 100%').max(100, 'Từ 0 đến 100%').multipleOf(0.01, 'Tối đa hai chữ số thập phân');
const money = z.number('Nhập số hợp lệ').int('Nhập số nguyên đồng').nonnegative('Không được âm');
export const PAYLOAD_SCHEMAS = {
  fee: z.strictObject({ fixedPct: pct, transactionPct: pct, servicePct: pct, optionalPct: pct, returnFee: money }),
  tax_regime: z.strictObject({ regime: z.enum(['company', 'household', 'individual'], 'Chọn loại hình thuế') }),
  tax_rules: z.strictObject({ vatPct: pct, pitPct: pct, outputVatPct: pct, milestones: z.array(money).max(5, 'Tối đa 5 mốc') }),
  mismatch_threshold: z.strictObject({ abs: money, pct, resolveLimit: money }), min_margin: z.strictObject({ pct }),
};
export const reasonSchema = z.string().trim().min(1, 'Nhập lý do').max(500, 'Tối đa 500 ký tự');
export const bankRefSchema = z.string().trim().min(1, 'Nhập mã sao kê').max(100, 'Tối đa 100 ký tự');
export const todayVn = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
export const configRecord = (config: FinanceConfig) => ({ createdBy: config.createdBy?.id ?? null,
  effectiveFrom: config.effectiveFrom, today: todayVn(), hasDryRun: Boolean(config.dryRun) });
/** `correctionDate`: ngày hiệu lực của bản bị sửa, bản sửa lỗi phải trùng (Documents/21 §21.4, 422 correction_date_mismatch) */
export function validateConfig(input: CreateFinanceConfig, correctionDate?: string | null): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!z.iso.date().safeParse(input.effectiveFrom).success) errors.effectiveFrom = 'Nhập ngày hiệu lực hợp lệ';
  if (input.kind === 'fee' && !input.shopId) errors.shopId = 'Chọn gian hàng';
  if (input.isCorrection) {
    if (!input.supersedesId) errors.supersedesId = 'Chọn bản được sửa';
    if (correctionDate && input.effectiveFrom !== correctionDate) errors.effectiveFrom = 'Bản sửa lỗi phải cùng ngày hiệu lực với bản bị sửa';
    if (!input.retroactiveFrom || !z.iso.date().safeParse(input.retroactiveFrom).success) errors.retroactiveFrom = 'Nhập ngày hồi tố hợp lệ';
    else if (input.retroactiveFrom > input.effectiveFrom) errors.retroactiveFrom = 'Ngày hồi tố không sau ngày hiệu lực';
  }
  const payload = PAYLOAD_SCHEMAS[input.kind].safeParse(input.payload);
  if (!payload.success) payload.error.issues.forEach((issue) => { errors[`payload.${String(issue.path[0])}`] = issue.message; });
  return errors;
}

/** Cờ của tiền theo đơn và dòng sổ (Documents/21 §21.1, §21.2; BE#250) */
export const PAYMENT_FLAGS = {
  tax_mismatch: { label: 'Lệch thuế', variant: 'warning' },
  unknown_order: { label: 'Không rõ đơn', variant: 'warning' },
} as const satisfies Record<string, { label: string; variant: 'warning' }>;
