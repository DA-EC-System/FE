import { z } from 'zod';
import type { StatusMeta } from '@/components/common/StatusBadge';
import { MAX_QTY, qtyText } from '@/features/inventory/shared';
import type {
  DeliveryMode,
  GoodsReceiptStatus,
  PurchaseRequestStatus,
  ShortResolutionKind,
  SupplierReturnCancelDecision,
  SupplierReturnStatus,
} from '@/types/purchasing';

export { formatQty } from '@/features/inventory/shared';

export const REQUEST_STATUS: Record<PurchaseRequestStatus, StatusMeta> = {
  draft: { label: 'Nháp', variant: 'warning' },
  pending_approval: { label: 'Chờ duyệt', variant: 'info' },
  changes_requested: { label: 'Bị trả về', variant: 'warning' },
  approved: { label: 'Đã duyệt', variant: 'info' },
  rejected: { label: 'Từ chối', variant: 'destructive' },
  ordered: { label: 'Đã đặt NCC', variant: 'info' },
  partially_received: { label: 'Nhận một phần', variant: 'info' },
  received: { label: 'Nhận xong', variant: 'success' },
  closed_short: { label: 'Đóng thiếu', variant: 'secondary' },
  cancelled: { label: 'Đã huỷ', variant: 'secondary' },
};

export const RECEIPT_STATUS: Record<GoodsReceiptStatus, StatusMeta> = {
  counting: { label: 'Đang kiểm', variant: 'warning' },
  matched: { label: 'Khớp', variant: 'success' },
  short: { label: 'Giao thiếu', variant: 'destructive' },
  resolved: { label: 'Đã xử lý', variant: 'secondary' },
  cancelled: { label: 'Đã huỷ', variant: 'secondary' },
};

export const RETURN_STATUS: Record<SupplierReturnStatus, StatusMeta> = {
  draft: { label: 'Nháp', variant: 'warning' },
  pending_approval: { label: 'Chờ duyệt', variant: 'info' },
  sent: { label: 'Đã gửi', variant: 'info' },
  refunded: { label: 'NCC hoàn tiền', variant: 'success' },
  replaced: { label: 'NCC bù hàng', variant: 'success' },
  returned_to_us: { label: 'NCC không nhận', variant: 'destructive' },
  cancelled: { label: 'Đã huỷ', variant: 'secondary' },
};

export const DELIVERY_LABELS: Record<DeliveryMode, string> = {
  waiting: 'Người giao đứng chờ',
  left: 'Người giao đã đi (kiểm trong 24 giờ)',
};

export const RESOLUTION_LABELS: Record<ShortResolutionKind, string> = {
  follow_up: 'NCC giao bù',
  close_short: 'Đóng thiếu đề nghị',
  supplier_wrong: 'NCC báo đã giao đủ, mình nhận sai',
};

export const CANCEL_DECISION_LABELS: Record<SupplierReturnCancelDecision, string> = {
  restock: 'Nhập lại tồn bán được',
  write_off: 'Lập phiếu xuất huỷ',
};

const MAX_COST = 1_000_000_000;

/** Ô tiền nhập chữ: số nguyên đồng, cho phép dấu phân cách nghìn */
export const moneyText = (label: string, min = 0) =>
  z.string().transform((raw, ctx): number => {
    const text = raw.trim().replace(/[\s.,]/g, '');
    const fail = (message: string) => {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    };
    if (!text) return fail(`Nhập ${label.toLowerCase()}`);
    if (!/^\d+$/.test(text)) return fail(`${label} là số nguyên không âm`);
    const value = Number(text);
    if (value < min) return fail(`${label} phải lớn hơn ${min - 1}`);
    if (value > MAX_COST) return fail(`${label} tối đa ${MAX_COST.toLocaleString('vi-VN')}`);
    return value;
  });

export const supplierSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên nhà cung cấp').max(150, 'Tối đa 150 ký tự'),
  phone: z
    .string()
    .trim()
    .refine((v) => !v || /^[0-9 +().-]{8,20}$/.test(v), 'Số điện thoại không hợp lệ'),
  email: z
    .string()
    .trim()
    .refine((v) => !v || z.string().email().safeParse(v).success, 'Email không hợp lệ'),
  address: z.string().trim().max(300, 'Tối đa 300 ký tự'),
  note: z.string().trim().max(500, 'Tối đa 500 ký tự'),
  active: z.boolean(),
});
export type SupplierForm = z.input<typeof supplierSchema>;

/** Dòng đề nghị trên form: biến thể có sẵn hoặc sản phẩm mới (tên + danh mục) */
export interface RequestLineDraft {
  variantId: string | null;
  sku: string;
  productName: string;
  attributesLabel: string;
  isNew: boolean;
  newName: string;
  categoryId: string;
  quantity: string;
  unitCost: string;
}

