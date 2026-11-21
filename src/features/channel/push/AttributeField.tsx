import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlatformCascade } from '@/api/shops.api';
import { problemMessage } from '@/api/problemMessages';
import { cn } from '@/lib/utils';
import type { CascadeOption, PlatformAttribute, SpecValue } from '@/types/shop';
import { cascadeLevels, cascadePath, valueLabel } from '../specDraft';

/** Danh sách ngắn, không cho giá trị riêng: dùng Select; dài hơn thì ô tìm */
const SHORT_LIST = 15;
const NONE = '__none__';

interface FieldProps {
  attribute: PlatformAttribute;
  value: SpecValue | null;
  onChange: (value: SpecValue | null) => void;
  /** id của ô để nhảy tới từ dòng "còn thiếu" */
  inputId: string;
  invalid: boolean;
  platform: string;
  externalId: string;
  /** Gian hàng Lazada gửi kèm route cascade (cần token gian hàng) */
  shopId: string | null;
}

/** Ô nhập một attribute của sàn theo `input` (Documents/21 §18.5) */
export function AttributeField(props: FieldProps) {
  const { attribute: a } = props;
  switch (a.input) {
    case 'select':
      return a.options.length && !a.allowCustom && a.options.length <= SHORT_LIST ? <ShortSelect {...props} /> : <OptionPicker {...props} />;
    case 'multiselect':
      return <OptionPicker {...props} multiple />;
    case 'cascade':
      return <CascadeField {...props} />;
    case 'image':
      return <p className="text-sm text-muted-foreground">Ảnh tải ở trang sản phẩm, không nhập ở đây.</p>;
    default:
      return (
        <Input
          id={props.inputId}
          type={a.input === 'number' ? 'number' : a.input === 'date' ? 'date' : 'text'}
          value={typeof props.value === 'string' ? props.value : ''}
          onChange={(e) => props.onChange(e.target.value)}
          aria-invalid={props.invalid || undefined}
          placeholder={a.defaultValue ?? undefined}
        />
      );
  }
}

