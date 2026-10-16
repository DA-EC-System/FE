import type { CSSProperties } from 'react';
import logoUrl from '@/assets/logo.png';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  size?: number;
  /**
   * Đặt trên nền tối (panel navy): thêm nền trắng để viền navy của logo không chìm.
   * Bỏ trống thì chỉ thêm nền trắng ở chế độ tối.
   */
  onDark?: boolean;
  className?: string;
}

/** Logo Commerio — dùng chung cho sidebar, trang đăng nhập. */
export function BrandLogo({ size = 32, onDark, className }: BrandLogoProps) {
  const style = {
    width: size,
    height: size,
    '--logo-pad': `${Math.round(size * 0.14)}px`,
  } as CSSProperties;
  return (
    <div
      style={style}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md',
        onDark === undefined && 'dark:bg-white dark:p-(--logo-pad)',
        onDark && 'bg-white p-(--logo-pad)',
        className,
      )}
    >
      <img src={logoUrl} alt="Commerio" className="size-full object-contain" />
    </div>
  );
}
