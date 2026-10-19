import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateDelivery } from '@/api/fulfillment.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { DELIVERY_LABELS, deliveryOptions } from '@/features/fulfillment/shared';
import type { DeliveryStatus } from '@/types/fulfillment';
import type { Order } from '@/types/sales';
import { CONFLICT_CODES } from './CancelOrderDialog';

const deliverySchema = z
  .object({
    status: z.enum(['in_transit', 'delivered', 'delivery_failed'], { message: 'Chọn trạng thái giao' }),
    reason: z.string().trim().max(500, 'Lý do tối đa 500 ký tự'),
  })
  .refine((v) => v.status !== 'delivery_failed' || v.reason.length > 0, {
    path: ['reason'],
    message: 'Nhập lý do giao không thành công',
  });

type DeliveryForm = z.input<typeof deliverySchema>;

interface DeliveryDialogProps {
  order: Order;
  open: boolean;
  onClose: () => void;
  onConflict: () => void;
}

/** UC-SF-09 — Cập nhật giao đơn tạo tay, hộp thư (AC-G1, AC-G2) */
export function DeliveryDialog({ order, open, onClose, onConflict }: DeliveryDialogProps) {
  const mutation = useUpdateDelivery();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<DeliveryForm>({
    resolver: zodResolver(deliverySchema),
    defaultValues: { status: undefined, reason: '' },
  });
  const { reset } = form;
  const options = deliveryOptions(order.status);
  const failed = form.watch('status') === 'delivery_failed';

  useEffect(() => {
    if (open) {
      reset({ status: undefined, reason: '' });
      setError(null);
    }
  }, [open, reset]);

  const submit = async (v: DeliveryForm) => {
    setError(null);
    const status = v.status as DeliveryStatus;
    try {
      await mutation.mutateAsync({
        id: order.id,
        version: order.version,
        status,
        reason: status === 'delivery_failed' ? v.reason.trim() : undefined,
      });
      toast.success(`Đã cập nhật đơn ${order.code}: ${DELIVERY_LABELS[status]}`);
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
          <DialogTitle>Cập nhật giao đơn {order.code}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-4">
            {error && <AlertMessage severity="error">{error}</AlertMessage>}
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Trạng thái giao</FormLabel>
                  <FormControl>
                    <RadioGroup value={field.value ?? ''} onValueChange={field.onChange} className="grid gap-2">
                      {options.map((s) => (
                        <div key={s} className="flex items-center gap-2">
                          <RadioGroupItem id={`delivery-${s}`} value={s} />
                          <Label htmlFor={`delivery-${s}`} className="font-normal">
                            {DELIVERY_LABELS[s]}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {failed && (
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lý do</FormLabel>
                    <FormControl>
                      <Textarea rows={3} maxLength={500} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
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
