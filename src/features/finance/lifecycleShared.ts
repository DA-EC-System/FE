import { z } from 'zod';
import type { StatusMeta } from '@/components/common/StatusBadge';
import type { ConfigKind, ConfigStatus, CreateFinanceConfig, FinanceConfig } from '@/types/finance';
import type { SettlementStatus } from '@/types/settlement';

export const PAYMENT_STATES: Record<SettlementStatus, StatusMeta> = {
  none: { label: 'Chưa phát sinh', variant: 'outline', hint: 'Chưa có kiện nào giao thành công nên chưa phát sinh khoản phải thu.' },
  pending: { label: 'Chờ sàn thanh toán', variant: 'warning', hint: 'Đã phát sinh phải thu, sàn chưa thanh toán. Số tiền hiện là số phải thu theo sổ.' },
  settled: { label: 'Đã đối soát khớp', variant: 'success', hint: 'Sàn đã thanh toán, khớp phải thu trong ngưỡng chênh lệch cho phép.' },
  mismatch: { label: 'Chênh lệch', variant: 'destructive', hint: 'Chênh lệch vượt ngưỡng cho phép, cần xử lý kèm lý do.' },
  resolved: { label: 'Đã xử lý chênh lệch', variant: 'info', hint: 'Chênh lệch đã được xử lý kèm lý do.' },
};
export const CONFIG_STATES: Record<ConfigStatus, StatusMeta> = {
  draft: { label: 'Nháp', variant: 'outline' }, pending_approval: { label: 'Chờ duyệt', variant: 'warning' },
  scheduled: { label: 'Chưa có hiệu lực', variant: 'info' }, active: { label: 'Đang áp dụng', variant: 'success' },
  superseded: { label: 'Đã thay thế', variant: 'secondary' }, rejected: { label: 'Đã từ chối', variant: 'destructive' },
  cancelled: { label: 'Đã huỷ', variant: 'secondary' },
};
export const CONFIG_KINDS: Record<ConfigKind, string> = { fee: 'Phí sàn', tax_regime: 'Loại hình kinh doanh', tax_rules: 'Biểu thuế', mismatch_threshold: 'Ngưỡng chênh lệch đối soát', min_margin: 'Lãi tối thiểu trên giá vốn' };
export const PAYLOAD_FIELDS: Record<ConfigKind, Record<string, string>> = {
  fee: { fixedPct: 'Phí hoa hồng (%)', transactionPct: 'Phí thanh toán (%)', servicePct: 'Phí dịch vụ (%)', optionalPct: 'Phí tham gia chương trình (%)', returnFee: 'Phí khi hàng hoàn (đ/kiện)' },
  tax_regime: { regime: 'Loại hình kinh doanh' }, tax_rules: { vatPct: 'Thuế GTGT sàn khấu trừ (%)', pitPct: 'Thuế TNCN sàn khấu trừ (%)', outputVatPct: 'Thuế suất GTGT đầu ra (%)', milestones: 'Ngưỡng doanh thu năm (đ)' },
  mismatch_threshold: { abs: 'Chênh lệch tối đa (đ)', pct: 'Chênh lệch tối đa (%)', resolveLimit: 'Hạn mức tự xử lý chênh lệch (đ)' }, min_margin: { pct: 'Lãi tối thiểu trên giá vốn (%)' },
};
/** Giải thích ngắn cạnh nhãn ô (HelpTip). `outputVatPct` theo Documents/21 §21.4, 25 §10.2 */
export const PAYLOAD_HINTS: Record<string, string> = {
  vatPct: 'Tỷ lệ % trên doanh thu mà sàn khấu trừ, nộp thay thuế GTGT cho hộ, cá nhân kinh doanh (Nghị định 117/2025/NĐ-CP; bán hàng hoá: 1%). Doanh nghiệp không bị sàn khấu trừ.',
  pitPct: 'Tỷ lệ % trên doanh thu mà sàn khấu trừ, nộp thay thuế TNCN cho hộ, cá nhân kinh doanh (Nghị định 117/2025/NĐ-CP; bán hàng hoá: 0,5%). Doanh nghiệp không bị sàn khấu trừ.',
  outputVatPct: 'Chỉ dùng cho doanh nghiệp nộp thuế GTGT theo phương pháp khấu trừ. Giá bán trên sàn đã gồm thuế GTGT: doanh thu chưa thuế = giá bán / (1 + thuế suất), lợi nhuận tính trên doanh thu chưa thuế. Sổ giao dịch vẫn ghi đủ giá bán.',
  resolveLimit: 'Chênh lệch vượt số này thì cần CEO duyệt trước khi xử lý.',
  milestones: 'Doanh thu luỹ kế trong năm vượt ngưỡng thì đổi cách tính thuế. Nhiều ngưỡng thì cách nhau bằng dấu phẩy, vd 500000000, 3000000000.',
  regime: 'Hộ, cá nhân kinh doanh: sàn khấu trừ, nộp thay thuế GTGT và TNCN theo tỷ lệ % trên doanh thu. Doanh nghiệp: sàn không khấu trừ, doanh nghiệp tự kê khai thuế GTGT.',
  fixedPct: 'Lazada ghi Phí cố định, TikTok Shop ghi Phí hoa hồng nền tảng. Hạch toán vào chi phí bán hàng.',
  transactionPct: 'Lazada ghi Phí thanh toán, TikTok Shop ghi Phí giao dịch. Hạch toán vào chi phí bán hàng.',
  servicePct: 'Các phí dịch vụ khác trên sao kê của sàn (vd phí hạ tầng, phí xử lý đơn). Hạch toán vào chi phí bán hàng.',
  optionalPct: 'Phí các chương trình gian hàng tham gia (vd Freeship Extra, Voucher Xtra, hoa hồng tiếp thị liên kết). Hạch toán vào chi phí bán hàng.',
  returnFee: 'Phí sàn thu cho mỗi kiện hàng hoàn về; khác với khoản hoàn trả giá trị sản phẩm cho người mua.',
};
export const REGIMES: Record<string, string> = { company: 'Doanh nghiệp', household: 'Hộ kinh doanh', individual: 'Cá nhân kinh doanh' };
/** Một giá trị trong payload để hiện: % cho trường *Pct, đồng cho số tiền, danh sách mốc, tên loại hình */
export function formatPayloadValue(key: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (key === 'regime') return REGIMES[String(value)] ?? String(value);
  const money = (n: unknown) => `${Number(n).toLocaleString('de-DE')} ₫`;
  if (Array.isArray(value)) return value.length ? value.map(money).join(', ') : 'Không có ngưỡng';
  if (/pct$/i.test(key)) return `${String(value).replace('.', ',')}%`;
  return money(value);
}
/** Tóm tắt một dòng cho thẻ Đang áp dụng */
export function payloadSummary(kind: ConfigKind, payload: Record<string, unknown>): string {
  if (kind === 'fee') return `Tổng phí sàn ${formatPayloadValue('pct', ['fixedPct', 'transactionPct', 'servicePct', 'optionalPct'].reduce((n, k) => n + Number(payload[k] ?? 0), 0))}, phí khi hàng hoàn ${formatPayloadValue('returnFee', payload.returnFee)}/kiện`;
  return Object.keys(PAYLOAD_FIELDS[kind]).filter((k) => k !== 'milestones').map((k) => `${PAYLOAD_FIELDS[kind][k].replace(/ \(.*\)$/, '')} ${formatPayloadValue(k, payload[k])}`).join(', ');
}
const pct = z.number('Nhập số hợp lệ').min(0, 'Từ 0 đến 100%').max(100, 'Từ 0 đến 100%').multipleOf(0.01, 'Tối đa hai chữ số thập phân');
const money = z.number('Nhập số hợp lệ').int('Nhập số tiền nguyên (đồng), không có phần lẻ').nonnegative('Không được âm');
export const PAYLOAD_SCHEMAS = {
  fee: z.strictObject({ fixedPct: pct, transactionPct: pct, servicePct: pct, optionalPct: pct, returnFee: money }),
  tax_regime: z.strictObject({ regime: z.enum(['company', 'household', 'individual'], 'Chọn loại hình kinh doanh') }),
  tax_rules: z.strictObject({ vatPct: pct, pitPct: pct, outputVatPct: pct, milestones: z.array(money).max(5, 'Tối đa 5 ngưỡng') }),
  mismatch_threshold: z.strictObject({ abs: money, pct, resolveLimit: money }), min_margin: z.strictObject({ pct }),
};
export const reasonSchema = z.string().trim().min(1, 'Nhập lý do').max(500, 'Tối đa 500 ký tự');
export const bankRefSchema = z.string().trim().min(1, 'Nhập mã giao dịch ngân hàng').max(100, 'Tối đa 100 ký tự');
export const todayVn = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
export const configRecord = (config: FinanceConfig) => ({ createdBy: config.createdBy?.id ?? null,
  effectiveFrom: config.effectiveFrom, today: todayVn(), hasDryRun: Boolean(config.dryRun) });
