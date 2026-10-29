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
import { Skeleton } from '@/components/ui/skeleton';
import { useCancelReasons, usePlatformCancel } from '@/api/fulfillment.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { isSealed } from '@/lib/machines/order';
import type { Order } from '@/types/sales';
import { CONFLICT_CODES } from './CancelOrderDialog';

const platformCancelSchema = z.object({
  reasonId: z.string().min(1, 'Chọn lý do huỷ'),
});

type PlatformCancelForm = z.infer<typeof platformCancelSchema>;

interface PlatformCancelDialogProps {
  order: Order;
  open: boolean;
  onClose: () => void;
  onConflict: () => void;
}

/**
 * Huỷ đơn sàn (§19.3): BE hỏi sàn đơn còn huỷ được không rồi trả danh sách lý do của sàn.
 * Sàn không cho thì hiện câu của sàn, không cho chọn lý do.
 */
export function PlatformCancelDialog({ order, open, onClose, onConflict }: PlatformCancelDialogProps) {
  const reasons = useCancelReasons(order.id, open);
  const mutation = usePlatformCancel();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<PlatformCancelForm>({
    resolver: zodResolver(platformCancelSchema),
    defaultValues: { reasonId: '' },
  });
  const { reset } = form;
  const sealed = order.packages.filter((p) => isSealed(p.status)).length;

  useEffect(() => {
    if (open) {
      reset({ reasonId: '' });
      setError(null);
    }
  }, [open, reset]);

  const submit = async ({ reasonId }: PlatformCancelForm) => {
    setError(null);
    try {
      const r = await mutation.mutateAsync({ id: order.id, version: order.version, reasonId });
      toast.success(
        r.pendingOpen > 0 ? `Đã huỷ đơn ${order.code} trên sàn, còn ${r.pendingOpen} kiện chờ mở` : `Đã huỷ đơn ${order.code} trên sàn`,
      );
      onClose();
    } catch (e) {
      const problem = getProblem(e);
      if (problem?.code && CONFLICT_CODES.includes(problem.code)) onConflict();
      else if (problem?.errors?.reasonId) form.setError('reasonId', { message: problem.errors.reasonId });
      else setError(problemMessage(e));
    }
  };

  const loading = mutation.isPending;
  const rejected = reasons.isError ? problemMessage(reasons.error) : null;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !loading && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Huỷ đơn sàn {order.code}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-4">
            <AlertMessage severity="warning">
              Đơn huỷ trên sàn, không mở lại được.
              {sealed > 0 && ` ${sealed} kiện đã đóng gói phải mở để trả hàng về kệ.`}
            </AlertMessage>
            {rejected && (
              <div data-testid="cancel-rejected">
                <AlertMessage severity="error">{rejected}</AlertMessage>
              </div>
            )}
            {error && <AlertMessage severity="error">{error}</AlertMessage>}
            {reasons.isLoading && <Skeleton className="h-24 w-full" />}
            {reasons.data && (
              <FormField
                control={form.control}
                name="reasonId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lý do huỷ (theo sàn)</FormLabel>
                    <FormControl>
                      <RadioGroup value={field.value} onValueChange={field.onChange} aria-label="Lý do huỷ">
                        {reasons.data.items.map((r) => (
                          <div key={r.id} className="flex items-center gap-3">
                            <RadioGroupItem id={`reason-${r.id}`} value={r.id} />
                            <Label htmlFor={`reason-${r.id}`} className="font-normal">
                              {r.label}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
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
              <Button type="submit" variant="destructive" disabled={loading || !reasons.data}>
                {loading ? 'Đang huỷ...' : 'Huỷ đơn'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
