import { isValidElement, type ComponentType, type ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  /** Một câu nói vì sao trống, vd "Chưa có đơn nào" */
  title: ReactNode;
  /** Câu phụ (tuỳ chọn), vd gợi ý bỏ bộ lọc */
  description?: ReactNode;
  /** Icon lucide (component) hoặc phần tử; mặc định hộp thư */
  icon?: ComponentType<{ className?: string }> | ReactNode;
  /** Nút hành động chính, vd <Button>Tạo đơn</Button> */
  action?: ReactNode;
  /** Gọn hơn khi nằm trong ô bảng hay thẻ nhỏ */
  compact?: boolean;
  className?: string;
}

/** Ô trống dùng chung theo .empty của Test_UI: icon mờ, một câu, nút hành động chính (FE#129) */
export function EmptyState({ title, description, icon = Inbox, action, compact, className }: EmptyStateProps) {
  const size = compact ? 'size-8' : 'size-10';
  // Component lucide là hàm hoặc forwardRef (object có render); chuỗi, số, phần tử thì vẽ nguyên
  const isComponent =
    typeof icon === 'function' || (typeof icon === 'object' && icon !== null && !isValidElement(icon) && 'render' in icon);
  let iconNode: ReactNode = null;
  if (isComponent) {
    const Icon = icon as ComponentType<{ className?: string }>;
    iconNode = <Icon className={size} />;
  } else if (typeof icon === 'string' || typeof icon === 'number') {
    iconNode = <span className={cn('grid place-items-center text-3xl leading-none', size)}>{icon}</span>;
  } else if (isValidElement(icon)) {
    iconNode = icon;
  }
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'grid justify-items-center gap-1.5 px-4 text-center',
        compact ? 'py-6' : 'py-10',
        className,
      )}
    >
      {iconNode && (
        <span aria-hidden className="mb-1 text-faint">
          {iconNode}
        </span>
      )}
      <p className="text-sm text-foreground-2">{title}</p>
      {description && <p className="max-w-[46ch] text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
