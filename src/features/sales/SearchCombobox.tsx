import { useState, type ReactNode } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface SearchComboboxProps<T> {
  id: string;
  label: string;
  placeholder: string;
  input: string;
  onInputChange: (value: string) => void;
  options: T[];
  fetching: boolean;
  emptyText: string;
  getKey: (option: T) => string;
  /** Lý do không chọn được (vd chưa có giá); null là chọn được */
  disabledReason?: (option: T) => string | null;
  renderOption: (option: T) => ReactNode;
  onPick: (option: T) => void;
  disabled?: boolean;
  invalid?: boolean;
}

/** Ô tìm có danh sách gợi ý, chọn bằng chuột hoặc phím mũi tên + Enter (theo VariantPicker của kho) */
export function SearchCombobox<T>({
  id,
  label,
  placeholder,
  input,
  onInputChange,
  options,
  fetching,
  emptyText,
  getKey,
  disabledReason = () => null,
  renderOption,
  onPick,
  disabled,
  invalid,
}: SearchComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = `${id}-list`;

  const pick = (o: T) => {
    if (disabledReason(o)) return;
    onPick(o);
    setActive(0);
  };
  const move = (step: number) => {
    if (!options.length) return;
    setActive((i) => (i + step + options.length) % options.length);
  };

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Popover open={open && !disabled} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="relative">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={id}
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-invalid={invalid}
              autoComplete="off"
              className="ps-8"
              placeholder={placeholder}
              value={input}
              disabled={disabled}
              onFocus={() => setOpen(true)}
              onClick={() => setOpen(true)}
              onChange={(e) => {
                onInputChange(e.target.value);
                setActive(0);
                setOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setOpen(true);
                  move(1);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  move(-1);
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
          className="w-(--radix-popover-trigger-width) min-w-80 p-1"
          // Giữ con trỏ ở ô tìm khi danh sách mở
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if ((e.target as HTMLElement).closest(`#${id}`)) e.preventDefault();
          }}
        >
          <ul id={listId} role="listbox" className="max-h-72 overflow-y-auto">
            {fetching && !options.length && (
              <li className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Đang tìm...
              </li>
            )}
            {!fetching && !options.length && <li className="px-2 py-3 text-sm text-muted-foreground">{emptyText}</li>}
            {options.map((o, i) => {
              const reason = disabledReason(o);
              return (
                <li
                  key={getKey(o)}
                  role="option"
                  aria-selected={i === active}
                  aria-disabled={Boolean(reason)}
                  className={cn(
                    'flex cursor-pointer items-start justify-between gap-4 rounded-sm px-2 py-1.5 text-sm',
                    i === active && 'bg-accent text-accent-foreground',
                    reason && 'cursor-not-allowed opacity-50',
                  )}
                  onMouseEnter={() => setActive(i)}
                  // Chặn mất focus ô tìm trước khi chọn
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(o)}
                >
                  {renderOption(o)}
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
