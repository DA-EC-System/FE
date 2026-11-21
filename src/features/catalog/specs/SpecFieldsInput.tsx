import { useId, useState, type KeyboardEvent } from 'react';
import { RowTextAction } from '@/components/common/RowAction';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { SPEC_INPUT_LABELS } from './specLabels';
import { EMPTY_SPEC, isEmptySpec, type SpecDraft, type SpecDrafts, type SpecFieldView } from './specValues';

/** id của từng ô, để mức sẵn sàng và tab sàn nhảy tới (`productTabs.ts` SHARED_TARGETS) */
export const specFieldDomId = (fieldId: string) => `product-field-spec-${fieldId}`;

const MAX_MULTI = 20;

interface SpecFieldsInputProps {
  views: SpecFieldView[];
  drafts: SpecDrafts;
  onChange: (fieldId: string, draft: SpecDraft) => void;
  /** Lỗi BE theo `fieldId` */
  errors?: Record<string, string>;
  readOnly?: boolean;
  /** Có thì mỗi ô có nút xoá giá trị (mục "Thông số khác") */
  onClear?: (fieldId: string) => void;
}

/** Ô thông số theo kiểu nhập (Documents/21 §5.5). Thiếu thông số bắt buộc không chặn lưu */
export function SpecFieldsInput({ views, drafts, onChange, errors, readOnly, onClear }: SpecFieldsInputProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {views.map((v) => (
        <SpecField
          key={v.fieldId}
          view={v}
          draft={drafts[v.fieldId] ?? EMPTY_SPEC}
          onChange={(d) => onChange(v.fieldId, d)}
          error={errors?.[v.fieldId]}
          readOnly={readOnly}
          onClear={onClear && !isEmptySpec(drafts[v.fieldId]) ? () => onClear(v.fieldId) : undefined}
        />
      ))}
    </div>
  );
}

function SpecField({
  view,
  draft,
  onChange,
  error,
  readOnly,
  onClear,
}: {
  view: SpecFieldView;
  draft: SpecDraft;
  onChange: (d: SpecDraft) => void;
  error?: string;
  readOnly?: boolean;
  onClear?: () => void;
}) {
  const id = useId();
  const missing = view.required && view.inTemplate && isEmptySpec(draft);
  const wide = view.input === 'multiselect' || view.input === 'text';
  const multi = view.input === 'multiselect';

  return (
    <div id={specFieldDomId(view.fieldId)} className={cn('grid content-start gap-1.5 outline-none', wide && 'sm:col-span-2')}>
      <div className="flex items-center gap-2">
        <label id={`${id}-label`} htmlFor={multi ? undefined : id} className="text-sm font-medium">
          {view.name}
          {view.required && view.inTemplate && <span className="text-destructive"> *</span>}
        </label>
        <span className="text-xs text-muted-foreground">{SPEC_INPUT_LABELS[view.input]}</span>
        {onClear && !readOnly && (
          <span className="ml-auto">
            <RowTextAction label={`Xoá giá trị ${view.name}`} destructive onClick={onClear}>
              Xoá
            </RowTextAction>
          </span>
        )}
      </div>
      {view.input === 'select' && <SelectControl id={id} view={view} draft={draft} onChange={onChange} readOnly={readOnly} missing={missing} />}
      {multi && <MultiControl labelId={`${id}-label`} view={view} draft={draft} onChange={onChange} readOnly={readOnly} missing={missing} />}
      {view.input === 'text' && (
        <Textarea
          id={id}
          rows={2}
          maxLength={2000}
          value={draft.value}
          readOnly={readOnly}
          aria-invalid={Boolean(error)}
          className={cn(missing && 'border-warning')}
          onChange={(e) => onChange({ ...draft, value: e.target.value })}
        />
      )}
      {view.input === 'number' && (
        <div className="relative max-w-56">
          <Input
            id={id}
            inputMode="decimal"
            value={draft.value}
            readOnly={readOnly}
            aria-invalid={Boolean(error)}
            className={cn(view.unit && 'pr-12', missing && 'border-warning')}
            onChange={(e) => onChange({ ...draft, value: e.target.value.replace(',', '.') })}
          />
          {view.unit && (
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
              {view.unit}
            </span>
          )}
        </div>
      )}
      {view.input === 'date' && (
        <Input
          id={id}
          type="date"
          value={draft.value}
          readOnly={readOnly}
          aria-invalid={Boolean(error)}
          className={cn('max-w-56', missing && 'border-warning')}
          onChange={(e) => onChange({ ...draft, value: e.target.value })}
        />
      )}
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        missing && <p className="text-xs text-warning-text">Bắt buộc trong mẫu nhóm: thiếu thì chưa &lsquo;Sẵn sàng&rsquo;, vẫn lưu được.</p>
      )}
    </div>
  );
}

