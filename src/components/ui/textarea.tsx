import * as React from 'react';
import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-card px-[11px] py-1 text-base transition-[color,border-color,box-shadow] duration-200 ease-ant outline-none placeholder:text-muted-foreground hover:border-primary-hover md:text-sm',
        'disabled:cursor-not-allowed disabled:border-input disabled:bg-muted disabled:text-faint disabled:hover:border-input',
        'focus-visible:border-primary focus-visible:shadow-[var(--focus)] focus-visible:outline-none aria-invalid:border-destructive aria-invalid:focus-visible:shadow-[0_0_0_2px_var(--destructive-border)]',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
