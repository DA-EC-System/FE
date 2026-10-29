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
import { usePackageCommand } from '@/api/fulfillment.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { DELIVERY_ACTIONS, PACKAGE_ACTION_LABELS, packageButtons } from '@/features/fulfillment/shared';
import { useTransitionActor } from '@/hooks/usePermission';
import type { DeliveryAction, PackageAction, PackageSummary } from '@/types/fulfillment';
import { CONFLICT_CODES } from './CancelOrderDialog';

const deliverySchema = z
  .object({
    action: z.enum(['deliver', 'fail', 'redeliver', 'return'], { message: 'Chọn trạng thái giao' }),
    reason: z.string().trim().max(500, 'Lý do tối đa 500 ký tự'),
  })
  .refine((v) => v.action !== 'fail' || v.reason.length > 0, {
    path: ['reason'],
    message: 'Nhập lý do giao không thành công',
  });

type DeliveryForm = z.input<typeof deliverySchema>;

interface DeliveryDialogProps {
  pkg: PackageSummary;
  open: boolean;
  onClose: () => void;
  onConflict: () => void;
}

/** Giao lại tự giao vẫn gửi `redeliver`; mock chọn nhánh theo kiện */
const toDelivery = (a: PackageAction): DeliveryAction => (a === 'redeliver_self' ? 'redeliver' : (a as DeliveryAction));

/** Cập nhật giao một kiện của đơn tạo tay, hộp thư (sơ đồ D2); đơn sàn lấy trạng thái từ sàn */
export function DeliveryDialog({ pkg, open, onClose, onConflict }: DeliveryDialogProps) {
  const mutation = usePackageCommand();
  const actor = useTransitionActor();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<DeliveryForm>({
    resolver: zodResolver(deliverySchema),
    defaultValues: { action: undefined, reason: '' },
  });
  const { reset } = form;
  const options = packageButtons(pkg, actor).actions.filter((a) => DELIVERY_ACTIONS.includes(a));
  const failed = form.watch('action') === 'fail';

  useEffect(() => {
    if (open) {
      reset({ action: undefined, reason: '' });
      setError(null);
    }
  }, [open, reset]);

  const submit = async (v: DeliveryForm) => {
    setError(null);
    const action = v.action as DeliveryAction;
    try {
      await mutation.mutateAsync({
        id: pkg.id,
        version: pkg.version,
        command: { kind: 'delivery', action, reason: action === 'fail' ? v.reason.trim() : undefined },
      });
      const label = options.find((a) => toDelivery(a) === action);
      toast.success(`Đã cập nhật kiện ${pkg.code}: ${label ? PACKAGE_ACTION_LABELS[label] : ''}`);
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
          <DialogTitle>Cập nhật giao kiện {pkg.code}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-4">
            {error && <AlertMessage severity="error">{error}</AlertMessage>}
            <FormField
              control={form.control}
              name="action"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Trạng thái giao</FormLabel>
                  <FormControl>
                    <RadioGroup value={field.value ?? ''} onValueChange={field.onChange} className="grid gap-2">
                      {options.map((a) => (
                        <div key={a} className="flex items-center gap-2">
                          <RadioGroupItem id={`delivery-${a}`} value={toDelivery(a)} />
                          <Label htmlFor={`delivery-${a}`} className="font-normal">
                            {PACKAGE_ACTION_LABELS[a]}
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
