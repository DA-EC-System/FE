import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Vòng xoay giữa vùng nội dung; `fullScreen` khi chưa có khung trang (đang khôi phục phiên) */
export function PageSpinner({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div
      className={cn('grid place-items-center', fullScreen ? 'min-h-svh' : 'min-h-[60vh]')}
      role="status"
    >
      <Loader2 className="size-8 animate-spin text-primary" aria-label="Đang tải" />
    </div>
  );
}
