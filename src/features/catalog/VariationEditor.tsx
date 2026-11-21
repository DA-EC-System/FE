import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, ChevronsUpDown, Loader2, Plus, Trash2, X } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { Attribute, ProductSettings } from '@/types/catalog';
import {
  MAX_AXES,
  MAX_AXIS_NAME,
  MAX_AXIS_VALUE,
  MAX_VARIANTS,
  axisAttribute,
  FACT_KEYS,
  axisErrors,
  draftRows,
  factsOf,
  fillFacts,
  sameText,
  valueError,
  type AxisDraft,
  type FactKey,
  type FactsDraft,
  type VariantDraft,
} from './variantDraft';
import { AxisImagesField } from './AxisImagesField';

const FACT_LABELS: Record<FactKey, string> = {
  standardPrice: 'Giá bán lẻ',
  targetNetPrice: 'Thực nhận mong muốn',
  weightG: 'Cân nặng',
  lengthMm: 'Dài',
  widthMm: 'Rộng',
  heightMm: 'Cao',
};
const SIDES = ['lengthMm', 'widthMm', 'heightMm'] as const;

/** Bảng xem trước chỉ vẽ chừng này dòng; quá thì đằng nào cũng không tạo được */
const MAX_ROWS_SHOWN = MAX_VARIANTS + 20;

interface VariationEditorProps {
  attributes: Attribute[];
  settings: ProductSettings | undefined;
  value: VariantDraft;
  onChange: (draft: VariantDraft) => void;
  /** Lỗi chung khi bấm Tạo, hoặc lỗi `axes`/`variants` của BE */
  error?: string | null;
  /** Lỗi BE theo nhóm (`axes.i.*`) */
  serverAxisErrors?: string[][];
  /** Đã bấm Tạo: hiện mọi lỗi theo nhóm, không đợi rời ô */
  submitted?: boolean;
  loading?: boolean;
  /** Thêm cột giá, cân nặng, kích thước gói vào bảng tổ hợp (form tạo, Documents/21 §5.5) */
  withFacts?: boolean;
  /** Có thì hiện khối ảnh theo phân loại; báo đang tải để form chặn nút Tạo */
  onImagesBusyChange?: (busy: boolean) => void;
  /**
   * Thuộc tính biến thể hợp với danh mục (Documents/21 §5.7 `allowedAttributes`): lên đầu ô chọn; chọn ngoài danh sách
   * chỉ cảnh báo, vẫn lưu. Không có (BE cũ, chưa chọn danh mục) thì không lọc
   */
  allowed?: { ids: string[]; groupName: string };
}

let nextKey = 0;
const newAxis = (): AxisDraft => ({ key: `axis-${++nextKey}`, attributeId: null, name: '', values: [] });

/**
 * Phân loại hàng khi tạo sản phẩm, kiểu seller center (FE#350 phần 3): "+ Thêm thuộc tính biến thể" (tối đa 2), tên chọn
 * thuộc tính có sẵn hoặc tự đặt, giá trị gõ rồi Enter hoặc bấm gợi ý; bảng tổ hợp có tick bỏ và SKU dự kiến.
 * Không thêm nhóm nào thì sản phẩm có một variant "Mặc định".
 */
