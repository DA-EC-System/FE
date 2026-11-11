import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Tiêu đề ở đầu khung (h2) */
  title: ReactNode;
  /** Phần bên phải tiêu đề: số đếm, nút chọn kỳ, công tắc */
  extra?: ReactNode;
  /** Bỏ đệm thân khung: danh sách, bảng tự kẻ dòng */
  flush?: boolean;
  bodyClassName?: string;
}

/**
 * Khung nội dung theo `.panel` của Test_UI v4 (FE#134): viền 1px, bo 8px, đầu khung cao 46px kẻ vạch dưới.
 * Dùng cho thẻ biểu đồ, danh sách việc, bảng nhỏ trên trang tổng quan và báo cáo.
 */
export function Panel({ title, extra, flush, className, bodyClassName, children, ...rest }: PanelProps) {
  return (
    <section className={cn('min-w-0 rounded-lg border bg-card text-card-foreground', className)} {...rest}>
      <div className="flex min-h-[46px] flex-wrap items-center gap-2 border-b px-4 py-[7px]">
        <h2 className="text-sm font-semibold">{title}</h2>
        {extra && <div className="ms-auto flex flex-wrap items-center gap-2 text-sm font-normal">{extra}</div>}
      </div>
      <div className={cn(!flush && 'p-4', bodyClassName)}>{children}</div>
    </section>
  );
}
