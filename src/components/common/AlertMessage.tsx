import type { ReactNode } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

type Severity = 'error' | 'success' | 'warning' | 'info';

const VARIANT = {
  error: 'destructive',
  success: 'success',
  warning: 'warning',
  info: 'info',
} as const;

interface AlertMessageProps {
  severity: Severity;
  children: ReactNode;
  /** Có thì hiện nút đóng */
  onClose?: () => void;
  className?: string;
}

/** Thông báo một dòng theo mức độ, kiểu .note của Test_UI (thay cho Alert severity của MUI) */
export function AlertMessage({ severity, children, onClose, className }: AlertMessageProps) {
  return (
    <Alert
      variant={VARIANT[severity]}
      role={severity === 'error' ? 'alert' : 'status'}
      className={cn(onClose && 'relative pe-10', className)}
    >
      <AlertDescription>{children}</AlertDescription>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="absolute end-2 top-1.5 rounded-sm px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Đóng
        </button>
      )}
    </Alert>
  );
}
