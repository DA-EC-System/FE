import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

const releaseSchema = z.object({
  reason: z.string().trim().min(1, 'Cần nhập lý do gỡ').max(500, 'Lý do tối đa 500 ký tự'),
});

type ReleaseForm = z.infer<typeof releaseSchema>;

interface ReleaseTaxCodeDialogProps {
  company: Company | null;
  loading: boolean;
  /** Lỗi theo trường từ BE (422) */
  serverError?: string;
  onSubmit: (reason: string) => void;
  onClose: () => void;
}

/**
 * Gỡ mã số thuế khỏi công ty đang giữ mã không phải của mình (commerio-backend#459, Documents/21 mục 2.1),
 * để doanh nghiệp đúng đăng ký được. Bắt buộc có lý do; lý do vào nhật ký nền tảng và thư báo CEO.
 */
export function ReleaseTaxCodeDialog({ company, loading, serverError, onSubmit, onClose }: ReleaseTaxCodeDialogProps) {
  const form = useForm<ReleaseForm>({ resolver: zodResolver(releaseSchema), defaultValues: { reason: '' } });
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
          <DialogTitle>Gỡ mã số thuế của {company?.name}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => onSubmit(v.reason))} noValidate className="grid gap-4">
            <AlertMessage severity="warning">
              Gỡ mã <strong>{company?.taxCode}</strong> khi công ty này giữ mã của doanh nghiệp khác:
              <ul className="mt-1 list-disc ps-5">
                <li>Doanh nghiệp đúng đăng ký Commerio được bằng mã này.</li>
                <li>Công ty vẫn hoạt động bình thường; CEO nhận thư báo kèm lý do và tự nhập mã đúng ở hồ sơ công ty.</li>
                <li>Công ty không tự nhập lại được chính mã vừa gỡ.</li>
              </ul>
            </AlertMessage>
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lý do gỡ</FormLabel>
                  <FormControl>
                    <Textarea rows={3} autoFocus {...field} />
                  </FormControl>
                  <FormDescription>Lý do được ghi vào nhật ký thao tác nền tảng và gửi cho CEO.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                Huỷ
              </Button>
              <Button type="submit" variant="destructive" disabled={loading}>
                {loading ? 'Đang gỡ...' : 'Gỡ mã số thuế'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
