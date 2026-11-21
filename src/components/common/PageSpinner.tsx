import { cn } from '@/lib/utils';

/**
 * Chữ báo đang tải giữa vùng nội dung; `fullScreen` khi chưa có khung trang (đang khôi phục phiên).
 * Màu thương hiệu (FE#129).
 */
export function PageSpinner({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div
      className={cn('grid place-content-center justify-items-center gap-2', fullScreen ? 'min-h-svh' : 'min-h-[60vh]')}
      role="status"
    >
      <span className="text-sm text-primary-text">Đang tải…</span>
    </div>
  );
}
