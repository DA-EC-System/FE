import type { GroupTemplateField, ProductSpecValue, SpecInput, SpecInputKind, SpecOption } from '@/types/catalog';

/** Một ô thông số trên form: thông tin để vẽ (từ mẫu nhóm hoặc từ `ProductDetail.specs`) */
export interface SpecFieldView {
  fieldId: string;
  name: string;
  input: SpecInputKind;
  unit: string | null;
  allowCustom: boolean;
  required: boolean;
  /** false: ngoài mẫu nhóm hiện tại, hiện ở "Thông số khác" */
  inTemplate: boolean;
  choices: SpecOption[];
}

/** Giá trị đang gõ: lựa chọn có sẵn, giá trị mới (allowCustom), hoặc chữ cho text/number/date */
export interface SpecDraft {
  optionIds: string[];
  newValues: string[];
  value: string;
}

export type SpecDrafts = Record<string, SpecDraft>;

export const EMPTY_SPEC: SpecDraft = { optionIds: [], newValues: [], value: '' };

export const isEmptySpec = (d: SpecDraft | undefined) =>
  !d || (!d.optionIds.length && !d.newValues.length && !d.value.trim());

export const viewFromTemplate = (f: GroupTemplateField): SpecFieldView => ({
  fieldId: f.fieldId,
  name: f.name,
  input: f.input,
  unit: f.unit,
  allowCustom: f.allowCustom,
  required: f.required,
  inTemplate: true,
  choices: f.options,
});

export const viewFromProduct = (s: ProductSpecValue): SpecFieldView => ({
  fieldId: s.fieldId,
  name: s.name,
  input: s.input,
  unit: s.unit,
  allowCustom: s.allowCustom,
  required: s.required,
  inTemplate: s.inTemplate,
  choices: s.choices,
});

export function draftsFromProduct(specs: ProductSpecValue[]): SpecDrafts {
  return Object.fromEntries(
    specs.map((s) => [s.fieldId, { optionIds: s.selected.map((o) => o.id), newValues: [], value: s.value ?? '' }]),
  );
}

/** Một dòng SpecInput theo kiểu nhập; ô trống là xoá (`optionIds: []` hoặc `value: ''`) */
function toInput(view: SpecFieldView, d: SpecDraft | undefined): SpecInput {
  const draft = d ?? EMPTY_SPEC;
  if (view.input === 'select' || view.input === 'multiselect') {
    return {
      fieldId: view.fieldId,
      optionIds: draft.optionIds,
      ...(draft.newValues.length && { newValues: draft.newValues }),
    };
  }
  return { fieldId: view.fieldId, value: draft.value.trim() };
}

const sameDraft = (a: SpecDraft | undefined, b: SpecDraft | undefined) => {
  const x = a ?? EMPTY_SPEC;
  const y = b ?? EMPTY_SPEC;
  return (
    x.value.trim() === y.value.trim() &&
    !x.newValues.length &&
    !y.newValues.length &&
    x.optionIds.length === y.optionIds.length &&
    x.optionIds.every((id) => y.optionIds.includes(id))
  );
};

/**
 * Body `specs` (Documents/21 §5.5). Tạo: chỉ thông số có giá trị. Sửa (`initial` có): chỉ thông số đã đổi, kể cả đổi
 * thành trống (BE hiểu là xoá); thông số không gửi giữ nguyên.
 */
export function specInputs(views: SpecFieldView[], drafts: SpecDrafts, initial?: SpecDrafts): SpecInput[] {
  return views
    .filter((v) => (initial ? !sameDraft(drafts[v.fieldId], initial[v.fieldId]) : !isEmptySpec(drafts[v.fieldId])))
    .map((v) => toInput(v, drafts[v.fieldId]));
}

/** Thông số bắt buộc của mẫu đang trống, theo thứ tự mẫu */
export const missingRequired = (views: SpecFieldView[], drafts: SpecDrafts) =>
  views.filter((v) => v.required && v.inTemplate && isEmptySpec(drafts[v.fieldId]));

/** Lỗi `specs.<i>` của BE trả về theo thứ tự mảng đã gửi → theo `fieldId` */
export function specErrorsByField(errors: Record<string, string>, sent: SpecInput[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, message] of Object.entries(errors)) {
    const m = /^specs\.(\d+)/.exec(key);
    const input = m ? sent[Number(m[1])] : undefined;
    if (input) out[input.fieldId] = message;
  }
  return out;
}
