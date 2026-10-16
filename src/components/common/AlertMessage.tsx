import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

type Severity = 'error' | 'success' | 'warning' | 'info';

const VARIANT = {
  error: 'destructive',
  success: 'success',
  warning: 'warning',
  info: 'info',
} as const;

const ICON = { error: CircleAlert, success: CircleCheck, warning: TriangleAlert, info: Info };

interface AlertMessageProps {
  severity: Severity;
  children: ReactNode;
  /** Có thì hiện nút đóng */
  onClose?: () => void;
  className?: string;
}

/** Thông báo một dòng kèm icon theo mức độ (thay cho Alert severity của MUI) */
export function AlertMessage({ severity, children, onClose, className }: AlertMessageProps) {
  const Icon = ICON[severity];
  return (
    <Alert
      variant={VARIANT[severity]}
      role={severity === 'error' ? 'alert' : 'status'}
      className={cn(onClose && 'relative pe-10', className)}
    >
      <Icon />
      <AlertDescription>{children}</AlertDescription>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="absolute end-2 top-2 rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100"
        >
          <X className="size-4" />
        </button>
      )}
    </Alert>
  );
}
