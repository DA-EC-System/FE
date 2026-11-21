import { z } from 'zod';
import type { StatusMeta } from '@/components/common/StatusBadge';
import { moneySchema } from '@/utils/price';
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
  changes_requested: { label: 'Cần chỉnh sửa', variant: 'warning' },
  approved: { label: 'Đã duyệt', variant: 'info' },
  rejected: { label: 'Đã từ chối', variant: 'destructive' },
  ordered: { label: 'Đã đặt hàng', variant: 'info' },
  partially_received: { label: 'Đã nhận một phần', variant: 'info' },
  received: { label: 'Đã nhận đủ', variant: 'success' },
  closed_short: { label: 'Đã đóng (thiếu hàng)', variant: 'secondary' },
  cancelled: { label: 'Đã huỷ', variant: 'secondary' },
};

export const RECEIPT_STATUS: Record<GoodsReceiptStatus, StatusMeta> = {
  counting: { label: 'Đang kiểm hàng', variant: 'warning' },
  matched: { label: 'Đã nhập kho', variant: 'success' },
  short: { label: 'Thiếu hàng, chờ xử lý', variant: 'destructive' },
  resolved: { label: 'Đã xử lý thiếu', variant: 'secondary' },
  cancelled: { label: 'Đã huỷ', variant: 'secondary' },
};

export const RETURN_STATUS: Record<SupplierReturnStatus, StatusMeta> = {
  draft: { label: 'Nháp', variant: 'warning' },
  pending_approval: { label: 'Chờ duyệt', variant: 'info' },
  sent: { label: 'Đã gửi NCC', variant: 'info' },
  refunded: { label: 'NCC đã hoàn tiền', variant: 'success' },
  replaced: { label: 'NCC đã đổi hàng', variant: 'success' },
  returned_to_us: { label: 'NCC từ chối nhận', variant: 'destructive' },
  cancelled: { label: 'Đã huỷ', variant: 'secondary' },
};

export const DELIVERY_LABELS: Record<DeliveryMode, string> = {
  waiting: 'Kiểm cùng người giao',
  left: 'Kiểm sau (trong 24 giờ)',
};

export const RESOLUTION_LABELS: Record<ShortResolutionKind, string> = {
  follow_up: 'NCC giao bù',
  close_short: 'Chấp nhận thiếu, đóng đơn',
  supplier_wrong: 'NCC giao đủ, kho đếm sai',
};

export const CANCEL_DECISION_LABELS: Record<SupplierReturnCancelDecision, string> = {
  restock: 'Đưa về kho bán (bán tiếp)',
  write_off: 'Tạo phiếu xuất huỷ',
};

const MAX_COST = 1_000_000_000;

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
  groupId: string;
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

// Giới hạn theo BE (commerio-backend#243): tên trục ≤ 15 ký tự, giá trị ≤ 20 ký tự.
const optionSchema = z.object({
  axis: z.string().max(15, 'Tên thuộc tính biến thể tối đa 15 ký tự'),
  value: z.string().trim().max(20, 'Tối đa 20 ký tự'),
});

