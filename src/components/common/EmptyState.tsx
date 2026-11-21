import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  /** Một câu nói vì sao trống, vd "Chưa có đơn nào" */
  title: ReactNode;
  /** Câu phụ (tuỳ chọn), vd gợi ý bỏ bộ lọc */
  description?: ReactNode;
  /** Không còn hiển thị (UI chỉ dùng chữ); giữ làm prop tuỳ chọn để chỗ gọi cũ không vỡ type */
  icon?: unknown;
  /** Nút hành động chính, vd <Button>Tạo đơn</Button> */
  action?: ReactNode;
  /** Gọn hơn khi nằm trong ô bảng hay thẻ nhỏ */
  compact?: boolean;
  className?: string;
}

/** Ô trống dùng chung theo .empty của Test_UI: một câu, nút hành động chính (FE#129) */
export function EmptyState({ title, description, action, compact, className }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'grid justify-items-center gap-1.5 px-4 text-center',
        compact ? 'py-6' : 'py-10',
        className,
      )}
    >
      <p className="text-sm text-foreground-2">{title}</p>
      {description && <p className="max-w-[46ch] text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
