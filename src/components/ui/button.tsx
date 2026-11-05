import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/*
 * Nút theo .btn của Test_UI v4 (Ant Design 5), FE#129:
 *  - `default`/`primary`: nút chính nền xanh, rê chuột --primary-hover, bấm --primary-active.
 *    `default` giữ nghĩa nút chính như shadcn để các trang cũ (<Button> không variant) không đổi vai.
 *  - `outline`: nút thường của Test_UI (.btn) nền trắng viền --input, rê chuột chữ và viền xanh.
 *  - `ghost`, `link`, `secondary` (nền xám nhạt), `destructive`/`danger` (nút nguy hiểm nền đỏ).
 *  - Cỡ 32px, `sm` 24px, `lg` 40px; nút bị khoá nền xám nhạt chữ mờ, không dùng opacity.
 *  - Focus bàn phím: viền 2px màu thương hiệu cách 2px như :focus-visible của Test_UI.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent text-sm font-normal transition-[color,background-color,border-color,box-shadow] duration-200 ease-ant [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:border-input disabled:bg-muted disabled:text-faint disabled:shadow-none aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          'border-primary bg-primary text-primary-foreground shadow-primary hover:border-primary-hover hover:bg-primary-hover active:border-primary-active active:bg-primary-active',
        primary:
          'border-primary bg-primary text-primary-foreground shadow-primary hover:border-primary-hover hover:bg-primary-hover active:border-primary-active active:bg-primary-active',
        // Bản tối: --destructive-hover (#e86e6b) với chữ trắng chỉ đạt 3.06:1, nên rê chuột làm đậm nền thay vì sáng lên
        destructive:
          'border-destructive bg-destructive text-white shadow-xs hover:border-destructive-hover hover:bg-destructive-hover focus-visible:outline-destructive dark:hover:border-transparent dark:hover:bg-destructive/80',
        danger:
          'border-destructive bg-destructive text-white shadow-xs hover:border-destructive-hover hover:bg-destructive-hover focus-visible:outline-destructive dark:hover:border-transparent dark:hover:bg-destructive/80',
        outline:
          'border-input bg-card text-foreground shadow-xs hover:border-primary-hover hover:text-primary-hover active:border-primary-active active:text-primary-active',
        secondary:
          'bg-muted text-secondary-foreground hover:bg-fill active:bg-fill disabled:border-transparent',
        ghost:
          'bg-transparent text-foreground hover:bg-muted active:bg-fill disabled:border-transparent disabled:bg-transparent',
        link: 'bg-transparent text-primary-text underline-offset-4 hover:text-primary-hover hover:underline active:text-primary-active disabled:border-transparent disabled:bg-transparent',
      },
      size: {
        default: 'h-8 px-[15px] has-[>svg]:px-3',
        sm: 'h-6 gap-1.5 rounded-sm px-[7px]',
        lg: 'h-10 rounded-lg px-[15px] text-base',
        icon: 'size-8',
        'icon-sm': 'size-6 rounded-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
