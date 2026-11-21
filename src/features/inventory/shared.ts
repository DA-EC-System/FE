import { z } from 'zod';
import type { StatusMeta } from '@/components/common/StatusBadge';
import type {
  RejectDecision,
  StockArea,
  StockDocKind,
  StockDocLineInput,
  StockDocStatus,
  StockDocType,
  StockMoveDocType,
  StockState,
} from '@/types/inventory';

export const MAX_QTY = 1_000_000;

/** Chữ thường cho câu "Nhập …", giữ nguyên từ viết tắt in hoa (SL, NCC) */
const lowerLabel = (label: string) =>
  label
    .split(' ')
    .map((w) => (/^\p{Lu}{2,}$/u.test(w) ? w : w.toLowerCase()))
    .join(' ');

/** Ô số lượng nhập chữ: số nguyên trong [min, max], cho phép dấu phân cách nghìn */
export const qtyText = (min: number, max: number, label = 'Số lượng') =>
  z.string().transform((raw, ctx): number => {
    const trimmed = raw.trim();
    // "1.200" hay "1 200" là một nghìn hai trăm; "1.5" không phải số nguyên
    const text = /^-?\d{1,3}([.,\s]\d{3})+$/.test(trimmed) ? trimmed.replace(/[\s.,]/g, '') : trimmed;
    const fail = (message: string) => {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    };
    if (!text) return fail(`Nhập ${lowerLabel(label)}`);
    if (/^-\d+$/.test(text)) return fail(`${label} không được âm`);
    if (!/^\d+$/.test(text)) return fail(`${label} là số nguyên`);
    const value = Number(text);
    if (value < min) return fail(`${label} tối thiểu ${min}`);
    if (value > max) return fail(`${label} tối đa ${max.toLocaleString('vi-VN')}`);
    return value;
  });

/** UC-IN-02: tồn tối thiểu; ô trống là bỏ ngưỡng */
export const minQtySchema = z.string().transform((raw, ctx): number | null => {
  if (!raw.trim()) return null;
  const parsed = qtyText(0, MAX_QTY, 'Ngưỡng tồn').safeParse(raw);
  if (parsed.success) return parsed.data;
  ctx.addIssue({ code: 'custom', message: parsed.error.issues[0].message });
  return z.NEVER;
});

// ---------- Phiếu kho (sơ đồ B3) ----------

const blank = z.string().transform((): number | undefined => undefined);
const isInspection = (type: StockDocType) => type === 'return_inspection';

export const docLineSchema = (type: StockDocType) =>
  z
    .object({
      variantId: z.string().min(1, 'Chọn SKU'),
      quantity: type === 'write_off' || type === 'to_quarantine' ? qtyText(1, MAX_QTY) : blank,
      counted: type === 'stocktake' ? qtyText(0, MAX_QTY, 'Thực tế') : blank,
      scanned: isInspection(type) ? qtyText(0, MAX_QTY, 'Đã quét') : blank,
      resell: isInspection(type) ? qtyText(0, MAX_QTY, 'Bán lại') : blank,
      damaged: isInspection(type) ? qtyText(0, MAX_QTY, 'Hỏng') : blank,
      toSupplier: isInspection(type) ? qtyText(0, MAX_QTY, 'Trả hàng NCC') : blank,
    })
    .superRefine((l, ctx) => {
      if (isInspection(type) && (l.resell ?? 0) + (l.damaged ?? 0) + (l.toSupplier ?? 0) !== l.scanned) {
        ctx.addIssue({ code: 'custom', path: ['resell'], message: 'Bán lại + hỏng + trả hàng NCC phải bằng số đã quét' });
      }
    });

export const docFormSchema = (type: StockDocType) =>
  z.object({
    area: z.enum(['stock', 'quarantine']),
    note:
      type === 'write_off' || type === 'to_quarantine'
        ? z.string().trim().min(1, 'Nhập lý do').max(500, 'Ghi chú tối đa 500 ký tự')
        : z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự'),
    lines: z
      .array(docLineSchema(type))
      .min(isInspection(type) ? 0 : 1, 'Thêm ít nhất một dòng')
      .max(200, 'Tối đa 200 dòng một phiếu')
      .superRefine((lines, ctx) => {
        const seen = new Set<string>();
        lines.forEach((l, i) => {
          if (seen.has(l.variantId)) {
            ctx.addIssue({ code: 'custom', path: [i, 'variantId'], message: 'SKU đã có trên phiếu' });
          }
          seen.add(l.variantId);
        });
      }),
  });

