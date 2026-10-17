import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useCreateReturnReceipt } from '@/api/inventory.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { formatDateTime } from '@/utils/format';
import type { ReturnOrder, StockDoc } from '@/types/inventory';
import { formatQty, returnFormSchema, type ReturnFormInput, type ReturnFormOutput } from './shared';

interface ReturnReceiptDialogProps {
  order: ReturnOrder | null;
  onClose: () => void;
  onDone: (doc: StockDoc) => void;
}

const toForm = (order: ReturnOrder): ReturnFormInput => ({
  note: '',
  lines: order.lines.map((l) => ({ variantId: l.variantId, shipped: l.quantity, quantity: String(l.quantity) })),
});

/**
 * UC-IN-03: kiểm hàng hoàn của đơn giao không thành công rồi nhập lại kho.
 * Mặc định số thực nhận bằng số đã xuất; số khác thì phải ghi lý do.
 */
export function ReturnReceiptDialog({ order, onClose, onDone }: ReturnReceiptDialogProps) {
  const mutation = useCreateReturnReceipt();
  const [error, setError] = useState<{ severity: 'warning' | 'error'; msg: string } | null>(null);
  const {
    control,
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors },
  } = useForm<ReturnFormInput, unknown, ReturnFormOutput>({
    resolver: zodResolver(returnFormSchema),
    defaultValues: { note: '', lines: [] },
  });
  const { fields } = useFieldArray({ control, name: 'lines', keyName: 'key' });

  useEffect(() => {
    if (order) {
      reset(toForm(order));
      setError(null);
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, reset]);

  const onSubmit = handleSubmit(async (values) => {
    if (!order) return;
    setError(null);
    try {
      const doc = await mutation.mutateAsync({
        orderId: order.orderId,
        note: values.note,
        lines: values.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      });
      onDone(doc);
    } catch (e) {
      const problem = getProblem(e);
      const fieldErrors = problem?.errors ?? {};
      for (const [path, message] of Object.entries(fieldErrors)) {
        const m = /^lines\.(\d+)\.quantity$/.exec(path);
        if (m) setFieldError(`lines.${Number(m[1])}.quantity`, { message });
        else if (path === 'note') setFieldError('note', { message });
      }
      setError(
        problem?.code === 'already_processed'
          ? {
              severity: 'warning',
              msg: (problem.detail ?? 'Đơn đã được xử lý') + ' Đóng hộp thoại để xem danh sách mới.',
            }
          : { severity: 'error', msg: fieldErrors.lines ?? getErrorMessage(e) },
      );
    }
  });

  const busy = mutation.isPending;
  const linesError = errors.lines?.root?.message ?? errors.lines?.message;

  return (
    <Dialog open={Boolean(order)} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nhập hoàn đơn {order?.orderCode}</DialogTitle>
          {order && (
            <DialogDescription>
              {order.customerName} · vận đơn {order.shipmentCode} · giao không thành công lúc{' '}
              {formatDateTime(order.failedAt)} ({order.failedReason})
            </DialogDescription>
          )}
        </DialogHeader>
        {error && <AlertMessage severity={error.severity}>{error.msg}</AlertMessage>}
        {linesError && <AlertMessage severity="error">{linesError}</AlertMessage>}
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <div className="max-h-80 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Biến thể</TableHead>
                  <TableHead className="text-right">Đã xuất</TableHead>
                  <TableHead className="w-36 text-right">Thực nhận</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((f, i) => {
                  const line = order?.lines[i];
                  const qtyError = errors.lines?.[i]?.quantity?.message;
                  return (
                    <TableRow key={f.key} className="align-top">
                      <TableCell>
                        <p className="font-medium">{line?.sku}</p>
                        <p className="text-xs text-muted-foreground">
                          {line?.productName}
                          {line?.attributesLabel && ` · ${line.attributesLabel}`}
                        </p>
                      </TableCell>
                      <TableCell className="text-right">{formatQty(f.shipped)}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          {...register(`lines.${i}.quantity`)}
                          aria-label={`Thực nhận ${line?.sku ?? ''}`}
                          inputMode="numeric"
                          aria-invalid={Boolean(qtyError)}
                          className="h-8 text-right"
                        />
                        {qtyError && <p className="mt-1 text-xs text-destructive">{qtyError}</p>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="return-note">Ghi chú</Label>
            <Textarea id="return-note" rows={2} aria-invalid={Boolean(errors.note)} {...register('note')} />
            <p className={errors.note ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
              {errors.note?.message ?? 'Bắt buộc khi số thực nhận khác số đã xuất (thiếu, hỏng, thất lạc)'}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Đóng
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Đang lập...' : 'Lập phiếu nhập hoàn'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
