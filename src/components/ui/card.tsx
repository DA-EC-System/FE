import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * Thẻ theo .panel của Test_UI v4, FE#129: viền --border, bo 8px, không bóng; lề trong 16px.
 * CardHeader đứng đầu thẻ thành đầu thẻ (.panel-h): cao tối thiểu 56px, gạch dưới, tiêu đề 16px đậm,
 * CardAction nằm bên phải. Lớp py-*, gap-* trang đang truyền vẫn dùng được.
 */

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'flex flex-col gap-4 rounded-lg border bg-card py-4 text-card-foreground has-[>[data-slot=card-header]:first-child]:pt-0',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        '@container/card-header grid min-h-14 auto-rows-min content-center items-center gap-x-2 gap-y-0.5 border-b px-4 py-2 has-data-[slot=card-action]:grid-cols-[1fr_auto]',
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('text-base leading-normal font-semibold', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-center justify-self-end text-sm font-normal', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-4', className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center px-4 [.border-t]:pt-4', className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
