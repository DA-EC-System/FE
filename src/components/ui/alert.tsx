import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/*
 * Thông báo theo .note của Test_UI v4, FE#129: nền nhạt + viền cùng tông, chữ màu chính,
 * icon 16px tô màu theo mức (thông tin xanh, thành công, cảnh báo, lỗi).
 */
const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-3 py-2 text-sm text-foreground has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-2.5 [&>svg]:size-4 [&>svg]:translate-y-[3px]',
  {
    variants: {
      variant: {
        default: 'border-input bg-table-head [&>svg]:text-foreground-2',
        destructive: 'border-destructive-border bg-destructive-soft [&>svg]:text-destructive',
        success: 'border-success-border bg-success-soft [&>svg]:text-success',
        warning: 'border-warning-border bg-warning-soft [&>svg]:text-warning',
        info: 'border-info-border bg-info-soft [&>svg]:text-info',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn('col-start-2 line-clamp-1 min-h-4 font-semibold', className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        'col-start-2 grid justify-items-start gap-1 text-sm text-foreground [&_p]:leading-relaxed',
        className,
      )}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
