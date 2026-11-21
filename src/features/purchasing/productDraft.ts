import type {
  DraftSpecValue,
  ProductDraft,
  PurchaseRequestStatus,
  VariantFactKey,
  VariantFacts,
  VariantFactsInput,
} from '@/types/purchasing';
import type { SpecDrafts } from '@/features/catalog/specs/specValues';

/**
 * Bản soạn trước sản phẩm mới (Documents/21 §16.3 "Bản soạn trước", Documents/29 bước 1). Hàm thuần cho trang soạn:
 * đọc, kiểm số của biến thể theo luật `PATCH /catalog/products/:id/variants/:variantId` (§17.2) và ngưỡng tồn (§17.5),
 * dựng body PUT, gắn lỗi BE vào ô.
 */

/** Thứ tự cột trên bảng Biến thể (bản phác `soan-truoc-va-phieu-nhap-kho.html`) */
export const FACT_KEYS: readonly VariantFactKey[] = [
  'targetNetPrice',
  'standardPrice',
  'weightG',
  'lengthMm',
  'widthMm',
  'heightMm',
  'minQty',
];

/** Chữ theo Documents/29 mục 2; "Giá chuẩn" giữ theo chốt 21/11/2026 câu 5 */
export const FACT_LABELS: Record<VariantFactKey, string> = {
  targetNetPrice: 'Giá muốn thực nhận',
  standardPrice: 'Giá chuẩn',
  weightG: 'Cân nặng',
  lengthMm: 'Dài',
  widthMm: 'Rộng',
  heightMm: 'Cao',
  minQty: 'Ngưỡng tồn',
};

const RULES: Record<VariantFactKey, { min: number; max: number; message: string }> = {
  targetNetPrice: { min: 0, max: 1_000_000_000_000, message: 'Giá muốn thực nhận là số nguyên đồng ≥ 0' },
  standardPrice: { min: 0, max: 1_000_000_000_000, message: 'Giá chuẩn là số nguyên đồng ≥ 0' },
  weightG: { min: 1, max: 1_000_000, message: 'Cân nặng là số nguyên gam > 0' },
  lengthMm: { min: 1, max: 100_000, message: 'Chiều dài là số nguyên mm > 0' },
  widthMm: { min: 1, max: 100_000, message: 'Chiều rộng là số nguyên mm > 0' },
  heightMm: { min: 1, max: 100_000, message: 'Chiều cao là số nguyên mm > 0' },
  minQty: { min: 0, max: 1_000_000, message: 'Ngưỡng tồn là số nguyên ≥ 0' },
};

export type FactsDraft = Record<VariantFactKey, string>;

export const EMPTY_FACTS: FactsDraft = {
  targetNetPrice: '',
  standardPrice: '',
  weightG: '',
  lengthMm: '',
  widthMm: '',
  heightMm: '',
  minQty: '',
};

export function factsDraft(f: VariantFacts): FactsDraft {
  return Object.fromEntries(FACT_KEYS.map((k) => [k, f[k] === null ? '' : String(f[k])])) as FactsDraft;
}

/**
 * Ô trống là null (dùng số ở "Mọi biến thể"). Bỏ dấu chấm, phẩy, khoảng trắng ngăn nghìn. Không có quyền chỉnh ngưỡng
 * tồn thì không gửi `minQty` (BE trả 422 theo ô nếu gửi, Documents/21 §16.3).
 */
export function parseFacts(
  d: FactsDraft,
  opts: { withMinQty: boolean },
): { value: VariantFactsInput; errors: Partial<Record<VariantFactKey, string>> } {
  const value: VariantFactsInput = {};
  const errors: Partial<Record<VariantFactKey, string>> = {};
  for (const k of FACT_KEYS) {
    if (k === 'minQty' && !opts.withMinQty) continue;
    const raw = d[k].trim().replace(/[\s.,]/g, '');
    if (!raw) {
      value[k] = null;
      continue;
    }
    const n = Number(raw);
    const rule = RULES[k];
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n < rule.min || n > rule.max) errors[k] = rule.message;
    else value[k] = n;
  }
  return { value, errors };
}

/** "Đen / M"; cha không có thuộc tính biến thể thì một biến thể */
export const variantLabel = (optionValues: Record<string, string>) => Object.values(optionValues).join(' / ') || 'Một biến thể';

