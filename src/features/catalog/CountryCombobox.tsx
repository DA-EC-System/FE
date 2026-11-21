import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { COMMON_COUNTRY_COUNT, countryName, countryOptions } from './countries';

interface CountryComboboxProps {
  /** Mã ISO alpha-2, rỗng là chưa chọn */
  value: string;
  onChange: (code: string) => void;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
}

/** Chọn xuất xứ: gõ tên hoặc mã để lọc, nhóm nước hay gặp ở đầu (commerio-backend#467, ngõ cụt xuất xứ ở trang đẩy) */
export function CountryCombobox({ value, onChange, id, disabled, invalid }: CountryComboboxProps) {
  const [open, setOpen] = useState(false);
  const options = countryOptions();
  const item = (o: { code: string; name: string }) => (
    <CommandItem
      key={o.code}
      value={`${o.name} ${o.code}`}
      onSelect={() => {
        onChange(o.code);
        setOpen(false);
      }}
    >
      {o.name}
      {o.code === value && <span className="ml-auto text-xs text-muted-foreground">Đang chọn</span>}
      <span className="ms-auto font-mono text-xs text-muted-foreground">{o.code}</span>
    </CommandItem>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-label="Quốc gia xuất xứ"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground')}
        >
          <span className="truncate">{value ? countryName(value) : 'Chọn nước'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Gõ tên nước hoặc mã (VN, CN…)" />
          <CommandList>
            <CommandEmpty>Không thấy nước nào.</CommandEmpty>
            <CommandGroup heading="Hay gặp">{options.slice(0, COMMON_COUNTRY_COUNT).map(item)}</CommandGroup>
            <CommandGroup heading="Tất cả">{options.slice(COMMON_COUNTRY_COUNT).map(item)}</CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
