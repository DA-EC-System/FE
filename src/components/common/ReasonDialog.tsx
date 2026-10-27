import { useEffect, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';

const reasonSchema = z.object({
  reason: z.string().trim().min(1, 'Nhập lý do').max(500, 'Lý do tối đa 500 ký tự'),
});

type ReasonForm = z.infer<typeof reasonSchema>;

interface ReasonDialogProps {
  open: boolean;
  title: string;
  /** Giải thích hậu quả của thao tác, hiện trên ô lý do */
  message?: ReactNode;
  label?: string;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  /** Lỗi từ API, nơi gọi tự đặt */
  error?: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

/**
 * Hộp thoại bắt buộc ghi lý do (từ chối, trả về, huỷ, đảo bàn giao...). Hộp còn mở trong lúc
 * chờ API; nơi gọi tự đóng khi xong, như ConfirmDialog.
 */
export function ReasonDialog({
  open,
  title,
  message,
  label = 'Lý do',
  confirmLabel = 'Xác nhận',
  destructive = false,
  loading = false,
  error,
  onConfirm,
  onClose,
}: ReasonDialogProps) {
  const form = useForm<ReasonForm>({ resolver: zodResolver(reasonSchema), defaultValues: { reason: '' } });
  const { reset } = form;

  useEffect(() => {
    if (open) reset({ reason: '' });
  }, [open, reset]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !loading && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(({ reason }) => onConfirm(reason))} noValidate className="grid gap-4">
            {message && <AlertMessage severity="warning">{message}</AlertMessage>}
            {error && <AlertMessage severity="error">{error}</AlertMessage>}
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{label}</FormLabel>
                  <FormControl>
                    <Textarea rows={3} autoFocus maxLength={500} data-testid="reason-input" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                Đóng
              </Button>
              <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={loading}>
                {confirmLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