/** Tên thuộc tính biến thể theo thứ tự của tổ hợp đầu tiên (thứ tự dòng trên đề nghị, Documents/21 §16.3) */
export const axesOf = (variants: readonly { optionValues: Record<string, string> }[]) =>
  variants.length ? Object.keys(variants[0]!.optionValues) : [];

/** Giá trị của một thuộc tính biến thể, theo thứ tự xuất hiện, không trùng */
export function axisValues(variants: readonly { optionValues: Record<string, string> }[], axis: string): string[] {
  const out: string[] = [];
  for (const v of variants) {
    const value = v.optionValues[axis];
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

/** Đề nghị đã kết thúc: không sửa bản soạn được nữa (409 `draft_closed`) */
const CLOSED: readonly PurchaseRequestStatus[] = ['rejected', 'received', 'closed_short', 'cancelled'];
export const requestClosed = (status: PurchaseRequestStatus) => CLOSED.includes(status);

/** Bản soạn → ô thuộc tính sản phẩm của form (`SpecFieldsInput`) */
export function specDraftsOf(specs: readonly DraftSpecValue[]): SpecDrafts {
  return Object.fromEntries(
    specs.map((s) => [s.fieldId, { optionIds: s.optionIds ?? [], newValues: s.newValues ?? [], value: s.value ?? '' }]),
  );
}

/** Biến thể còn sửa được: tổ hợp chưa có SKU (chưa nhập kho). Trả chỉ số trong `draft.variants` */
export const editableVariantIndexes = (draft: Pick<ProductDraft, 'variants'>) =>
  draft.variants.flatMap((v, i) => (v.variantId === null ? [i] : []));

/**
 * Lỗi BE → khoá ô của trang. `variants.<i>` của BE đếm theo mảng đã gửi (`sent`, chỉ số trong `draft.variants`), đổi
 * về chỉ số trên bảng. Khoá trả về: `variantDefaults.<k>`, `variants.<chỉ số bảng>[.<k>]`, `specs.<i>`, còn lại giữ nguyên.
 */
export function draftFieldErrors(errors: Record<string, string>, sent: readonly number[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, message] of Object.entries(errors)) {
    const m = /^variants\.(\d+)(\..+)?$/.exec(key);
    if (m) {
      const row = sent[Number(m[1])];
      out[row === undefined ? key : `variants.${row}${m[2] ?? ''}`] = message;
    } else out[key] = message;
  }
  return out;
}

const nameKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Bản soạn sẽ bị BE xoá khi lưu đề nghị: tên cha mới của bản soạn không còn trên dòng nào (đổi tên, xoá dòng, chuyển sang
 * sản phẩm có sẵn). Documents/21 §16.3: "đổi tên cha mới ở nháp thì bản soạn của tên cũ bị xoá, FE hỏi trước khi lưu".
 * `renamedTo`: tên cha mới vừa xuất hiện, khi đúng một bản soạn mất và đúng một tên mới (đoán là đổi tên).
 */
export function droppedDrafts(
  drafts: readonly { id: string; parentName: string }[],
  lines: readonly { newProduct?: { parentId: string | null; parentName: string | null } | null }[],
): { dropped: { id: string; parentName: string }[]; renamedTo: string | null } {
  const names = new Map<string, string>();
  for (const l of lines) {
    const n = l.newProduct?.parentId === null ? l.newProduct.parentName?.trim() : null;
    if (n) names.set(nameKey(n), n);
  }
  const had = new Set(drafts.map((d) => nameKey(d.parentName)));
  const dropped = drafts.filter((d) => !names.has(nameKey(d.parentName)));
  const added = [...names.entries()].filter(([k]) => !had.has(k)).map(([, v]) => v);
  return { dropped, renamedTo: dropped.length === 1 && added.length === 1 ? added[0]! : null };
}

/**
 * Chỉ ô đã đổi so với bản đang có (PUT gộp theo ô, Documents/21 §16.3 theo Documents#236): ô vắng là giữ, `null` là
 * xoá. Không có ô nào đổi thì `null` (không gửi dòng đó).
 */
export function changedFacts(value: VariantFactsInput, initial: VariantFacts): VariantFactsInput | null {
  const out: VariantFactsInput = {};
  for (const k of FACT_KEYS) {
    if (k in value && value[k] !== initial[k]) out[k] = value[k] ?? null;
  }
  return Object.keys(out).length ? out : null;
}
