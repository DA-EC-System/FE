import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCreateGroup } from '@/api/catalog.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { cn } from '@/lib/utils';
import type { ProductGroup } from '@/types/catalog';
import { SCOPE_TEXT, splitByScope } from './scope';

interface GroupComboboxProps {
  value: string;
  onChange: (groupId: string) => void;
  groups: ProductGroup[];
  /** Nhóm hiện tại của sản phẩm khi danh sách chưa có (chưa nạp xong) */
  fallback?: { id: string; name: string };
  loading?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  /** Tạo nhóm tại chỗ: cần quyền quản lý sản phẩm hoặc nhóm hàng (Documents/21 §5.2, tạo chỉ gửi `name`) */
  canCreate?: boolean;
}

/**
 * Chọn nhóm hàng kiểu seller center: gõ để lọc, không thấy thì "+ Tạo nhóm …" ngay trong danh sách (FE#350).
 * Chia hai mục "Mặc định của hệ thống" và "Tự tạo" (Documents/21 §5.6); nhóm chuẩn đã ẩn không có trong `groups`
 */
export function GroupCombobox({ value, onChange, groups, fallback, loading, disabled, invalid, canCreate }: GroupComboboxProps) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const create = useCreateGroup();
  const name = typed.trim();
  const byScope = splitByScope(groups);
  const selected = groups.find((g) => g.id === value) ?? (fallback?.id === value ? fallback : undefined);
  const canAdd =
    canCreate && name.length > 0 && name.length <= 60 && !groups.some((g) => g.name.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi'));

  const choose = (id: string) => {
    onChange(id);
    setTyped('');
    setOpen(false);
  };

  const add = async () => {
    try {
      const group = await create.mutateAsync({ name });
      toast.success(`Đã tạo nhóm hàng ${group.name}`);
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
          type="button"
          variant="outline"
          role="combobox"
          aria-label="Nhóm hàng"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          disabled={disabled || loading}
          className={cn('w-full justify-between font-normal', !selected && 'text-muted-foreground')}
        >
          <span className="truncate">{loading ? 'Đang tải nhóm hàng…' : (selected?.name ?? 'Chọn nhóm hàng')}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Gõ để tìm hoặc tạo nhóm…" value={typed} onValueChange={setTyped} maxLength={60} />
          <CommandList>
            <CommandEmpty>{canCreate ? 'Gõ tên để tạo nhóm mới.' : 'Không thấy nhóm hàng nào.'}</CommandEmpty>
            {(['company', 'platform'] as const).map((scope) => {
              const rows = byScope[scope];
              return rows.length > 0 ? (
                <CommandGroup key={scope} heading={SCOPE_TEXT[scope].title}>
                  {rows.map((g) => (
                    <CommandItem key={g.id} value={`${g.name} ${g.id}`} onSelect={() => choose(g.id)}>
                      {g.name}
                      {g.id === value && <span className="ml-auto text-xs text-muted-foreground">Đang chọn</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null;
            })}
            {canAdd && (
              <CommandGroup forceMount>
                <CommandItem value={`__new__${name}`} onSelect={add} disabled={create.isPending} forceMount>
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
