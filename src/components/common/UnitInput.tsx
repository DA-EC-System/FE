import type { ComponentProps, ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Ô nhập có đơn vị nằm trong ô, bên phải ("g", "mm"; commerio-backend#434). Mọi props (kể cả `ref`, `aria-*` do
 * FormControl gắn) chuyển xuống `input`; `className` là của `input`.
 */
export function UnitInput({ suffix, className, ...props }: ComponentProps<typeof Input> & { suffix: ReactNode }) {
  return (
    <div className="relative w-full">
      <Input className={cn('pr-9', className)} {...props} />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
      >
        {suffix}
      </span>
    </div>
  );
}