export function VariationEditor({
  attributes,
  settings,
  value,
  onChange,
  error,
  serverAxisErrors,
  submitted,
  loading,
  withFacts,
  onImagesBusyChange,
  allowed,
}: VariationEditorProps) {
  const [bulk, setBulk] = useState<FactsDraft>({});
  const setFact = (id: string, key: FactKey, text: string) =>
    onChange({ ...value, facts: { ...value.facts, [id]: { ...value.facts?.[id], [key]: text } } });
  const [touched, setTouched] = useState<string[]>([]);
  const errors = axisErrors(value);
  const rows = useMemo(() => draftRows(value, attributes, settings), [value, attributes, settings]);
  const includedCount = rows.filter((r) => r.included).length;
  const tooMany = includedCount > MAX_VARIANTS ? `Tối đa ${MAX_VARIANTS} variant mỗi lần tạo` : null;
  const shownError = tooMany ?? error;

  // Đổi nhóm thì tổ hợp đổi: bỏ danh sách tổ hợp đã loại cho chắc
  const setAxes = (axes: AxisDraft[]) => onChange({ ...value, axes, excluded: [] });
  const updateAxis = (key: string, patch: Partial<AxisDraft>) =>
    setAxes(value.axes.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  const touch = (key: string) => setTouched((t) => (t.includes(key) ? t : [...t, key]));

  const toggleRow = (id: string) =>
    onChange({
      ...value,
      excluded: value.excluded.includes(id) ? value.excluded.filter((x) => x !== id) : [...value.excluded, id],
    });

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Thêm tối đa {MAX_AXES} thuộc tính biến thể (vd Màu sắc, Kích cỡ). Không thêm thì sản phẩm chỉ có một biến thể
        &lsquo;Mặc định&rsquo;. Giá trị mới (màu, cỡ chưa có) gõ thẳng vào đây.
      </p>

      {value.axes.map((axis, i) => {
        const show = submitted || touched.includes(axis.key);
        const server = serverAxisErrors?.[i] ?? [];
        return (
          <AxisCard
            key={axis.key}
            index={i}
            axis={axis}
            attributes={attributes}
            usedIds={value.axes.filter((a) => a.key !== axis.key).flatMap((a) => (a.attributeId ? [a.attributeId] : []))}
            allowed={allowed}
            loading={loading}
            nameError={show ? errors[i]?.name : undefined}
            valuesError={show ? errors[i]?.values : undefined}
            serverErrors={server}
            onChange={(patch) => updateAxis(axis.key, patch)}
            onBlurName={() => touch(axis.key)}
            onRemove={() => setAxes(value.axes.filter((a) => a.key !== axis.key))}
          />
        );
      })}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={value.axes.length >= MAX_AXES}
          title={value.axes.length >= MAX_AXES ? `Tối đa ${MAX_AXES} thuộc tính biến thể` : undefined}
          onClick={() => setAxes([...value.axes, newAxis()])}
        >
          <Plus />
          Thêm thuộc tính biến thể
        </Button>
        {value.axes.length >= MAX_AXES && (
          <span className="ml-2 text-xs text-muted-foreground">Đã đủ {MAX_AXES} thuộc tính biến thể.</span>
        )}
      </div>

      {onImagesBusyChange && <AxisImagesField value={value} onChange={onChange} onBusyChange={onImagesBusyChange} />}

      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="variant-plan">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Variant</TableHead>
              <TableHead>SKU dự kiến</TableHead>
              {withFacts && (
                <>
                  <TableHead>Giá bán lẻ (đ)</TableHead>
                  <TableHead>Thực nhận mong muốn (đ)</TableHead>
                  <TableHead>Cân nặng (g)</TableHead>
                  <TableHead>Dài × rộng × cao gói (mm)</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {withFacts && includedCount > 1 && (
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableCell />
                <TableCell colSpan={2} className="text-sm text-muted-foreground">
                  Điền một lần cho mọi variant
                </TableCell>
                <FactCells
                  values={bulk}
                  label="mọi variant"
                  onChange={(k, t) => setBulk((b) => ({ ...b, [k]: t }))}
                  after={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!FACT_KEYS.some((k) => bulk[k]?.trim())}
                      onClick={() => {
                        onChange(fillFacts(value, bulk));
                        setBulk({});
                      }}
                    >
                      Áp dụng
                    </Button>
                  }
                />
              </TableRow>
            )}
            {rows.slice(0, MAX_ROWS_SHOWN).map((r) => {
              const label = r.options.join(' / ') || 'Mặc định';
              return (
                <TableRow key={r.id || 'default'} className={cn(!r.included && 'opacity-50')}>
                  <TableCell>
                    <Checkbox
                      checked={r.included}
                      disabled={rows.length === 1}
                      onCheckedChange={() => toggleRow(r.id)}
                      aria-label={`Tạo variant ${label}`}
                    />
                  </TableCell>
                  <TableCell>{label}</TableCell>
                  <TableCell className="font-mono">{r.sku ?? (r.included ? 'Đang tải mẫu SKU…' : '—')}</TableCell>
                  {withFacts &&
                    (r.included ? (
                      <FactCells
                        values={value.facts?.[r.id] ?? {}}
                        errors={submitted ? factsOf(value.facts?.[r.id]).errors : undefined}
                        label={label}
                        onChange={(k, t) => setFact(r.id, k, t)}
                      />
                    ) : (
                      <TableCell colSpan={4} />
                    ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {rows.length > MAX_ROWS_SHOWN && (
        <p className="text-xs text-muted-foreground">
          Chỉ hiện {MAX_ROWS_SHOWN} trên {rows.length} variant.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Sẽ tạo <Badge variant="secondary">{includedCount}</Badge> variant. SKU thật cấp khi lưu, có thể lệch bản xem trước
        nếu có người vừa tạo sản phẩm khác hoặc mã giá trị mới bị trùng.
      </p>
      {withFacts && (
        <p className="text-xs text-muted-foreground">
          Ô trống vẫn tạo được; sản phẩm chưa &lsquo;Sẵn sàng&rsquo; tới khi đủ thực nhận mong muốn, cân nặng và kích thước gói.
        </p>
      )}
      {shownError && <AlertMessage severity="error">{shownError}</AlertMessage>}
    </div>
  );
}

/** Bốn ô giá, thực nhận, cân nặng, kích thước của một dòng; lỗi hiện ngay dưới ô */
function FactCells({
  values,
  errors,
  label,
  onChange,
  after,
}: {
  values: FactsDraft;
  errors?: Partial<Record<FactKey, string>>;
  label: string;
  onChange: (key: FactKey, text: string) => void;
  after?: ReactNode;
}) {
  const cell = (k: FactKey, width: string) => (
    <div key={k}>
      <Input
        value={values[k] ?? ''}
        inputMode="numeric"
        className={cn('h-8', width)}
        aria-label={`${FACT_LABELS[k]} ${label}`}
        aria-invalid={Boolean(errors?.[k])}
        onChange={(e) => onChange(k, e.target.value)}
      />
      {errors?.[k] && <p className="mt-0.5 text-xs text-destructive">{errors[k]}</p>}
    </div>
  );
  return (
    <>
      <TableCell>{cell('standardPrice', 'w-28')}</TableCell>
      <TableCell>{cell('targetNetPrice', 'w-28')}</TableCell>
      <TableCell>{cell('weightG', 'w-20')}</TableCell>
      <TableCell>
        <div className="flex items-start gap-1">
          {SIDES.map((k) => cell(k, 'w-16'))}
          {after}
        </div>
      </TableCell>
    </>
  );
}

interface AxisCardProps {
  index: number;
  axis: AxisDraft;
  attributes: Attribute[];
  /** Thuộc tính nhóm kia đang dùng */
  usedIds: string[];
  allowed?: VariationEditorProps['allowed'];
  loading?: boolean;
  nameError?: string;
  valuesError?: string;
  serverErrors: string[];
  onChange: (patch: Partial<AxisDraft>) => void;
  onBlurName: () => void;
  onRemove: () => void;
}

function AxisCard({
  index,
  axis,
  attributes,
  usedIds,
  allowed,
  loading,
  nameError,
  valuesError,
  serverErrors,
  onChange,
  onBlurName,
  onRemove,
}: AxisCardProps) {
  const inputId = useId();
  const [typed, setTyped] = useState('');
  const [typedError, setTypedError] = useState<string | null>(null);
  const attribute = axisAttribute(axis, attributes);
  const label = axis.name.trim() || `Thuộc tính biến thể ${index + 1}`;
  // Giá trị có sẵn của thuộc tính chưa thêm: bấm để thêm nhanh
  const suggestions = (attribute?.values ?? []).filter((v) => !axis.values.some((x) => sameText(x, v.value)));

  const addValue = (text: string) => {
    const problem = valueError(axis, text);
    if (problem) {
      setTypedError(text.trim() ? problem : null);
      return;
    }
    // Giá trị có sẵn thì lấy đúng chữ đã lưu
    const existing = attribute?.values.find((v) => sameText(v.value, text));
    onChange({ values: [...axis.values, existing?.value ?? text.trim()] });
    setTyped('');
    setTypedError(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Không để Enter gửi cả form sản phẩm
      e.preventDefault();
      addValue(typed);
    } else if (e.key === 'Backspace' && !typed && axis.values.length) {
      onChange({ values: axis.values.slice(0, -1) });
    }
  };

  return (
    <div className="grid gap-3 rounded-md border p-3" role="group" aria-label={label}>
      <div className="flex items-start gap-2">
        <div className="grid flex-1 gap-1.5">
          <span className="text-sm font-medium">Tên thuộc tính biến thể {index + 1}</span>
          <AxisNameCombobox
            axis={axis}
            attributes={attributes.filter((a) => !usedIds.includes(a.id))}
            allowed={allowed}
            loading={loading}
            invalid={Boolean(nameError)}
            onPick={(a) => onChange({ attributeId: a.id, name: a.name })}
            onCustom={(name) => onChange({ attributeId: null, name })}
            onClose={onBlurName}
          />
          {nameError ? (
            <p className="text-sm text-destructive">{nameError}</p>
          ) : attribute && allowed && !allowed.ids.includes(attribute.id) ? (
            <p className="text-xs text-warning-text" role="status">
              Thuộc tính này không thuộc danh mục {allowed.groupName}. Vẫn lưu được; sàn có thể không nhận lúc đăng.
            </p>
          ) : (
            axis.name.trim() &&
            !attribute && (
              <p className="text-xs text-muted-foreground">
                Tên tự đặt: lưu thành thuộc tính mới của công ty. Trên sàn, người mua không lọc được theo nhóm này như
                Màu sắc, Kích cỡ chuẩn sàn.
              </p>
            )
          )}
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label={`Bỏ ${label}`} onClick={onRemove} className="mt-6">
          <Trash2 />
        </Button>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium">
          Giá trị
        </label>
        <div
          className={cn(
            'flex min-h-9 flex-wrap items-center gap-1 rounded-md border px-2 py-1',
            (valuesError || typedError) && 'border-destructive',
          )}
        >
          {axis.values.map((v) => (
            <Badge key={v} variant="secondary" className="h-6 gap-1 pr-1">
              {v}
              <button
                type="button"
                aria-label={`Bỏ ${v}`}
                className="rounded-sm hover:bg-muted"
                onClick={() => onChange({ values: axis.values.filter((x) => x !== v) })}
              >
                <X />
              </button>
            </Badge>
          ))}
          <Input
            id={inputId}
            value={typed}
            maxLength={MAX_AXIS_VALUE + 5}
            placeholder={axis.values.length ? 'Thêm giá trị…' : 'Gõ giá trị rồi Enter, vd Đen'}
            aria-label={`Thêm giá trị cho ${label}`}
            aria-invalid={Boolean(valuesError || typedError) || undefined}
            className="h-7 min-w-32 flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
            onChange={(e) => {
              setTyped(e.target.value);
              setTypedError(null);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => typed.trim() && addValue(typed)}
          />
        </div>
        {(typedError || valuesError) && <p className="text-sm text-destructive">{typedError ?? valuesError}</p>}
        {suggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" aria-label={`Giá trị có sẵn của ${label}`}>
            <span className="text-xs text-muted-foreground">Có sẵn:</span>
            {suggestions.map((v) => (
              <button
                key={v.id}
                type="button"
                className="rounded-full border px-2.5 py-0.5 text-xs hover:bg-accent"
                onClick={() => addValue(v.value)}
              >
                + {v.value}
              </button>
            ))}
          </div>
        )}
        {serverErrors.map((m) => (
          <p key={m} className="text-sm text-destructive">
            {m}
          </p>
        ))}
      </div>
    </div>
  );
}

interface AxisNameComboboxProps {
  axis: AxisDraft;
  /** Thuộc tính còn chọn được (bỏ thuộc tính nhóm kia đang dùng) */
  attributes: Attribute[];
  allowed?: VariationEditorProps['allowed'];
  loading?: boolean;
  invalid?: boolean;
  onPick: (attribute: Attribute) => void;
  onCustom: (name: string) => void;
  onClose: () => void;
}

/** Tên nhóm: thuộc tính chuẩn sàn (`platformKind`) lên đầu, rồi thuộc tính của công ty; gõ tên khác là tự đặt */
function AxisNameCombobox({ axis, attributes, allowed, loading, invalid, onPick, onCustom, onClose }: AxisNameComboboxProps) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const name = typed.trim();
  // Có danh sách theo danh mục: hợp danh mục lên đầu theo thứ tự BE, còn lại xếp sau; không có thì chia chuẩn / tự tạo
  const fits = allowed
    ? allowed.ids.flatMap((id) => attributes.filter((a) => a.id === id))
    : [];
  const rest = allowed ? attributes.filter((a) => !allowed.ids.includes(a.id)) : attributes;
  const platform = rest.filter((a) => a.platformKind);
  const own = rest.filter((a) => !a.platformKind);
  const canCustom = name.length > 0 && !attributes.some((a) => sameText(a.name, name));

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setTyped('');
      onClose();
    }
  };

  const item = (a: Attribute) => (
    <CommandItem
      key={a.id}
      value={`${a.name} ${a.id}`}
      onSelect={() => {
        onPick(a);
        close(false);
      }}
    >
      <Check className={cn(axis.attributeId === a.id ? 'opacity-100' : 'opacity-0')} />
      {a.name}
      {a.platformKind && (
        <Badge variant="outline" className="ml-auto">
          Mặc định
        </Badge>
      )}
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={close}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className={cn('w-full justify-between font-normal', !axis.name && 'text-muted-foreground')}
        >
          <span className="truncate">{axis.name || 'Chọn hoặc gõ tên, vd Màu sắc'}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Gõ để tìm hoặc đặt tên…" value={typed} onValueChange={setTyped} maxLength={MAX_AXIS_NAME + 5} />
          <CommandList>
            {loading ? (
              <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground" role="status">
                <Loader2 className="size-4 animate-spin" />
                Đang tải thuộc tính…
              </p>
            ) : (
              <CommandEmpty>Gõ tên để tạo thuộc tính biến thể tự đặt.</CommandEmpty>
            )}
            {fits.length > 0 && <CommandGroup heading={`Hợp với ${allowed?.groupName}`}>{fits.map(item)}</CommandGroup>}
            {platform.length > 0 && (
              <CommandGroup heading={allowed ? 'Mặc định khác (không thuộc danh mục)' : 'Mặc định của hệ thống'}>{platform.map(item)}</CommandGroup>
            )}
            {own.length > 0 && <CommandGroup heading={allowed ? 'Tự tạo khác' : 'Tự tạo'}>{own.map(item)}</CommandGroup>}
            {canCustom && (
              <CommandGroup heading="Tự đặt" forceMount>
                <CommandItem
                  value={`__custom__${name}`}
                  forceMount
                  disabled={name.length > MAX_AXIS_NAME}
                  onSelect={() => {
                    onCustom(name);
                    close(false);
                  }}
                >
                  <Plus />
                  {name.length > MAX_AXIS_NAME ? `Tên tối đa ${MAX_AXIS_NAME} ký tự` : `Dùng tên “${name}”`}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
