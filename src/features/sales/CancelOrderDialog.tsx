import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { useCancelOrder } from '@/api/fulfillment.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { isSealed } from '@/lib/machines/order';
import type { Order } from '@/types/sales';

const cancelSchema = z.object({
  reason: z.string().trim().min(1, 'Nhập lý do huỷ').max(500, 'Lý do tối đa 500 ký tự'),
});

type CancelForm = z.infer<typeof cancelSchema>;

/** 409 trạng thái hoặc phiên bản đã đổi: nơi gọi báo và tải lại đơn (AC-A2) */
export const CONFLICT_CODES = ['invalid_transition', 'version_conflict', 'not_allowed_for_source', 'already_handed_over'];

interface CancelOrderDialogProps {
  order: Order;
  open: boolean;
  onClose: () => void;
  onConflict: () => void;
}

/** Huỷ đơn tạo tay, hộp thư khi chưa kiện nào rời kho (sơ đồ D1); lý do bắt buộc */
export function CancelOrderDialog({ order, open, onClose, onConflict }: CancelOrderDialogProps) {
  const mutation = useCancelOrder();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<CancelForm>({ resolver: zodResolver(cancelSchema), defaultValues: { reason: '' } });
  const { reset } = form;
  const sealed = order.packages.filter((p) => isSealed(p.status)).length;

  useEffect(() => {
    if (open) {
      reset({ reason: '' });
      setError(null);
    }
  }, [open, reset]);

  const submit = async ({ reason }: CancelForm) => {
    setError(null);
    try {
      const r = await mutation.mutateAsync({ id: order.id, version: order.version, reason });
      toast.success(
        r.pendingOpen > 0 ? `Đã huỷ đơn ${order.code}, còn ${r.pendingOpen} kiện chờ mở` : `Đã huỷ đơn ${order.code}`,
      );
      onClose();
    } catch (e) {
      const problem = getProblem(e);
      if (problem?.code && CONFLICT_CODES.includes(problem.code)) onConflict();
      else if (problem?.errors?.reason) form.setError('reason', { message: problem.errors.reason });
      else setError(problemMessage(e));
    }
  };

  const loading = mutation.isPending;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !loading && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Huỷ đơn {order.code}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-4">
            <AlertMessage severity="warning">
              Sau khi huỷ:
              <ul className="mt-1 list-disc ps-5">
                <li>Kiện chưa đóng gói huỷ ngay, nhả số hàng đang giữ.</li>
                {sealed > 0 && (
                  <li>
                    {sealed} kiện đã đóng gói phải mở để trả hàng về kệ; đơn mang cờ Đang huỷ tới khi mở xong.
                  </li>
                )}
                {order.paymentMethod === 'prepaid' && (
                  <>
                    <li>Mã thanh toán còn hiệu lực (nếu có) bị huỷ.</li>
                    <li>Đơn đã thanh toán chuyển sang chờ hoàn tiền.</li>
                  </>
                )}
                <li>Không mở lại được đơn đã huỷ.</li>
              </ul>
            </AlertMessage>
            {error && <AlertMessage severity="error">{error}</AlertMessage>}
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lý do huỷ</FormLabel>
                  <FormControl>
                    <Textarea rows={3} autoFocus maxLength={500} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                Đóng
              </Button>
              <Button type="submit" variant="destructive" disabled={loading}>
                {loading ? 'Đang huỷ...' : 'Huỷ đơn'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