/** `correctionDate`: ngày hiệu lực của bản bị sửa, bản sửa lỗi phải trùng (Documents/21 §21.4, 422 correction_date_mismatch) */
export function validateConfig(input: CreateFinanceConfig, correctionDate?: string | null): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!z.iso.date().safeParse(input.effectiveFrom).success) errors.effectiveFrom = 'Nhập ngày hiệu lực hợp lệ';
  if (input.kind === 'fee' && !input.shopId) errors.shopId = 'Chọn gian hàng';
  if (input.isCorrection) {
    if (!input.supersedesId) errors.supersedesId = 'Chọn bản bị điều chỉnh';
    if (correctionDate && input.effectiveFrom !== correctionDate) errors.effectiveFrom = 'Bản điều chỉnh phải cùng ngày hiệu lực với bản bị điều chỉnh';
    if (!input.retroactiveFrom || !z.iso.date().safeParse(input.retroactiveFrom).success) errors.retroactiveFrom = 'Nhập ngày hồi tố hợp lệ';
    else if (input.retroactiveFrom > input.effectiveFrom) errors.retroactiveFrom = 'Ngày hồi tố không được sau ngày hiệu lực';
  }
  const payload = PAYLOAD_SCHEMAS[input.kind].safeParse(input.payload);
  if (!payload.success) payload.error.issues.forEach((issue) => { errors[`payload.${String(issue.path[0])}`] = issue.message; });
  return errors;
}

/** Cờ của tiền theo đơn và dòng sổ (Documents/21 §21.1, §21.2; BE#250) */
export const PAYMENT_FLAGS = {
  tax_mismatch: { label: 'Chênh lệch thuế', variant: 'warning' },
  unknown_order: { label: 'Chưa xác định đơn', variant: 'warning' },
} as const satisfies Record<string, { label: string; variant: 'warning' }>;
