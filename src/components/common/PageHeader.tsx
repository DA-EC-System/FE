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

export function PageHeader({
  title,
  subtitle,
  action,
  actionLabel,
  onAction,
  actionIcon,
}: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action ??
        (actionLabel && onAction ? (
          <Button onClick={onAction}>
            {actionIcon}
            {actionLabel}
          </Button>
        ) : null)}
    </div>
  );
}
