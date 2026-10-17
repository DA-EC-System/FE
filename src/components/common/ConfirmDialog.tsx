import type { ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Hộp xác nhận (AlertDialog của shadcn). Nút xác nhận là Button thường chứ không phải
 * AlertDialogAction để hộp còn mở trong lúc chờ API; nơi gọi tự đóng khi xong.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Huỷ',
  destructive = false,
  loading = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !loading && onClose()}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{message}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
