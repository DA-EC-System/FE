import { useEffect, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useAttributes, useCategories, useProduct, useProducts } from '@/api/catalog.api';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import type { ProductListItem } from '@/types/catalog';
import { NEW_PRODUCT_PARENT } from '@/utils/env';
import { MAX_AXES, type NewProductOption, type RequestLineDraft } from './shared';

type FieldError = { message?: string } | undefined;

export interface NewProductErrors {
  parentId?: FieldError;
  parentName?: FieldError;
  categoryId?: FieldError;
  options?: (FieldError & { root?: FieldError } & Partial<Record<number, { axis?: FieldError; value?: FieldError }>>) | undefined;
}

interface NewProductFieldsProps {
  line: RequestLineDraft;
  /** Tên dòng cho aria-label: nhiều dòng sản phẩm mới trên cùng trang */
  name: string;
  index: number;
  errors: NewProductErrors | undefined;
  disabled?: boolean;
  onChange: (patch: Partial<RequestLineDraft>) => void;
}

const NO_AXIS = '__none__';

const emptyOptions = (): NewProductOption[] => Array.from({ length: MAX_AXES }, () => ({ axis: '', value: '' }));

function Err({ error }: { error: FieldError }) {
  return error?.message ? <p className="text-xs text-destructive">{error.message}</p> : null;
}

/**
 * Ô nhập của dòng sản phẩm mới (BE#243, Documents/21): chọn cha có sẵn (giá trị theo trục của cha) hoặc cha mới
 * (tên, danh mục, tối đa 2 trục chọn từ thuộc tính của công ty). Các dòng cùng tên cha mới gộp một cha khi duyệt.
 * BE chưa nhận cha (`NEW_PRODUCT_PARENT` tắt) thì ẩn "Cha có sẵn": mỗi dòng là một sản phẩm riêng, báo rõ dưới ô.
 */
