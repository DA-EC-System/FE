import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/*
 * Nhãn theo .st của Test_UI v4 (Tag có viền của Ant), FE#129: cao 20px, chữ 12px, bo 4px.
 *  - `secondary`, `outline`, `neutral`: mặc định (nền xám nhạt, viền --input)
 *  - `default`, `primary`, `info`: xanh · `success` · `warning` · `destructive`: lỗi · `purple`
 */
const badgeVariants = cva(
  'inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border px-[7px] text-xs leading-[18px] font-normal whitespace-nowrap transition-[color,background-color,border-color] [&>svg]:pointer-events-none [&>svg]:size-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive',
  {
    variants: {
      variant: {
        default: 'border-primary-border bg-accent text-primary-text [a&]:hover:border-primary',
        primary: 'border-primary-border bg-accent text-primary-text [a&]:hover:border-primary',
        secondary: 'border-input bg-table-head text-foreground [a&]:hover:border-primary-hover',
        neutral: 'border-input bg-table-head text-foreground [a&]:hover:border-primary-hover',
        outline: 'border-input bg-table-head text-foreground [a&]:hover:border-primary-hover',
        destructive: 'border-destructive-border bg-destructive-soft text-destructive-text [a&]:hover:border-destructive',
        success: 'border-success-border bg-success-soft text-success-text [a&]:hover:border-success',
        warning: 'border-warning-border bg-warning-soft text-warning-text [a&]:hover:border-warning',
        info: 'border-info-border bg-info-soft text-info-text [a&]:hover:border-info',
        purple: 'border-purple-border bg-purple-soft text-purple-text [a&]:hover:border-purple',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span';

  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
