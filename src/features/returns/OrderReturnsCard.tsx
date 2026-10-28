import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Undo2 } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Money } from '@/components/common/Money';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useCreateReturn, useReturnable, useReturns } from '@/api/returns.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useCan } from '@/hooks/usePermission';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import type { Order } from '@/types/sales';
import type { ReturnableLine } from '@/types/returns';
import {
  CLOSE_RESULT_LABELS,
  MAX_REASON,
  RETURN_STATUS,
  createReturnSchema,
  type CreateReturnInputForm,
  type CreateReturnOutput,
} from './shared';

/** Khối Yêu cầu trả trên chi tiết đơn: danh sách yêu cầu của đơn, lập yêu cầu cho đơn tạo tay */
export function OrderReturnsCard({ order, companyId }: { order: Order; companyId: string }) {
  const can = useCan();
  const canView = can(PERMISSIONS.returnView);
  // Đơn sàn: yêu cầu do sàn đẩy về, không lập tay
  const canCreate = can(PERMISSIONS.returnProcess) && order.source !== 'marketplace' && order.status !== 'cancelled';
  const list = useReturns({ orderId: order.id, pageSize: 100 }, { enabled: canView });
  const returnable = useReturnable(order.id, canCreate);
  const [creating, setCreating] = useState(false);
  const items = list.data?.items ?? [];
  const hasReturnable = (returnable.data ?? []).some((l) => l.returnable > 0);

  if (!canView || (items.length === 0 && !(canCreate && hasReturnable))) return null;

  return (
    <Card className="py-4" data-testid="order-returns">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Yêu cầu trả ({items.length})</CardTitle>
        {canCreate && hasReturnable && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Undo2 />
            Tạo yêu cầu trả
          </Button>
        )}
      </CardHeader>
      {items.length > 0 && (
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Mã</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="w-20 text-right">Số trả</TableHead>
                <TableHead className="w-32 text-right">Tiền hoàn</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.id} data-row-id={r.code}>
                  <TableCell>
                    <Link className="text-primary underline-offset-4 hover:underline" to={ROUTES.company.returnRequest(companyId, r.id)}>
                      {r.code}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={r.status} statuses={RETURN_STATUS} />
                      {r.closeResult && <span className="text-xs text-muted-foreground">{CLOSE_RESULT_LABELS[r.closeResult]}</span>}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{r.totalQty}</TableCell>
                  <TableCell className="text-right">
                    <Money value={r.refundAmount} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      )}
      {creating && returnable.data && (
        <CreateReturnDialog
          order={order}
          lines={returnable.data}
          onClose={() => setCreating(false)}
          onCreated={() => setCreating(false)}
        />
      )}
    </Card>
  );
}

function CreateReturnDialog({
  order,
  lines,
  onClose,
  onCreated,
}: {
  order: Order;
  lines: ReturnableLine[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const create = useCreateReturn();
  const rows = lines.filter((l) => l.returnable > 0);
  const form = useForm<CreateReturnInputForm, unknown, CreateReturnOutput>({
    resolver: zodResolver(createReturnSchema),
    defaultValues: {
      reason: '',
      lines: rows.map((l) => ({ variantId: l.variantId, returnable: l.returnable, quantity: '0' })),
    },
  });
  const { fields } = useFieldArray({ control: form.control, name: 'lines' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => create.reset(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (v: CreateReturnOutput) => {
    setError(null);
    const picked = v.lines.map((l, index) => ({ ...l, index })).filter((l) => l.quantity > 0);
    try {
      const r = await create.mutateAsync({
        orderId: order.id,
        reason: v.reason,
        lines: picked.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      });
      toast.success(`Đã lập yêu cầu trả ${r.code}`);
      onCreated();
    } catch (e) {
      const errors = getProblem(e)?.errors;
      if (!errors) return setError(problemMessage(e));
      for (const [key, message] of Object.entries(errors)) {
        const m = /^lines\.(\d+)\.quantity$/.exec(key);
        if (m) form.setError(`lines.${picked[Number(m[1])]?.index ?? 0}.quantity`, { message });
        else if (key === 'reason') form.setError('reason', { message });
        else setError(message);
      }
    }
  };

  const errors = form.formState.errors;
  const linesError = errors.lines?.root?.message ?? errors.lines?.message;

  return (
    <Dialog open onOpenChange={(o) => !o && !create.isPending && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tạo yêu cầu trả cho đơn {order.code}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-4">
            {error && <AlertMessage severity="error">{error}</AlertMessage>}
            <div className="overflow-x-auto">
              <Table data-testid="create-return-lines">
                <TableHeader>
                  <TableRow>
                    <TableHead>Sản phẩm</TableHead>
                    <TableHead className="w-24 text-right">Đã giao</TableHead>
                    <TableHead className="w-28 text-right">Còn trả được</TableHead>
                    <TableHead className="w-28">Số trả</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((f, i) => {
                    const l = rows[i];
                    return (
                      <TableRow key={f.id} data-row-id={l.sku}>
                        <TableCell className="whitespace-normal">
                          <span className="font-medium">{l.sku}</span> · {l.productName}
                          {l.attributesLabel && <span className="text-muted-foreground"> · {l.attributesLabel}</span>}
                        </TableCell>
                        <TableCell className="text-right">{l.delivered}</TableCell>
                        <TableCell className="text-right">{l.returnable}</TableCell>
                        <TableCell>
                          <Input
                            inputMode="numeric"
                            aria-label={`Số trả ${l.sku}`}
                            aria-invalid={Boolean(errors.lines?.[i]?.quantity)}
                            {...form.register(`lines.${i}.quantity`)}
                          />
                          {errors.lines?.[i]?.quantity && (
                            <p className="mt-1 text-sm text-destructive">{errors.lines[i]?.quantity?.message}</p>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {linesError && <p className="text-sm text-destructive">{linesError}</p>}
            <p className="text-sm text-muted-foreground">
              Tiền hoàn dự kiến theo đơn giá:{' '}
              <Money
                value={rows.reduce((s, l, i) => {
                  const q = Number(form.watch(`lines.${i}.quantity`));
                  return s + (Number.isInteger(q) && q > 0 ? q * l.unitPrice : 0);
                }, 0)}
              />
            </p>
            <div className="grid gap-2">
              <Label htmlFor="return-reason">Lý do trả</Label>
              <Textarea
                id="return-reason"
                rows={2}
                maxLength={MAX_REASON}
                data-testid="return-reason"
                aria-invalid={Boolean(errors.reason)}
                {...form.register('reason')}
              />
              {errors.reason && <p className="text-sm text-destructive">{errors.reason.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={create.isPending}>
                Đóng
              </Button>
              <Button type="submit" disabled={create.isPending}>
                Lập yêu cầu
              </Button>
            </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
