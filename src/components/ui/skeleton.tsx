import { cn } from '@/lib/utils';

/** Khối chờ theo .skel của Test_UI (FE#129): dải sáng chạy ngang (shimmer), tắt khi prefers-reduced-motion */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn(
        'animate-shimmer rounded-sm bg-[linear-gradient(90deg,var(--muted)_0%,var(--border)_50%,var(--muted)_100%)] bg-size-[200%_100%]',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
