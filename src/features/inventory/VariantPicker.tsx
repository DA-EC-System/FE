import { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { useStock } from '@/api/inventory.api';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import type { StockLevel } from '@/types/inventory';
import { formatQty } from './shared';

interface VariantPickerProps {
  /** Biến thể đã có trên phiếu: hiện mờ, không chọn lại */
  taken: Set<string>;
  disabled?: boolean;
  onPick: (level: StockLevel) => void;
}

/** Tìm biến thể đang bán theo tên hoặc SKU để thêm vào phiếu; kèm số khả dụng để lập phiếu xuất */
export function VariantPicker({ taken, disabled, onPick }: VariantPickerProps) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const search = useDebounce(input.trim());
  // Lọc ở BE theo tên hoặc SKU
  const query = useStock({ page: 1, pageSize: 20, search: search || undefined }, { enabled: !disabled && open });
  const options = query.data?.items ?? [];

  const pick = (level: StockLevel) => {
    if (taken.has(level.variantId)) return;
    onPick(level);
    setInput('');
    setActive(0);
  };

  const move = (step: number) => {
    if (!options.length) return;
    setActive((i) => (i + step + options.length) % options.length);
  };

  return (
    <div className="grid max-w-lg gap-1.5">
      <Label htmlFor="variant-picker">Thêm biến thể</Label>
      <Popover open={open && !disabled} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="relative">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="variant-picker"
              role="combobox"
              aria-expanded={open}
              aria-controls="variant-picker-list"
              autoComplete="off"
              className="ps-8"
              placeholder="Tìm theo tên hoặc SKU"
              value={input}
              disabled={disabled}
              onFocus={() => setOpen(true)}
              onClick={() => setOpen(true)}
              onChange={(e) => {
                setInput(e.target.value);
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
            if ((e.target as HTMLElement).closest('#variant-picker')) e.preventDefault();
          }}
        >
          <ul id="variant-picker-list" role="listbox" className="max-h-72 overflow-y-auto">
            {query.isFetching && !options.length && (
              <li className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Đang tìm...
              </li>
            )}
            {!query.isFetching && !options.length && (
              <li className="px-2 py-3 text-sm text-muted-foreground">
                {search ? 'Không tìm thấy biến thể' : 'Gõ tên sản phẩm hoặc SKU'}
              </li>
            )}
            {options.map((o, i) => {
              const isTaken = taken.has(o.variantId);
              return (
                <li
                  key={o.variantId}
                  role="option"
                  aria-selected={i === active}
                  aria-disabled={isTaken}
                  className={cn(
                    'flex cursor-pointer items-start justify-between gap-4 rounded-sm px-2 py-1.5 text-sm',
                    i === active && 'bg-accent text-accent-foreground',
                    isTaken && 'cursor-not-allowed opacity-50',
                  )}
                  onMouseEnter={() => setActive(i)}
                  // Chặn mất focus ô tìm trước khi chọn
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(o)}
                >
                  <div className="min-w-0">
                    <p className="font-medium">{o.sku}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {o.productName}
                      {o.attributesLabel && ` · ${o.attributesLabel}`}
                    </p>
                  </div>
                  <span className="text-xs whitespace-nowrap text-muted-foreground">
                    {isTaken ? 'Đã có trên phiếu' : `Khả dụng ${formatQty(o.available)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