function ShortSelect({ attribute: a, value, onChange, inputId, invalid }: FieldProps) {
  return (
    <Select value={typeof value === 'string' && value ? value : NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
      <SelectTrigger id={inputId} className="w-full" aria-invalid={invalid || undefined}>
        <SelectValue placeholder="Chọn…" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Chưa chọn</SelectItem>
        {a.options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Chọn một hoặc nhiều giá trị trong danh sách dài của sàn, có ô lọc; `allowCustom` thì nhận giá trị gõ tay */
function OptionPicker({ attribute: a, value, onChange, inputId, invalid, multiple }: FieldProps & { multiple?: boolean }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const picked = Array.isArray(value) ? value : value ? [value] : [];
  const choose = (id: string) => {
    if (!multiple) {
      onChange(id);
      setOpen(false);
    } else onChange(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
    setTyped('');
  };
  const custom = typed.trim();
  const canCustom = (a.allowCustom || !a.options.length) && custom && !a.options.some((o) => o.label.toLowerCase() === custom.toLowerCase());
  return (
    <div className="grid gap-1.5">
      {multiple && picked.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {picked.map((id) => (
            <Badge key={id} variant="secondary" className="h-6 gap-1 pr-1">
              {valueLabel(a, id)}
              <button type="button" aria-label={`Bỏ ${valueLabel(a, id)}`} onClick={() => choose(id)} className="rounded-sm hover:bg-muted">
                Bỏ
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={inputId}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid || undefined}
            className={cn('w-full justify-between font-normal', !picked.length && 'text-muted-foreground')}
          >
            <span className="truncate">{!multiple && picked.length ? valueLabel(a, picked[0]) : multiple && picked.length ? 'Thêm giá trị…' : 'Chọn…'}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder="Gõ để lọc…" value={typed} onValueChange={setTyped} />
            <CommandList>
              <CommandEmpty>{a.allowCustom ? 'Không có trong danh sách của sàn.' : 'Không thấy giá trị nào.'}</CommandEmpty>
              {canCustom && (
                <CommandGroup heading="Giá trị riêng">
                  <CommandItem value={`__custom__${custom}`} onSelect={() => choose(custom)}>
                    Dùng “{custom}”
                  </CommandItem>
                </CommandGroup>
              )}
              {a.options.length > 0 && (
                <CommandGroup heading={`Giá trị của sàn (${a.options.length})`}>
                  {a.options.map((o) => (
                    <CommandItem key={o.id} value={`${o.label} ${o.id}`} onSelect={() => choose(o.id)}>
                      {o.label}
                      {picked.includes(o.id) && <span className="ml-auto text-xs text-muted-foreground">Đã chọn</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {!multiple && picked.length > 0 && (
        <button type="button" className="justify-self-start text-xs text-muted-foreground underline" onClick={() => onChange(null)}>
          Bỏ chọn
        </button>
      )}
    </div>
  );
}

/**
 * Attribute cascade (Lazada propCascade): chọn từng cấp, cấp sau lấy từ `GET …/cascade?code&path&shopId` tới khi gặp
 * giá trị `leaf`; spec lưu `path` của các cấp đã chọn (Documents/21 §18.5, chốt 19/11/2026). Chưa tới leaf thì ô còn trống
 */
function CascadeField({ attribute: a, value, onChange, inputId, invalid, platform, externalId, shopId }: FieldProps) {
  const [chain, setChain] = useState<CascadeOption[]>([]);
  const done = chain.at(-1)?.leaf === true;
  const path = cascadePath(chain.map((c) => c.id));
  const level = usePlatformCascade(platform, externalId, a.code, path, shopId, !done);
  const reset = () => {
    setChain([]);
    onChange(null);
  };
  // Giá trị đã lưu (path) mà chưa chọn lại ở phiên này: sàn không trả nhãn theo path nên hiện mã các cấp
  if (typeof value === 'string' && value && !chain.length) {
    return (
      <div className="flex items-center gap-2 text-sm" id={inputId}>
        <span>
          Đã chọn: <b>{cascadeLevels(value).join(' › ')}</b>
        </span>
        <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={reset}>
          Chọn lại
        </Button>
      </div>
    );
  }
  const pick = (id: string) => {
    const hit = level.data?.items.find((x) => x.id === id);
    if (!hit) return;
    const next = [...chain, hit];
    setChain(next);
    onChange(hit.leaf ? cascadePath(next.map((c) => c.id)) : null);
  };
  return (
    <div className="grid gap-1.5" id={inputId} aria-invalid={invalid || undefined}>
      {chain.length > 0 && (
        <p className="text-sm">
          {chain.map((c) => c.label).join(' › ')}{' '}
          <button type="button" className="text-xs text-muted-foreground underline" onClick={reset}>
            Chọn lại
          </button>
        </p>
      )}
      {done ? (
        <p className="text-xs text-success-text">Đã chọn tới cấp cuối.</p>
      ) : level.isLoading ? (
        <Skeleton className="h-9 w-full" />
      ) : level.isError ? (
        <p className="text-sm text-destructive-text">{problemMessage(level.error)}</p>
      ) : level.data?.items.length ? (
        <Select value="" onValueChange={pick}>
          <SelectTrigger className="w-full" aria-label={level.data.prop?.label ?? `Cấp ${chain.length + 1}`}>
            <SelectValue placeholder={`${level.data.prop?.label ?? `Cấp ${chain.length + 1}`}…`} />
          </SelectTrigger>
          <SelectContent>
            {level.data.items.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p className="text-sm text-muted-foreground">Sàn không trả giá trị nào.</p>
      )}
      {chain.length > 0 && !done && <p className="text-xs text-warning-text">Chọn tiếp tới cấp cuối mới lưu được.</p>}
    </div>
  );
}