const requestLineSchema = z
  .object({
    variantId: z.string().nullable(),
    isNew: z.boolean(),
    parentMode: z.enum(['existing', 'new']),
    parentId: z.string(),
    parentName: z.string().trim().max(120, 'Tối đa 120 ký tự'),
    groupId: z.string(),
    options: z.array(optionSchema).max(MAX_AXES),
    quantity: qtyText(1, MAX_QTY),
    unitCost: moneySchema({ label: 'Giá nhập', max: MAX_COST }),
  })
  .superRefine((l, ctx) => {
    if (!l.isNew) return;
    if (l.parentMode === 'existing') {
      if (!l.parentId) ctx.addIssue({ code: 'custom', path: ['parentId'], message: 'Chọn sản phẩm' });
    } else {
      if (!l.parentName) ctx.addIssue({ code: 'custom', path: ['parentName'], message: 'Nhập tên sản phẩm' });
      if (!l.groupId) ctx.addIssue({ code: 'custom', path: ['groupId'], message: 'Chọn danh mục sản phẩm' });
    }
    const seen = new Set<string>();
    l.options.forEach((o, k) => {
      const axis = o.axis.trim();
      if (axis && !o.value) ctx.addIssue({ code: 'custom', path: ['options', k, 'value'], message: `Nhập ${axis.toLowerCase()}` });
      if (!axis && o.value) ctx.addIssue({ code: 'custom', path: ['options', k, 'axis'], message: 'Chọn thuộc tính biến thể' });
      if (axis && seen.has(axis)) ctx.addIssue({ code: 'custom', path: ['options', k, 'axis'], message: 'Thuộc tính biến thể bị lặp' });
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
      idx.forEach((i) => issue(i, `Các dòng cùng sản phẩm có ${axes.length} thuộc tính biến thể; tối đa ${MAX_AXES}`));
      continue;
    }
    const combos = new Map<string, number>();
    for (const i of idx) {
      const values = Object.fromEntries(filledOptions(lines[i]!.options).map((o) => [o.axis, o.value.toLowerCase()]));
      const missing = axes.filter((a) => !values[a]);
      if (key.startsWith('new:') && missing.length) {
        issue(i, `Thiếu ${missing.join(', ').toLowerCase()}: các dòng cùng sản phẩm dùng chung thuộc tính biến thể`);
        continue;
      }
      const combo = axes.map((a) => values[a]).join('|');
      const first = combos.get(combo);
      if (first !== undefined) issue(i, `Trùng phân loại với dòng ${first + 1} cùng sản phẩm`);
      else combos.set(combo, i);
    }
  }
}

export const requestFormSchema = z
  .object({
    supplierId: z.string().min(1, 'Chọn nhà cung cấp'),
    note: z.string().trim().max(500, 'Tối đa 500 ký tự'),
    lines: z.array(requestLineSchema).min(1, 'Thêm ít nhất một dòng').max(100, 'Tối đa 100 dòng'),
  })
  .superRefine((v, ctx) => checkNewProductGroups(v.lines, ctx));

export interface RequestFormInput {
  supplierId: string;
  note: string;
  lines: RequestLineDraft[];
}
export type RequestFormOutput = z.output<typeof requestFormSchema>;

/** Dòng phiếu nhập kho trên form */
export interface ReceiptLineDraft {
  lineId: string;
  /** null khi dòng sản phẩm mới chưa ghi sổ */
  sku: string | null;
  isNew: boolean;
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

/** Kiểm đếm: SL đạt + lỗi giữ lại + trả lại ngay không vượt SL NCC giao; có thiếu, lỗi, trả thì phải ghi lý do */
const receiptLineSchema = z
  .object({
    lineId: z.string(),
    outstanding: z.number(),
    announced: count('SL NCC giao'),
    accepted: count('SL đạt'),
    defectKept: count('Lỗi, giữ lại'),
    returnedOnSpot: count('Trả lại ngay'),
    reason: z.string().trim().max(300, 'Tối đa 300 ký tự'),
  })
  .superRefine((l, ctx) => {
    const handled = l.accepted + l.defectKept + l.returnedOnSpot;
    if (handled > l.announced) {
      ctx.addIssue({ code: 'custom', path: ['accepted'], message: 'SL đạt + lỗi + trả lại vượt SL NCC giao' });
    } else if (l.accepted + l.defectKept > l.outstanding) {
      ctx.addIssue({ code: 'custom', path: ['accepted'], message: `Còn phải nhận ${l.outstanding}, SL đạt và lỗi vượt số này` });
    }
    if ((handled < l.announced || l.defectKept || l.returnedOnSpot) && !l.reason) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Ghi lý do khi có thiếu, lỗi hoặc trả lại' });
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

/** Dòng đề nghị cần để biết dòng sản phẩm mới là cha mới hay thêm biến thể vào cha có sẵn, và đã có SKU chưa */
export type RequestLineRef = { id: string; variantId: string | null; newProduct: { parentId: string | null } | null };

export interface NewProductGroup {
  /** Tên sản phẩm (cha) */
  name: string;
  /** true: cha mới; false: thêm biến thể vào cha có sẵn; null: chưa biết (không đọc được đề nghị) */
  newParent: boolean | null;
  /** Biến thể sẽ tạo (giá trị phân loại) */
  created: string[];
  /** Biến thể chưa về hàng trong phiếu này, để lần nhập sau */
  waiting: string[];
}

export interface NewProductPlan {
  groups: NewProductGroup[];
  /** Số sản phẩm cha mới sẽ tạo */
  productCount: number;
  /** Số biến thể (SKU) sẽ tạo */
  variantCount: number;
}

/**
 * Dòng sản phẩm mới trên phiếu nhập kho đang kiểm: bấm Nhập kho thì dòng có SL đạt hoặc lỗi giữ > 0 sinh SKU, dòng 0
 * để lần nhập sau (Documents/21 §16.3 "Dòng sản phẩm mới khi ghi sổ phiếu nhận"). Dòng đề nghị đã có SKU (phiếu khác
 * ghi sổ trước) thì không tạo nữa. Các dòng cùng tên cha gộp một nhóm, theo thứ tự trên phiếu.
 */
export function newProductPlan(
  lines: readonly Pick<ReceiptLineDraft, 'lineId' | 'sku' | 'isNew' | 'productName' | 'attributesLabel' | 'accepted' | 'defectKept'>[],
  requestLines?: readonly RequestLineRef[],
): NewProductPlan {
  const n = (s: string) => {
    const v = Number(s.trim().replace(/[\s.,]/g, ''));
    return Number.isInteger(v) && v > 0 ? v : 0;
  };
  const refs = new Map((requestLines ?? []).map((l) => [l.id, l]));
  const groups = new Map<string, NewProductGroup>();
  for (const l of lines) {
    const ref = refs.get(l.lineId);
    if (!l.isNew || l.sku !== null || ref?.variantId) continue;
    const key = l.productName.trim().replace(/\s+/g, ' ').toLowerCase();
    const label = l.attributesLabel || l.productName;
    let g = groups.get(key);
    if (!g) {
      g = { name: l.productName, newParent: ref?.newProduct ? ref.newProduct.parentId === null : null, created: [], waiting: [] };
      groups.set(key, g);
    }
    (n(l.accepted) + n(l.defectKept) > 0 ? g.created : g.waiting).push(label);
  }
  const list = [...groups.values()];
  return {
    groups: list,
    productCount: list.filter((g) => g.newParent && g.created.length > 0).length,
    variantCount: list.reduce((s, g) => s + g.created.length, 0),
  };
}

/** Câu trong hộp xác nhận Nhập kho (Thành chốt 21/11/2026 câu 3: "sẽ tạo N sản phẩm, M biến thể"); null khi không có dòng sản phẩm mới */
export function newProductConfirmText(plan: NewProductPlan): string | null {
  if (!plan.groups.length) return null;
  const parts: string[] = [];
  const made = plan.groups.filter((g) => g.created.length);
  if (made.length) {
    const head = plan.productCount
      ? `Sẽ tạo ${plan.productCount} sản phẩm, ${plan.variantCount} biến thể`
      : `Sẽ tạo ${plan.variantCount} biến thể`;
    const items = made.map((g) => `${g.name} (${g.created.join(', ')})${g.newParent === false ? ', thêm vào sản phẩm có sẵn' : ''}`);
    parts.push(`${head}: ${items.join('; ')}.`);
  } else {
    parts.push('Chưa tạo sản phẩm mới nào: các dòng sản phẩm mới chưa có SL đạt hoặc lỗi, giữ lại.');
  }
  const waiting = plan.groups.filter((g) => g.waiting.length);
  if (waiting.length) {
    parts.push(`Chưa về hàng, để lần nhập sau: ${waiting.map((g) => `${g.name} (${g.waiting.join(', ')})`).join('; ')}.`);
  }
  return parts.join(' ');
}

export const returnFormSchema = z.object({
  supplierId: z.string(),
  note: z.string().trim().max(500, 'Tối đa 500 ký tự'),
  lines: z
    .array(z.object({ variantId: z.string(), quarantine: z.number(), quantity: qtyText(1, MAX_QTY) }).superRefine((l, ctx) => {
      if (l.quantity > l.quarantine) {
        ctx.addIssue({ code: 'custom', path: ['quantity'], message: `Chỉ còn ${l.quarantine} hàng lỗi/chờ kiểm` });
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

export const refundSchema = moneySchema({ label: 'Số tiền hoàn', min: 1, max: MAX_COST });

/**
 * Đề nghị nhập phải có nhà cung cấp đang giao dịch. Chưa tải xong danh sách thì `undefined` (không chặn);
 * tải xong mà không có ai đang giao dịch thì nút Lập đề nghị mở hộp thoại chỉ sang tab Nhà cung cấp.
 */
export const hasActiveSupplier = (suppliers: readonly { active: boolean }[] | undefined): boolean | undefined =>
  suppliers === undefined ? undefined : suppliers.some((s) => s.active);

/**
 * Phần sản phẩm mới của dòng kế tiếp: chép sản phẩm (có sẵn hoặc tên mới), danh mục, thuộc tính biến thể của dòng sản
 * phẩm mới gần nhất, để trống giá trị; người dùng chỉ gõ giá trị, số lượng, giá (kiểm người bán KB2 2.1). Chưa có dòng
 * sản phẩm mới nào thì dòng trống với đủ ô thuộc tính của sản phẩm mới.
 */
export function newLineFromPrevious(
  lines: readonly Pick<RequestLineDraft, 'isNew' | 'variantId' | 'parentMode' | 'parentId' | 'parentName' | 'groupId' | 'options'>[],
): Pick<RequestLineDraft, 'isNew' | 'parentMode' | 'parentId' | 'parentName' | 'groupId' | 'options'> {
  const prev = [...lines].reverse().find((l) => l.isNew && !l.variantId);
  if (!prev) return { isNew: true, parentMode: 'new', parentId: '', parentName: '', groupId: '', options: Array.from({ length: MAX_AXES }, () => ({ axis: '', value: '' })) };
  return {
    isNew: true,
    parentMode: prev.parentMode,
    parentId: prev.parentId,
    parentName: prev.parentName,
    groupId: prev.groupId,
    options: prev.options.map((o) => ({ axis: o.axis, value: '' })),
  };
}

/**
 * Ô chọn thuộc tính biến thể của dòng sản phẩm mới, theo danh mục (Documents/21 §5.7 `allowedAttributes`, chốt
 * 21/11/2026 mục 5): thuộc tính hợp danh mục lên đầu, còn lại xếp dưới nhóm "Ngoài danh mục". Danh mục chưa giới hạn
 * (danh sách rỗng) thì một nhóm.
 */
export function axisChoices(
  attributes: readonly { id: string; name: string }[],
  allowed: readonly { attributeId: string }[] | undefined,
): { fits: { id: string; name: string }[]; others: { id: string; name: string }[] } {
  if (!allowed?.length) return { fits: [...attributes], others: [] };
  const ids = allowed.map((a) => a.attributeId);
  return {
    fits: ids.flatMap((id) => attributes.filter((a) => a.id === id)),
    others: attributes.filter((a) => !ids.includes(a.id)),
  };
}
