import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useSetInvoiceNumber } from '@/api/sales.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import type { Order } from '@/types/sales';
import { CONFLICT_CODES } from './CancelOrderDialog';

const invoiceSchema = z.object({
  invoiceNumber: z.string().trim().min(1, 'Nhập số hoá đơn').max(50, 'Số hoá đơn tối đa 50 ký tự'),
});

type InvoiceForm = z.infer<typeof invoiceSchema>;

interface InvoiceNumberDialogProps {
  order: Order;
  open: boolean;
  onClose: () => void;
  onConflict: () => void;
}

/** Nhập số hoá đơn (§19.3); đơn sàn BE gửi lên sàn */
export function InvoiceNumberDialog({ order, open, onClose, onConflict }: InvoiceNumberDialogProps) {
  const mutation = useSetInvoiceNumber();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<InvoiceForm>({ resolver: zodResolver(invoiceSchema), defaultValues: { invoiceNumber: '' } });
  const { reset } = form;

  useEffect(() => {
    if (open) {
      reset({ invoiceNumber: order.invoiceNumber ?? '' });
      setError(null);
    }
  }, [open, reset, order.invoiceNumber]);

  const submit = async ({ invoiceNumber }: InvoiceForm) => {
    setError(null);
    try {
      await mutation.mutateAsync({ id: order.id, version: order.version, invoiceNumber });
      toast.success(`Đã lưu số hoá đơn ${invoiceNumber}`);
      onClose();
    } catch (e) {
      const problem = getProblem(e);
      if (problem?.code && CONFLICT_CODES.includes(problem.code)) onConflict();
      else if (problem?.errors?.invoiceNumber) form.setError('invoiceNumber', { message: problem.errors.invoiceNumber });
      else setError(problemMessage(e));
    }
  };

  const loading = mutation.isPending;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !loading && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Số hoá đơn đơn {order.code}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-4">
            {error && <AlertMessage severity="error">{error}</AlertMessage>}
            <FormField
              control={form.control}
              name="invoiceNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Số hoá đơn</FormLabel>
                  <FormControl>
                    <Input autoFocus maxLength={50} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                Đóng
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Đang lưu...' : 'Lưu'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
