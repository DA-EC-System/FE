import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Vòng xoay giữa vùng nội dung; `fullScreen` khi chưa có khung trang (đang khôi phục phiên).
 * Màu thương hiệu, chữ "Đang tải" nhỏ bên dưới như Spin của Ant (FE#129).
 */
export function PageSpinner({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div
      className={cn('grid place-content-center justify-items-center gap-2', fullScreen ? 'min-h-svh' : 'min-h-[60vh]')}
      role="status"
    >
      <Loader2 className="size-8 animate-spin text-primary" aria-label="Đang tải" />
      <span aria-hidden className="text-sm text-primary-text">
        Đang tải
      </span>
    </div>
  );
}
