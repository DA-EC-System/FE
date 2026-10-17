import { z } from 'zod';
import { priceTextSchema } from '@/features/pricing/shared';
import type { StockDocKind, StockDocStatus, StockDocType } from '@/types/inventory';

export type { Toast } from '@/features/pricing/shared';

export const MAX_QTY = 1_000_000;

/** Ô số lượng nhập chữ: số nguyên trong [min, max], cho phép dấu phân cách nghìn */
const qtyText = (min: number, max: number, label = 'Số lượng') =>
  z.string().transform((raw, ctx): number => {
    const trimmed = raw.trim();
    // "1.200" hay "1 200" là một nghìn hai trăm; "1.5" không phải số nguyên
    const text = /^-?\d{1,3}([.,\s]\d{3})+$/.test(trimmed) ? trimmed.replace(/[\s.,]/g, '') : trimmed;
    const fail = (message: string) => {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    };
    if (!text) return fail(`Nhập ${label.toLowerCase()}`);
    if (/^-\d+$/.test(text)) return fail(`${label} không được âm`);
    if (!/^\d+$/.test(text)) return fail(`${label} là số nguyên`);
    const value = Number(text);
    if (value < min) return fail(`${label} tối thiểu ${min}`);
    if (value > max) return fail(`${label} tối đa ${max.toLocaleString('vi-VN')}`);
    return value;
  });

/** UC-IN-02: ngưỡng tối thiểu; ô trống là bỏ ngưỡng */
export const minQtySchema = z.string().transform((raw, ctx): number | null => {
  if (!raw.trim()) return null;
  const parsed = qtyText(0, MAX_QTY, 'Ngưỡng').safeParse(raw);
  if (parsed.success) return parsed.data;
  ctx.addIssue({ code: 'custom', message: parsed.error.issues[0].message });
  return z.NEVER;
});

// ---------- Phiếu nhập, phiếu xuất ----------

export const docLineSchema = (type: StockDocType) =>
  z.object({
    variantId: z.string().min(1, 'Chọn biến thể'),
    quantity: qtyText(1, MAX_QTY),
    unitCost:
      type === 'receipt'
        ? priceTextSchema.refine((v): v is number => v !== null, 'Nhập giá nhập')
        : z.string().transform(() => null),
  });

export const docFormSchema = (type: StockDocType) =>
  z.object({
    note:
      type === 'issue'
        ? z.string().trim().min(1, 'Nhập lý do xuất kho').max(500, 'Ghi chú tối đa 500 ký tự')
        : z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự'),
    lines: z
      .array(docLineSchema(type))
      .min(1, 'Thêm ít nhất một dòng')
      .max(200, 'Tối đa 200 dòng một phiếu')
      .superRefine((lines, ctx) => {
        const seen = new Set<string>();
        lines.forEach((l, i) => {
          if (seen.has(l.variantId)) {
            ctx.addIssue({ code: 'custom', path: [i, 'variantId'], message: 'Biến thể bị lặp' });
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
  quantity: string;
  unitCost: string;
}
export interface DocFormInput {
  note: string;
  lines: DocLineDraft[];
}
export type DocFormOutput = z.output<ReturnType<typeof docFormSchema>>;

// ---------- Nhập hoàn (UC-IN-03) ----------

export const returnFormSchema = z
  .object({
    note: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự'),
    lines: z.array(
      z
        .object({ variantId: z.string(), shipped: z.number(), quantity: z.string() })
        .transform((l, ctx) => {
          const parsed = qtyText(0, l.shipped, 'Số thực nhận').safeParse(l.quantity);
          if (!parsed.success) {
            ctx.addIssue({ code: 'custom', path: ['quantity'], message: parsed.error.issues[0].message });
            return z.NEVER;
          }
          return { variantId: l.variantId, shipped: l.shipped, quantity: parsed.data };
        }),
    ),
  })
  .superRefine((form, ctx) => {
    if (form.lines.every((l) => l.quantity === 0)) {
      ctx.addIssue({ code: 'custom', path: ['lines'], message: 'Không có hàng nào quay về thì không lập phiếu' });
    } else if (form.lines.some((l) => l.quantity !== l.shipped) && !form.note) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'Ghi lý do số thực nhận khác số đã xuất' });
    }
  });
export type ReturnFormInput = z.input<typeof returnFormSchema>;
export type ReturnFormOutput = z.output<typeof returnFormSchema>;

// ---------- Nhãn ----------

export const DOC_TYPE_LABELS: Record<StockDocType, string> = {
  receipt: 'Phiếu nhập',
  issue: 'Phiếu xuất',
};

export const DOC_KIND_LABELS: Record<StockDocKind, string> = {
  manual: 'Lập tay',
  purchase: 'Nhận hàng đơn mua',
  delivery_return: 'Nhập hoàn',
  order: 'Xuất theo đơn',
};

export const DOC_STATUS: Record<StockDocStatus, { label: string; color: 'default' | 'success' | 'warning' }> = {
  draft: { label: 'Nháp', color: 'warning' },
  done: { label: 'Đã ghi sổ', color: 'success' },
  cancelled: { label: 'Đã huỷ', color: 'default' },
};

export const formatQty = (n: number) => n.toLocaleString('vi-VN');
