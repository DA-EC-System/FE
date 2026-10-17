import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import type { Company } from '@/types/company';

const lockSchema = z.object({
  reason: z.string().trim().min(1, 'Cần nhập lý do khoá').max(500, 'Lý do tối đa 500 ký tự'),
});

type LockForm = z.infer<typeof lockSchema>;

interface LockCompanyDialogProps {
  company: Company | null;
  loading: boolean;
  /** Lỗi theo trường từ BE (422) */
  serverError?: string;
  onSubmit: (reason: string) => void;
  onClose: () => void;
}

/** UC-PI-08: khoá bắt buộc có lý do, lý do được ghi vào nhật ký nền tảng. */
export function LockCompanyDialog({
  company,
  loading,
  serverError,
  onSubmit,
  onClose,
}: LockCompanyDialogProps) {
  const form = useForm<LockForm>({ resolver: zodResolver(lockSchema), defaultValues: { reason: '' } });
  const { reset, setError } = form;

  useEffect(() => {
    if (company) reset({ reason: '' });
  }, [company, reset]);

  useEffect(() => {
    if (serverError) setError('reason', { message: serverError });
  }, [serverError, setError]);

  return (
    <Dialog open={Boolean(company)} onOpenChange={(next) => !next && !loading && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Khoá công ty {company?.name}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => onSubmit(v.reason))}
            noValidate
            className="grid gap-4"
          >
            <AlertMessage severity="warning">
              Sau khi khoá:
              <ul className="mt-1 list-disc ps-5">
                <li>Nhân viên của công ty không đăng nhập được.</li>
                <li>Dữ liệu từ sàn và cổng thanh toán gửi về vẫn được lưu.</li>
                <li>Ngừng đẩy dữ liệu lên sàn và các tác vụ định kỳ của công ty.</li>
              </ul>
            </AlertMessage>
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lý do khoá</FormLabel>
                  <FormControl>
                    <Textarea rows={3} autoFocus {...field} />
                  </FormControl>
                  <FormDescription>Lý do được ghi vào nhật ký nền tảng.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                Huỷ
              </Button>
              <Button type="submit" variant="destructive" disabled={loading}>
                {loading ? 'Đang khoá...' : 'Khoá công ty'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