/** Giá trị ô trên form (chữ), trước khi zod đổi sang số */
export interface DocLineDraft {
  variantId: string;
  /** Để hiện trên dòng, không gửi đi */
  sku: string;
  productName: string;
  attributesLabel: string;
  /** Kiểm kê: tồn sổ theo khu vực; lưu thì BE chụp lại */
  bookStock?: number;
  bookQuarantine?: number;
  /** Kiểm hàng về: số dự kiến; 0 là dòng sai mẫu */
  expected?: number;
  quantity: string;
  counted: string;
  scanned: string;
  resell: string;
  damaged: string;
  toSupplier: string;
}
export interface DocFormInput {
  area: StockArea;
  note: string;
  lines: DocLineDraft[];
}
export type DocFormOutput = z.output<ReturnType<typeof docFormSchema>>;

export const emptyLine = (patch: Partial<DocLineDraft> & Pick<DocLineDraft, 'variantId' | 'sku'>): DocLineDraft => ({
  productName: '',
  attributesLabel: '',
  quantity: '',
  counted: '',
  scanned: '',
  resell: '',
  damaged: '',
  toSupplier: '',
  ...patch,
});

export const toLineInputs = (values: DocFormOutput): StockDocLineInput[] =>
  values.lines.map((l) => {
    const line: StockDocLineInput = { variantId: l.variantId };
    for (const key of ['quantity', 'counted', 'scanned', 'resell', 'damaged', 'toSupplier'] as const) {
      if (l[key] !== undefined) line[key] = l[key];
    }
    return line;
  });

/** Số ô chữ hiện tại (để tính Δ, phần thiếu khi đang gõ); ô sai thì null */
export const draftNumber = (text: string): number | null => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : null);

// ---------- Nhãn ----------

export const DOC_TYPE_LABELS: Record<StockDocType, string> = {
  stocktake: 'Kiểm kho',
  write_off: 'Xuất huỷ',
  to_quarantine: 'Chuyển hàng lỗi/chờ kiểm',
  return_inspection: 'Kiểm hàng hoàn',
  shipment: 'Xuất kho giao hàng',
  shipment_reversal: 'Nhập lại do huỷ bàn giao',
};

/** Loại chứng từ trên thẻ kho */
export const MOVE_DOC_LABELS: Record<StockMoveDocType, string> = {
  ...DOC_TYPE_LABELS,
  goods_receipt: 'Phiếu nhập kho',
  supplier_return: 'Trả hàng NCC',
};

export const DOC_TYPE_HELP: Record<StockDocType, string> = {
  stocktake: 'Đếm hàng theo khu. Chênh lệch = thực tế − tồn hệ thống. Tồn kho chỉ đổi khi CEO duyệt.',
  write_off: 'Hàng hỏng, mất không bán được. Gửi duyệt thì hàng bị tạm khoá, CEO duyệt mới trừ tồn.',
  to_quarantine: 'Hàng lỗi phát hiện trên kệ: chuyển sang khu hàng lỗi/chờ kiểm, không bán được nữa. Cần CEO duyệt.',
  return_inspection:
    'Quét hàng hoàn và chia: bán lại, hỏng, trả hàng NCC. Đủ hàng thì hoàn thành ngay; thiếu hàng thì cần người khác duyệt.',
  shipment: 'Tự tạo khi bàn giao kiện cho ĐVVC: trừ tồn kho theo từng món trong kiện.',
  shipment_reversal: 'Tự tạo khi huỷ bàn giao nhầm: cộng lại tồn kho và số tạm giữ cho kiện.',
};

export const DOC_KIND_LABELS: Record<StockDocKind, string> = {
  manual: 'Tạo thủ công',
  purchase: 'Nhập hàng từ NCC',
  order: 'Xuất kho theo đơn',
  auto: 'Tự động',
};

export const DOC_STATUS: Record<StockDocStatus, StatusMeta> = {
  draft: { label: 'Nháp', variant: 'warning' },
  pending: { label: 'Chờ duyệt', variant: 'info' },
  posted: { label: 'Đã ghi sổ', variant: 'success' },
  rejected: { label: 'Bị từ chối', variant: 'destructive' },
  cancelled: { label: 'Đã huỷ', variant: 'secondary' },
};

export const AREA_LABELS: Record<StockArea, string> = {
  stock: 'Tồn kho',
  quarantine: 'Hàng lỗi/chờ kiểm',
};

export const DECISION_LABELS: Record<RejectDecision, string> = {
  restock: 'Đưa về kho bán',
  supplier_return: 'Trả hàng NCC',
};

export const STOCK_STATE: Record<StockState, StatusMeta> = {
  in_stock: { label: 'Còn hàng', variant: 'success' },
  low: { label: 'Sắp hết', variant: 'warning' },
  out: { label: 'Hết hàng', variant: 'destructive' },
};

export const formatQty = (n: number) => n.toLocaleString('vi-VN');

/** Δ có dấu: +3, −2, 0 */
export const formatDelta = (n: number) => (n > 0 ? `+${formatQty(n)}` : n < 0 ? `−${formatQty(-n)}` : '0');
