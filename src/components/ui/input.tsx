import * as React from 'react';
import { cn } from '@/lib/utils';

/** Ô nhập theo .inp của Test_UI (FE#129): cao 32px, bo 6px, rê chuột viền xanh, focus viền xanh + --focus */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-8 w-full min-w-0 rounded-md border border-input bg-card px-[11px] py-1 text-base transition-[color,border-color,box-shadow] duration-200 ease-ant outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-primary-hover md:text-sm',
        'disabled:cursor-not-allowed disabled:border-input disabled:bg-muted disabled:text-faint disabled:hover:border-input',
        'focus-visible:border-primary focus-visible:shadow-[var(--focus)] focus-visible:outline-none aria-invalid:border-destructive aria-invalid:focus-visible:shadow-[0_0_0_2px_var(--destructive-border)]',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
