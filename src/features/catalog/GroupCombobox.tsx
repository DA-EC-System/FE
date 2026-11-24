import { useState } from 'react';
import { Check, ChevronsUpDown, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCreateGroup } from '@/api/catalog.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { cn } from '@/lib/utils';
import type { ProductGroup } from '@/types/catalog';
import { GROUP_SCOPE_HEADINGS, splitByScope } from './scope';

interface GroupComboboxProps {
  value: string;
  onChange: (groupId: string) => void;
  groups: ProductGroup[];
  /** Danh mục hiện tại của sản phẩm khi danh sách chưa có (chưa nạp xong) */
  fallback?: { id: string; name: string };
  loading?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  /** Tạo danh mục tại chỗ: cần quyền quản lý sản phẩm hoặc danh mục sản phẩm (Documents/21 §5.2, tạo chỉ gửi `name`) */
  canCreate?: boolean;
  /** Ô lọc: thêm dòng "Tất cả" ở đầu, chọn thì trả chuỗi rỗng */
  allLabel?: string;
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  className?: string;
}

/**
 * Chọn danh mục sản phẩm kiểu seller center: gõ để lọc, không thấy thì "+ Tạo danh mục …" ngay trong danh sách
 * (FE#350). Chia hai mục "Danh mục mặc định" và "Danh mục tự tạo" (Documents/21 §5.6, FE#474)
 */
export function GroupCombobox({
  value,
  onChange,
  groups,
  fallback,
  loading,
  disabled,
  invalid,
  canCreate,
  allLabel,
  id,
  'aria-label': ariaLabel = 'Danh mục sản phẩm',
  'aria-describedby': describedBy,
  className,
}: GroupComboboxProps) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const create = useCreateGroup();
  const name = typed.trim();
  const byScope = splitByScope(groups);
  const selected = groups.find((g) => g.id === value) ?? (fallback?.id === value ? fallback : undefined);
  const canAdd =
    canCreate && name.length > 0 && name.length <= 60 && !groups.some((g) => g.name.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi'));
  const shown = loading ? 'Đang tải danh mục sản phẩm…' : (selected?.name ?? (allLabel && !value ? allLabel : 'Chọn danh mục sản phẩm'));

  const choose = (next: string) => {
    onChange(next);
    setTyped('');
    setOpen(false);
  };

  const add = async () => {
    try {
      const group = await create.mutateAsync({ name });
      toast.success(`Đã tạo danh mục sản phẩm ${group.name}`);
      choose(group.id);
    } catch (e) {
      const problem = getProblem(e);
      toast.error(problem?.errors?.name ?? problemMessage(e));
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-label={ariaLabel}
          aria-describedby={describedBy}
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          aria-busy={loading || undefined}
          disabled={disabled || loading}
          className={cn('w-full justify-between font-normal', !selected && !(allLabel && !value) && 'text-muted-foreground', className)}
        >
          <span className="truncate">{shown}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-56 p-0" align="start">
        <Command>
          <CommandInput
            placeholder={canCreate ? 'Gõ để tìm hoặc tạo danh mục…' : 'Gõ để tìm danh mục…'}
            value={typed}
            onValueChange={setTyped}
            maxLength={60}
          />
          <CommandList>
            <CommandEmpty>{canCreate ? 'Gõ tên để tạo danh mục mới.' : 'Không thấy danh mục sản phẩm nào.'}</CommandEmpty>
            {allLabel && (
              <CommandGroup>
                <CommandItem value={`__all__ ${allLabel}`} onSelect={() => choose('')}>
                  <Check className={cn(!value ? 'opacity-100' : 'opacity-0')} />
                  {allLabel}
                </CommandItem>
              </CommandGroup>
            )}
            {(['company', 'platform'] as const).map((scope) => {
              const rows = byScope[scope];
              return rows.length > 0 ? (
                <CommandGroup key={scope} heading={GROUP_SCOPE_HEADINGS[scope]}>
                  {rows.map((g) => (
                    <CommandItem key={g.id} value={`${g.name} ${g.id}`} onSelect={() => choose(g.id)}>
                      <Check className={cn(g.id === value ? 'opacity-100' : 'opacity-0')} />
                      {g.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null;
            })}
            {canAdd && (
              <CommandGroup forceMount>
                <CommandItem value={`__new__${name}`} onSelect={add} disabled={create.isPending} forceMount>
                  {create.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
                  {create.isPending ? `Đang tạo danh mục “${name}”…` : `Tạo danh mục “${name}”`}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
