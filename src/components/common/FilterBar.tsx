import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** Hàng bộ lọc phía trên bảng */
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-col flex-wrap gap-3 p-4 md:flex-row md:items-end">{children}</div>;
}

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder, className }: SearchInputProps) {
  return (
    <div className={cn('relative md:w-72', className)}>
      <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="ps-8"
      />
    </div>
  );
}

// Select của Radix không nhận value rỗng, nên "Tất cả" dùng giá trị riêng
const ALL = '__all__';

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  allLabel?: string;
  className?: string;
}

/** Ô chọn một giá trị lọc; chuỗi rỗng là không lọc */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = 'Tất cả',
  className,
}: FilterSelectProps) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
        <SelectTrigger className="w-full md:min-w-40" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface DateFilterProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
}

/** Ngày dạng yyyy-mm-dd như `from`/`to` của API (C6) */
export function DateFilter({ label, value, onChange, min, max }: DateFilterProps) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="date"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="md:w-40"
      />
    </div>
  );
}
