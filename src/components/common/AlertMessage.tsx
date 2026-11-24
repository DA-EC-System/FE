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
  /** Khối báo chặn (vd trình đăng, FE#459): đọc ngay bằng `role="alert"` dù không phải mức lỗi */
  alert?: boolean;
}

/** Thông báo một dòng kèm icon theo mức độ, kiểu .note của Test_UI (thay cho Alert severity của MUI) */
export function AlertMessage({ severity, children, onClose, className, alert }: AlertMessageProps) {
  const Icon = ICON[severity];
  return (
    <Alert
      variant={VARIANT[severity]}
      role={alert || severity === 'error' ? 'alert' : 'status'}
      className={cn(onClose && 'relative pe-10', className)}
    >
      <Icon />
      <AlertDescription>{children}</AlertDescription>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="absolute end-2 top-1.5 rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </Alert>
  );
}