const requestLineSchema = z
  .object({
    variantId: z.string().nullable(),
    isNew: z.boolean(),
    newName: z.string().trim().max(120, 'Tối đa 120 ký tự'),
    categoryId: z.string(),
    quantity: qtyText(1, MAX_QTY),
    unitCost: moneyText('Giá nhập'),
  })
  .superRefine((l, ctx) => {
    if (!l.isNew) return;
    if (!l.newName) ctx.addIssue({ code: 'custom', path: ['newName'], message: 'Nhập tên sản phẩm mới' });
    if (!l.categoryId) ctx.addIssue({ code: 'custom', path: ['categoryId'], message: 'Chọn danh mục' });
  });

export const requestFormSchema = z.object({
  supplierId: z.string().min(1, 'Chọn nhà cung cấp'),
  note: z.string().trim().max(500, 'Tối đa 500 ký tự'),
  lines: z.array(requestLineSchema).min(1, 'Thêm ít nhất một dòng').max(100, 'Tối đa 100 dòng'),
});

export interface RequestFormInput {
  supplierId: string;
  note: string;
  lines: RequestLineDraft[];
}
export type RequestFormOutput = z.output<typeof requestFormSchema>;

/** Dòng phiếu nhận trên form */
export interface ReceiptLineDraft {
  lineId: string;
  sku: string;
  productName: string;
  attributesLabel: string;
  outstanding: number;
  announced: string;
  accepted: string;
  defectKept: string;
  returnedOnSpot: string;
  reason: string;
}

const count = (label: string) => qtyText(0, MAX_QTY, label);

/** Kiểm đếm: đạt + lỗi giữ + trả tại chỗ không vượt báo giao; có thiếu, lỗi, trả thì phải ghi lý do */
const receiptLineSchema = z
  .object({
    lineId: z.string(),
    outstanding: z.number(),
    announced: count('Báo giao'),
    accepted: count('Nhận đạt'),
    defectKept: count('Lỗi giữ'),
    returnedOnSpot: count('Trả tại chỗ'),
    reason: z.string().trim().max(300, 'Tối đa 300 ký tự'),
  })
  .superRefine((l, ctx) => {
    const handled = l.accepted + l.defectKept + l.returnedOnSpot;
    if (handled > l.announced) {
      ctx.addIssue({ code: 'custom', path: ['accepted'], message: 'Đạt, lỗi giữ, trả tại chỗ cộng lại vượt số báo giao' });
    } else if (l.accepted + l.defectKept > l.outstanding) {
      ctx.addIssue({ code: 'custom', path: ['accepted'], message: `Còn chờ ${l.outstanding}, nhận đạt và lỗi giữ vượt số này` });
    }
    if ((handled < l.announced || l.defectKept || l.returnedOnSpot) && !l.reason) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Ghi lý do khi có thiếu, lỗi hoặc trả tại chỗ' });
    }
  });

export const receiptFormSchema = z.object({
  deliveryMode: z.enum(['waiting', 'left']),
  note: z.string().trim().max(500, 'Tối đa 500 ký tự'),
  lines: z.array(receiptLineSchema),
});

export interface ReceiptFormInput {
  deliveryMode: DeliveryMode;
  note: string;
  lines: ReceiptLineDraft[];
}
export type ReceiptFormOutput = z.output<typeof receiptFormSchema>;

/** Thiếu của một dòng đang nhập (chữ chưa hợp lệ coi là 0) */
export function shortOfDraft(l: Pick<ReceiptLineDraft, 'announced' | 'accepted' | 'defectKept' | 'returnedOnSpot'>) {
  const n = (s: string) => {
    const v = Number(s.trim().replace(/[\s.,]/g, ''));
    return Number.isInteger(v) && v >= 0 ? v : 0;
  };
  return Math.max(0, n(l.announced) - n(l.accepted) - n(l.defectKept) - n(l.returnedOnSpot));
}

export const returnFormSchema = z.object({
  supplierId: z.string(),
  note: z.string().trim().max(500, 'Tối đa 500 ký tự'),
  lines: z
    .array(z.object({ variantId: z.string(), quarantine: z.number(), quantity: qtyText(1, MAX_QTY) }).superRefine((l, ctx) => {
      if (l.quantity > l.quarantine) {
        ctx.addIssue({ code: 'custom', path: ['quantity'], message: `Chỉ còn ${l.quarantine} chờ xử lý` });
      }
    }))
    .min(1, 'Thêm ít nhất một dòng'),
});

export interface ReturnLineDraft {
  variantId: string;
  sku: string;
  productName: string;
  attributesLabel: string;
  quarantine: number;
  quantity: string;
}

export interface ReturnFormInput {
  supplierId: string;
  note: string;
  lines: ReturnLineDraft[];
}
export type ReturnFormOutput = z.output<typeof returnFormSchema>;

export const refundSchema = moneyText('Số tiền hoàn', 1);
