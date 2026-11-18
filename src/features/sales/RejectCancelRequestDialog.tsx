import { useEffect, useMemo, useState } from 'react';
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
import { useCancelRejectReasons, useCancelRequestDecision } from '@/api/fulfillment.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import type { Order } from '@/types/sales';
import { CONFLICT_CODES } from './CancelOrderDialog';

const REQUIRED = 'Chọn lý do từ chối';

/** Sàn có danh sách lý do thì bắt chọn; danh sách rỗng (Lazada) thì chỉ xác nhận */
const rejectSchema = (needReason: boolean) =>
  z.object({
    rejectReasonId: needReason ? z.string().min(1, REQUIRED) : z.string(),
  });

type RejectForm = z.infer<ReturnType<typeof rejectSchema>>;

interface RejectCancelRequestDialogProps {
  order: Order;
  open: boolean;
  onClose: () => void;
  onConflict: () => void;
}

/**
 * Từ chối khách xin huỷ (§19.3): BE trả lý do từ chối của sàn. Có lý do thì chọn một, không có thì chỉ xác nhận.
 * Sàn không cho từ chối thì hiện câu của sàn.
 */
export function RejectCancelRequestDialog({ order, open, onClose, onConflict }: RejectCancelRequestDialogProps) {
  const reasons = useCancelRejectReasons(order.id, open);
  const mutation = useCancelRequestDecision();
  const [error, setError] = useState<string | null>(null);
  const items = reasons.data?.items ?? [];
  const needReason = items.length > 0;
  const schema = useMemo(() => rejectSchema(needReason), [needReason]);
  const form = useForm<RejectForm>({
    resolver: zodResolver(schema),
    defaultValues: { rejectReasonId: '' },
  });
  const { reset } = form;

  useEffect(() => {
    if (open) {
      reset({ rejectReasonId: '' });
      setError(null);
    }
  }, [open, reset]);

  const submit = async ({ rejectReasonId }: RejectForm) => {
    setError(null);
    try {
      await mutation.mutateAsync({
        id: order.id,
        version: order.version,
        decision: 'reject',
        rejectReasonId: rejectReasonId || undefined,
      });
      toast.success('Đã từ chối yêu cầu huỷ');
      onClose();
    } catch (e) {
      const problem = getProblem(e);
      if (problem?.code && CONFLICT_CODES.includes(problem.code)) onConflict();
      else if (problem?.errors?.rejectReasonId) {
        // BE đòi lý do mà danh sách đang có có thể đã cũ: hỏi lại sàn
        form.setError('rejectReasonId', { message: REQUIRED });
        if (!needReason) void reasons.refetch();
      } else {
        setError(problemMessage(e, 'cancel'));
        if (problem?.code === 'marketplace_rejected') void reasons.refetch();
      }
    }
  };

  const loading = mutation.isPending;
  const rejected = reasons.isError ? problemMessage(reasons.error, 'cancel') : null;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !loading && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Từ chối yêu cầu huỷ {order.code}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-4">
            {rejected && (
              <div data-testid="cancel-rejected">
                <AlertMessage severity="error">{rejected}</AlertMessage>
              </div>
            )}
            {error && <AlertMessage severity="error">{error}</AlertMessage>}
            {reasons.isLoading && <Skeleton className="h-24 w-full" />}
            {reasons.data && !needReason && (
              <p className="text-sm">Từ chối yêu cầu huỷ của khách? Đơn tiếp tục xử lý.</p>
            )}
            {reasons.data && needReason && (
              <FormField
                control={form.control}
                name="rejectReasonId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lý do từ chối (theo sàn)</FormLabel>
                    <FormControl>
                      <RadioGroup value={field.value} onValueChange={field.onChange} aria-label="Lý do từ chối">
                        {items.map((r) => (
                          <div key={r.id} className="flex items-center gap-3">
                            <RadioGroupItem id={`reject-reason-${r.id}`} value={r.id} />
                            <Label htmlFor={`reject-reason-${r.id}`} className="font-normal">
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
            {/* Danh sách rỗng mà BE vẫn đòi lý do: báo ngay dưới câu xác nhận */}
            {reasons.data && !needReason && form.formState.errors.rejectReasonId && (
              <p className="text-sm text-destructive">{form.formState.errors.rejectReasonId.message}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                Đóng
              </Button>
              <Button type="submit" variant="outline" disabled={loading || !reasons.data}>
                {loading ? 'Đang gửi...' : 'Từ chối huỷ'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
