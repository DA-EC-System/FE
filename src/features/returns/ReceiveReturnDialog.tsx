import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useReceiveReturn } from '@/api/returns.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import type { ReceiveResult } from '@/types/returns';
import { MAX_REASON, receiveSchema, type ReceiveForm } from './shared';

/**
 * Kho quét mã trên kiện hàng trả về (mã yêu cầu, mã vận đơn chiều về hoặc mã đơn).
 * Không khớp yêu cầu nào thì kiện vào khu chờ xử lý, gắn cờ cho người xử lý sau.
 */
export function ReceiveReturnDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (result: ReceiveResult) => void;
}) {
  const receive = useReceiveReturn();
  const form = useForm<ReceiveForm>({ resolver: zodResolver(receiveSchema), defaultValues: { code: '', note: '' } });
  const { reset, setError } = form;

  useEffect(() => {
    if (open) {
      reset({ code: '', note: '' });
      receive.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reset]);

  const submit = async (v: ReceiveForm) => {
    try {
      const r = await receive.mutateAsync({ code: v.code, note: v.note || undefined });
      if (r.kind === 'matched') toast.success(`Đã nhận hàng trả ${r.request.code}, phiếu kiểm hàng về đã lập`);
      else toast.warning(`Mã ${r.parcel.code} không khớp yêu cầu nào, kiện vào khu chờ xử lý`);
      onDone(r);
    } catch (e) {
      const errors = getProblem(e)?.errors;
      if (errors?.code) setError('code', { message: errors.code });
      if (errors?.note) setError('note', { message: errors.note });
    }
  };

  const problem = getProblem(receive.error);
  const formError = receive.error && !problem?.errors ? problemMessage(receive.error) : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !receive.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Quét nhận hàng trả</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-4">
            {formError && <AlertMessage severity="error">{formError}</AlertMessage>}
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mã yêu cầu, mã vận đơn chiều về hoặc mã đơn</FormLabel>
                  <FormControl>
                    <Input autoFocus maxLength={100} data-testid="receive-code" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ghi chú (tình trạng kiện)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} maxLength={MAX_REASON} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={receive.isPending}>
                Đóng
              </Button>
              <Button type="submit" disabled={receive.isPending}>
                Nhận hàng
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