const NONE = '__none';

function SelectControl({
  id,
  view,
  draft,
  onChange,
  readOnly,
  missing,
}: {
  id: string;
  view: SpecFieldView;
  draft: SpecDraft;
  onChange: (d: SpecDraft) => void;
  readOnly?: boolean;
  missing: boolean;
}) {
  const custom = draft.newValues[0] ?? '';
  return (
    <div className="flex flex-wrap gap-2">
      <Select
        value={draft.optionIds[0] ?? NONE}
        disabled={readOnly}
        onValueChange={(v) => onChange({ ...draft, optionIds: v === NONE ? [] : [v], newValues: [] })}
      >
        <SelectTrigger id={id} className={cn('w-full sm:w-56', missing && 'border-warning')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Chưa chọn</SelectItem>
          {view.choices.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {view.allowCustom && !readOnly && (
        <Input
          value={custom}
          placeholder="Hoặc gõ giá trị khác"
          aria-label={`Giá trị khác cho ${view.name}`}
          className="w-full sm:w-48"
          onChange={(e) => onChange({ ...draft, optionIds: [], newValues: e.target.value ? [e.target.value] : [] })}
        />
      )}
    </div>
  );
}

function MultiControl({
  labelId,
  view,
  draft,
  onChange,
  readOnly,
  missing,
}: {
  labelId: string;
  view: SpecFieldView;
  draft: SpecDraft;
  onChange: (d: SpecDraft) => void;
  readOnly?: boolean;
  missing: boolean;
}) {
  const [text, setText] = useState('');
  const count = draft.optionIds.length + draft.newValues.length;
  const full = count >= MAX_MULTI;
  const toggle = (optionId: string) =>
    onChange({
      ...draft,
      optionIds: draft.optionIds.includes(optionId)
        ? draft.optionIds.filter((x) => x !== optionId)
        : full
          ? draft.optionIds
          : [...draft.optionIds, optionId],
    });
  const add = () => {
    const value = text.trim();
    if (!value || full) return;
    // Trùng lựa chọn có sẵn (không phân biệt hoa thường) thì chọn lựa chọn đó, như BE (§5.5)
    const existing = view.choices.find((o) => o.value.toLocaleLowerCase('vi') === value.toLocaleLowerCase('vi'));
    if (existing) {
      if (!draft.optionIds.includes(existing.id)) onChange({ ...draft, optionIds: [...draft.optionIds, existing.id] });
    } else if (!draft.newValues.some((x) => x.toLocaleLowerCase('vi') === value.toLocaleLowerCase('vi'))) {
      onChange({ ...draft, newValues: [...draft.newValues, value] });
    }
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  };

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className={cn('flex flex-wrap items-center gap-1.5', missing && 'rounded-md p-1 outline outline-1 outline-warning')}
    >
      {view.choices.map((o) => {
        const on = draft.optionIds.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            disabled={readOnly || (!on && full)}
            onClick={() => toggle(o.id)}
            className={cn(
              'inline-flex min-h-7 cursor-pointer items-center gap-1 rounded-md border px-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              on ? 'border-primary bg-accent text-primary-text' : 'hover:border-primary',
            )}
          >
            {o.value}
          </button>
        );
      })}
      {draft.newValues.map((v) => (
        <Badge key={v} variant="secondary" className="h-7 gap-1">
          {v}
          <span className="text-xs text-muted-foreground">mới</span>
          {!readOnly && (
            <button
              type="button"
              className="-mr-1 min-h-6 cursor-pointer rounded px-1 text-destructive hover:bg-muted"
              aria-label={`Bỏ ${v}`}
              onClick={() => onChange({ ...draft, newValues: draft.newValues.filter((x) => x !== v) })}
            >
              Bỏ
            </button>
          )}
        </Badge>
      ))}
      {view.allowCustom && !readOnly && (
        <Input
          value={text}
          disabled={full}
          placeholder="Thêm giá trị, Enter"
          aria-label={`Thêm giá trị cho ${view.name}`}
          className="h-7 w-44"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onBlur={add}
        />
      )}
      {full && <span className="text-xs text-muted-foreground">Tối đa {MAX_MULTI} giá trị</span>}
    </div>
  );
}
