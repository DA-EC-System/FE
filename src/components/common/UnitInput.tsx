import { type ComponentProps, type ReactNode, useId } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Ô nhập có đơn vị nằm trong ô, bên phải ("g", "mm"; commerio-backend#434). Mọi props (kể cả `ref`, `aria-*` do
 * FormControl gắn) chuyển xuống `input`; `className` là của `input`. Đơn vị nối vào `aria-describedby` để trình đọc
 * màn hình đọc được khi nhãn không ghi đơn vị.
 */
export function UnitInput({
  suffix,
  className,
  'aria-describedby': describedBy,
  ...props
}: ComponentProps<typeof Input> & { suffix: ReactNode }) {
  const suffixId = useId();
  return (
    <div className="relative w-full">
      <Input
        className={cn('pr-9', className)}
        aria-describedby={describedBy ? `${describedBy} ${suffixId}` : suffixId}
        {...props}
      />
      <span
        id={suffixId}
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
      >
        {suffix}
      </span>
    </div>
  );
}
