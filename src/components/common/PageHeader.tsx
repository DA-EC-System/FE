import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /** nút primary mặc định — sẽ ẩn nếu action được cung cấp */
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: ReactNode;
}

/** Đầu trang (`.ph-row` của Test_UI): tiêu đề 20px đậm 600, mô tả 14px màu phụ, nút hành động bên phải */
export function PageHeader({
  title,
  subtitle,
  action,
  actionLabel,
  onAction,
  actionIcon,
}: PageHeaderProps) {
  const actionNode =
    action ??
    (actionLabel && onAction ? (
      <Button onClick={onAction}>
        {actionIcon}
        {actionLabel}
      </Button>
    ) : null);

  return (
    <div className="mb-6 flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-xl leading-[1.4] font-semibold break-words text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actionNode && <div className="ms-auto flex flex-wrap items-center gap-2">{actionNode}</div>}
    </div>
  );
}
