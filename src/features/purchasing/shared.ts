import { z } from 'zod';
import type { StatusMeta } from '@/components/common/StatusBadge';
import { NEW_PRODUCT_PARENT } from '@/utils/env';
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
  ordered: { label: 'Đã đặt nhà cung cấp', variant: 'info' },
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
  refunded: { label: 'Nhà cung cấp hoàn tiền', variant: 'success' },
  replaced: { label: 'Nhà cung cấp bù hàng', variant: 'success' },
  returned_to_us: { label: 'Nhà cung cấp không nhận', variant: 'destructive' },
  cancelled: { label: 'Đã huỷ', variant: 'secondary' },
};

export const DELIVERY_LABELS: Record<DeliveryMode, string> = {
  waiting: 'Người giao đứng chờ',
  left: 'Người giao đã đi (kiểm trong 24 giờ)',
};

export const RESOLUTION_LABELS: Record<ShortResolutionKind, string> = {
  follow_up: 'Nhà cung cấp giao bù',
  close_short: 'Đóng thiếu đề nghị',
  supplier_wrong: 'Nhà cung cấp báo đã giao đủ, mình nhận sai',
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

/** Một trục phân loại của dòng sản phẩm mới: tên trục (thuộc tính) và giá trị */
export interface NewProductOption {
  axis: string;
  value: string;
}

/** Sản phẩm cha tối đa 2 trục phân loại (Documents/21, 422 `too_many_axes`) */
export const MAX_AXES = 2;

/**
 * Dòng đề nghị trên form: biến thể có sẵn hoặc sản phẩm mới. Sản phẩm mới thuộc một cha có sẵn (`parentId`, trục theo
 * cha đó) hoặc một cha mới (`parentName` + danh mục, trục tự chọn); các dòng cùng tên cha mới gộp một cha (BE#243).
 */
export interface RequestLineDraft {
  variantId: string | null;
  sku: string;
  productName: string;
  attributesLabel: string;
  isNew: boolean;
  parentMode: 'existing' | 'new';
  /** Cha có sẵn; rỗng khi chưa chọn hoặc cha mới */
  parentId: string;
  /** Tên cha mới, hoặc tên của cha có sẵn đã chọn (để hiển thị và ghép tên) */
  parentName: string;
  categoryId: string;
  options: NewProductOption[];
  quantity: string;
  unitCost: string;
}

/** Khoá gộp dòng cùng cha: cha có sẵn theo id, cha mới theo tên không phân biệt hoa thường, khoảng trắng */
export const parentKey = (l: Pick<RequestLineDraft, 'parentMode' | 'parentId' | 'parentName'>) =>
  l.parentMode === 'existing' ? `id:${l.parentId}` : `new:${l.parentName.trim().replace(/\s+/g, ' ').toLowerCase()}`;

/** Các trục đã điền giá trị của một dòng */
export const filledOptions = (options: NewProductOption[]) =>
  options.map((o) => ({ axis: o.axis.trim(), value: o.value.trim() })).filter((o) => o.axis && o.value);

/** "Màu sắc: Đỏ · Kích cỡ: M" */
export const optionsLabel = (values: Record<string, string> | NewProductOption[] | undefined) => {
  const list = Array.isArray(values) ? filledOptions(values) : Object.entries(values ?? {}).map(([axis, value]) => ({ axis, value }));
  return list.map((o) => `${o.axis}: ${o.value}`).join(' · ');
};

const optionSchema = z.object({ axis: z.string(), value: z.string().trim().max(60, 'Tối đa 60 ký tự') });

const requestLineSchema = z
  .object({
    variantId: z.string().nullable(),
    isNew: z.boolean(),
    parentMode: z.enum(['existing', 'new']),
    parentId: z.string(),
    parentName: z.string().trim().max(120, 'Tối đa 120 ký tự'),
    categoryId: z.string(),
    options: z.array(optionSchema).max(MAX_AXES),
    quantity: qtyText(1, MAX_QTY),
    unitCost: moneyText('Giá nhập'),
  })
  .superRefine((l, ctx) => {
    if (!l.isNew) return;
    if (l.parentMode === 'existing') {
      if (!l.parentId) ctx.addIssue({ code: 'custom', path: ['parentId'], message: 'Chọn sản phẩm cha' });
    } else {
      if (!l.parentName) ctx.addIssue({ code: 'custom', path: ['parentName'], message: 'Nhập tên sản phẩm cha' });
      if (!l.categoryId) ctx.addIssue({ code: 'custom', path: ['categoryId'], message: 'Chọn danh mục' });
    }
    const seen = new Set<string>();
    l.options.forEach((o, k) => {
      const axis = o.axis.trim();
      if (axis && !o.value) ctx.addIssue({ code: 'custom', path: ['options', k, 'value'], message: `Nhập ${axis.toLowerCase()}` });
      if (!axis && o.value) ctx.addIssue({ code: 'custom', path: ['options', k, 'axis'], message: 'Chọn trục phân loại' });
      if (axis && seen.has(axis)) ctx.addIssue({ code: 'custom', path: ['options', k, 'axis'], message: 'Trục bị lặp' });
      seen.add(axis);
    });
  });

/**
 * Luật giữa các dòng sản phẩm mới cùng cha (Documents/21): cha mới tối đa 2 trục lấy từ các dòng, dòng nào cũng có
 * giá trị cho mọi trục của cha; cùng cha không trùng tổ hợp giá trị. Lỗi gắn ở `lines.<i>.options`.
 */
function checkNewProductGroups(lines: z.output<typeof requestLineSchema>[], ctx: z.RefinementCtx) {
  const groups = new Map<string, number[]>();
  lines.forEach((l, i) => {
    if (!l.isNew || (l.parentMode === 'existing' ? !l.parentId : !l.parentName)) return;
    const key = parentKey(l);
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  const issue = (i: number, message: string) => ctx.addIssue({ code: 'custom', path: ['lines', i, 'options'], message });
  for (const [key, idx] of groups) {
    const axes = [...new Set(idx.flatMap((i) => filledOptions(lines[i]!.options).map((o) => o.axis)))];
    if (key.startsWith('new:') && axes.length > MAX_AXES) {
      idx.forEach((i) => issue(i, `Các dòng cùng sản phẩm cha có ${axes.length} trục phân loại; tối đa ${MAX_AXES}`));
      continue;
    }
    const combos = new Map<string, number>();
    for (const i of idx) {
      const values = Object.fromEntries(filledOptions(lines[i]!.options).map((o) => [o.axis, o.value.toLowerCase()]));
      const missing = axes.filter((a) => !values[a]);
      if (key.startsWith('new:') && missing.length) {
        issue(i, `Thiếu ${missing.join(', ').toLowerCase()}: các dòng cùng sản phẩm cha dùng chung trục phân loại`);
        continue;
      }
      const combo = axes.map((a) => values[a]).join('|');
      const first = combos.get(combo);
      if (first !== undefined) issue(i, `Trùng phân loại với dòng ${first + 1} cùng sản phẩm cha`);
      else combos.set(combo, i);
    }
  }
}

/** Tên ghép của dòng sản phẩm mới gửi BE: tên cha rồi các giá trị phân loại */
export const newProductName = (l: Pick<RequestLineDraft, 'parentName' | 'options'>) =>
  [l.parentName.trim(), ...filledOptions(l.options).map((o) => o.value)].join(' ').slice(0, 120);

/** Chưa có cha (NEW_PRODUCT_PARENT tắt): mỗi dòng một sản phẩm riêng, chỉ chặn hai dòng trùng hẳn tên */
function checkDuplicateNames(lines: z.output<typeof requestLineSchema>[], ctx: z.RefinementCtx) {
  const seen = new Map<string, number>();
  lines.forEach((l, i) => {
    if (!l.isNew || !l.parentName) return;
    const key = newProductName(l).replace(/\s+/g, ' ').toLowerCase();
    const first = seen.get(key);
    if (first !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['lines', i, 'options'], message: `Trùng tên sản phẩm với dòng ${first + 1}` });
    } else seen.set(key, i);
  });
}

export const requestFormSchemaFor = (parents: boolean) =>
  z
    .object({
      supplierId: z.string().min(1, 'Chọn nhà cung cấp'),
      note: z.string().trim().max(500, 'Tối đa 500 ký tự'),
      lines: z.array(requestLineSchema).min(1, 'Thêm ít nhất một dòng').max(100, 'Tối đa 100 dòng'),
    })
    .superRefine((v, ctx) => (parents ? checkNewProductGroups(v.lines, ctx) : checkDuplicateNames(v.lines, ctx)));

export const requestFormSchema = requestFormSchemaFor(NEW_PRODUCT_PARENT);

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

/**
 * Đề nghị nhập phải có nhà cung cấp đang giao dịch. Chưa tải xong danh sách thì `undefined` (không chặn);
 * tải xong mà không có ai đang giao dịch thì nút Lập đề nghị mở hộp thoại chỉ sang tab Nhà cung cấp.
 */
export const hasActiveSupplier = (suppliers: readonly { active: boolean }[] | undefined): boolean | undefined =>
  suppliers === undefined ? undefined : suppliers.some((s) => s.active);
