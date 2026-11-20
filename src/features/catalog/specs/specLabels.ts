import type { SpecInputKind } from '@/types/catalog';

/** Kiểu nhập của thông số (Documents/21 §5.5) */
export const SPEC_INPUT_LABELS: Record<SpecInputKind, string> = {
  select: 'Chọn một',
  multiselect: 'Chọn nhiều',
  text: 'Văn bản',
  number: 'Số',
  date: 'Ngày',
};

export const SPEC_INPUTS = Object.keys(SPEC_INPUT_LABELS) as SpecInputKind[];

export const hasOptions = (input: SpecInputKind) => input === 'select' || input === 'multiselect';