export function NewProductFields({ line, name, index, errors, disabled, onChange }: NewProductFieldsProps) {
  const categoriesQuery = useCategories();
  const attributesQuery = useAttributes();
  const parentQuery = useProduct(line.parentMode === 'existing' && line.parentId ? line.parentId : undefined);
  // Trục của cha có sẵn lấy theo thuộc tính của SKU đầu tiên
  const parentAxes = parentQuery.data?.variants[0]?.attributes.map((a) => a.attributeName) ?? [];
  const parentAxesKey = parentAxes.join('|');

  useEffect(() => {
    if (line.parentMode !== 'existing' || !parentQuery.data) return;
    const current = line.options.map((o) => o.axis).join('|');
    if (current === parentAxesKey) return;
    onChange({
      categoryId: parentQuery.data.category.id,
      options: parentAxes.map((axis) => ({ axis, value: line.options.find((o) => o.axis === axis)?.value ?? '' })),
    });
    // Chỉ chạy khi đổi cha hoặc trục của cha đổi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.parentMode, parentQuery.data?.id, parentAxesKey]);

  const optionErrors = errors?.options;
  const groupError = optionErrors?.message ? optionErrors : optionErrors?.root;
  const usedAxes = new Set(line.options.map((o) => o.axis).filter(Boolean));

  const setOption = (k: number, patch: Partial<NewProductOption>) =>
    onChange({ options: line.options.map((o, j) => (j === k ? { ...o, ...patch } : o)) });

  return (
    <div className="grid gap-2" data-testid={`new-product-${index}`}>
      {NEW_PRODUCT_PARENT && (
        <RadioGroup
          className="flex gap-4"
          value={line.parentMode}
          disabled={disabled}
          onValueChange={(v) => {
            if (v === line.parentMode) return;
            onChange({
              parentMode: v as RequestLineDraft['parentMode'],
              parentId: '',
              parentName: '',
              categoryId: '',
              options: v === 'new' ? emptyOptions() : [],
            });
          }}
          aria-label={`Sản phẩm cha của ${name}`}
        >
          {(
            [
              ['existing', 'Cha có sẵn'],
              ['new', 'Cha mới'],
            ] as const
          ).map(([value, text]) => (
            <label key={value} className="flex items-center gap-1.5 text-sm">
              <RadioGroupItem value={value} aria-label={`${text} ${name}`} />
              {text}
            </label>
          ))}
        </RadioGroup>
      )}

      {line.parentMode === 'existing' ? (
        <div className="grid gap-1">
          <ParentPicker
            id={`parent-${index}`}
            label={`Sản phẩm cha ${name}`}
            selected={line.parentId ? { id: line.parentId, name: line.parentName } : null}
            invalid={Boolean(errors?.parentId)}
            disabled={disabled}
            onPick={(p) => onChange({ parentId: p.id, parentName: p.name, categoryId: p.category.id, options: [] })}
          />
          <Err error={errors?.parentId} />
          {line.parentId && parentQuery.data && !parentAxes.length && (
            <p className="text-xs text-muted-foreground">Sản phẩm này không có trục phân loại.</p>
          )}
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          <div className="grid gap-1">
            <Input
              value={line.parentName}
              placeholder={NEW_PRODUCT_PARENT ? 'Tên sản phẩm cha' : 'Tên sản phẩm'}
              aria-label={`${NEW_PRODUCT_PARENT ? 'Tên sản phẩm cha' : 'Tên sản phẩm'} ${name}`}
              aria-invalid={Boolean(errors?.parentName)}
              disabled={disabled}
              className="h-8"
              onChange={(e) => onChange({ parentName: e.target.value })}
            />
            <Err error={errors?.parentName} />
          </div>
          <div className="grid gap-1">
            <Select
              value={line.categoryId}
              disabled={disabled || categoriesQuery.isLoading}
              onValueChange={(v) => onChange({ categoryId: v })}
            >
              <SelectTrigger className="h-8 w-full" aria-label={`Danh mục ${name}`} aria-invalid={Boolean(errors?.categoryId)}>
                <SelectValue placeholder={categoriesQuery.isLoading ? 'Đang tải…' : 'Danh mục'} />
              </SelectTrigger>
              <SelectContent>
                {(categoriesQuery.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Err error={errors?.categoryId} />
          </div>
        </div>
      )}

      {line.options.length > 0 && (
        <div className="grid gap-2 md:grid-cols-2">
          {line.options.map((o, k) => {
            const err = optionErrors?.[k];
            return (
              <div key={k} className="grid gap-1">
                <div className="flex gap-1">
                  {line.parentMode === 'new' ? (
                    <Select
                      value={o.axis || NO_AXIS}
                      disabled={disabled || attributesQuery.isLoading}
                      onValueChange={(v) => setOption(k, { axis: v === NO_AXIS ? '' : v })}
                    >
                      <SelectTrigger
                        className="h-8 w-32 shrink-0"
                        aria-label={`Trục phân loại ${k + 1} ${name}`}
                        aria-invalid={Boolean(err?.axis)}
                      >
                        <SelectValue placeholder="Trục" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_AXIS}>Không dùng</SelectItem>
                        {(attributesQuery.data ?? []).map((a) => (
                          <SelectItem key={a.id} value={a.name} disabled={usedAxes.has(a.name) && o.axis !== a.name}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="flex h-8 w-32 shrink-0 items-center text-sm text-muted-foreground">{o.axis}</span>
                  )}
                  <AxisValueInput
                    axis={o.axis}
                    value={o.value}
                    suggestions={attributesQuery.data?.find((a) => a.name === o.axis)?.values.map((v) => v.value) ?? []}
                    label={`${o.axis || `Giá trị ${k + 1}`} ${name}`}
                    listId={`axis-${index}-${k}`}
                    invalid={Boolean(err?.value)}
                    disabled={disabled || (line.parentMode === 'new' && !o.axis)}
                    onChange={(value) => setOption(k, { value })}
                  />
                </div>
                <Err error={err?.axis ?? err?.value} />
              </div>
            );
          })}
        </div>
      )}
      <Err error={groupError} />
      {!NEW_PRODUCT_PARENT && (
        <p className="text-xs text-muted-foreground" data-testid={`new-product-note-${index}`}>
          Mỗi dòng tạo một sản phẩm riêng một SKU, tên gồm tên sản phẩm và phân loại (ví dụ "Áo thun Đỏ"). Chưa thêm SKU
          vào sản phẩm có sẵn hay gộp nhiều dòng vào một sản phẩm được.
        </p>
      )}
    </div>
  );
}

/** Ô giá trị phân loại: gõ tự do, gợi ý giá trị đã có của thuộc tính (giá trị mới được tạo khi duyệt) */
function AxisValueInput({
  axis,
  value,
  suggestions,
  label,
  listId,
  invalid,
  disabled,
  onChange,
}: {
  axis: string;
  value: string;
  suggestions: string[];
  label: string;
  listId: string;
  invalid: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <>
      <Input
        value={value}
        placeholder={axis ? `Giá trị ${axis.toLowerCase()}` : 'Giá trị'}
        aria-label={label}
        aria-invalid={invalid}
        disabled={disabled}
        list={suggestions.length ? listId : undefined}
        className="h-8 min-w-0"
        onChange={(e) => onChange(e.target.value)}
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </>
  );
}

/** Tìm sản phẩm cha có sẵn theo tên hoặc mã */
function ParentPicker({
  id,
  label,
  selected,
  invalid,
  disabled,
  onPick,
}: {
  id: string;
  label: string;
  selected: { id: string; name: string } | null;
  invalid: boolean;
  disabled?: boolean;
  onPick: (p: ProductListItem) => void;
}) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const search = useDebounce(input.trim());
  const query = useProducts({ page: 1, pageSize: 20, search: search || undefined });
  const options = open ? (query.data?.items ?? []) : [];

  const pick = (p: ProductListItem) => {
    onPick(p);
    setInput('');
    setOpen(false);
  };

  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={id}
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            aria-controls={`${id}-list`}
            aria-invalid={invalid}
            autoComplete="off"
            className="h-8 ps-8"
            placeholder={selected?.name || 'Tìm sản phẩm cha theo tên hoặc mã'}
            value={open ? input : (selected?.name ?? input)}
            disabled={disabled}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setInput(e.target.value);
              setActive(0);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && options.length) {
                e.preventDefault();
                setActive((i) => (i + 1) % options.length);
              } else if (e.key === 'ArrowUp' && options.length) {
                e.preventDefault();
                setActive((i) => (i - 1 + options.length) % options.length);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (options[active]) pick(options[active]);
              } else if (e.key === 'Escape') {
                setOpen(false);
              }
            }}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-72 p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if ((e.target as HTMLElement).closest(`#${id}`)) e.preventDefault();
        }}
      >
        <ul id={`${id}-list`} role="listbox" className="max-h-64 overflow-y-auto">
          {query.isFetching && !options.length && (
            <li className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Đang tìm...
            </li>
          )}
          {!query.isFetching && !options.length && (
            <li className="px-2 py-3 text-sm text-muted-foreground">Không tìm thấy sản phẩm</li>
          )}
          {options.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === active}
              className={cn(
                'flex cursor-pointer items-start justify-between gap-4 rounded-sm px-2 py-1.5 text-sm',
                i === active && 'bg-accent text-accent-foreground',
              )}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
            >
              <div className="min-w-0">
                <p className="font-medium">{p.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {p.code} · {p.category.name}
                </p>
              </div>
              <span className="text-xs whitespace-nowrap text-muted-foreground">{p.variantCount} SKU</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
