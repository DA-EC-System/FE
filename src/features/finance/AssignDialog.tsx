import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useAssignUnmatched } from '@/api/finance.api';
import { useUnpaidOrders } from '@/api/payment.api';
import { getProblem, type ProblemDetails } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useDebounce } from '@/hooks/useDebounce';
import { formatCurrency } from '@/utils/format';
import type { UnmatchedReceipt, UnpaidOrder } from '@/types/finance';
import type { OrderPayment } from '@/types/payment';
import { Info } from '@/features/sales/Info';
import { PAYMENT_STATUS } from '@/features/sales/shared';
import { SearchCombobox } from '@/features/sales/SearchCombobox';
import { amountGap } from './shared';

export const UNMATCHED_STALE = 'Khoản thu vừa được người khác xử lý. Đã tải lại.';

interface AssignDialogProps {
  item: UnmatchedReceipt | null;
  onClose: () => void;
  /** 409 khoản đã được xử lý: nơi gọi báo và đóng hộp */
  onStale: (message: string) => void;
}

/** UC-PF-07 — Gán khoản thu chưa khớp vào một đơn chưa thu; lệch tiền thì không gán được (AC-U2) */
export function AssignDialog({ item, onClose, onStale }: AssignDialogProps) {
  const open = Boolean(item);
  const mutation = useAssignUnmatched();
  const [input, setInput] = useState('');
  const [picked, setPicked] = useState<UnpaidOrder | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Chọn sẵn đơn gợi ý một lần mỗi lần mở */
  const autoPick = useRef(false);
  const search = useDebounce(input.trim());
  const orders = useUnpaidOrders(search, { enabled: open });

  useEffect(() => {
    if (item) {
      setInput(item.suggestedOrder?.code ?? '');
      setPicked(null);
      setFieldError(null);
      setError(null);
      autoPick.current = Boolean(item.suggestedOrder);
    }
  }, [item]);

  // Đơn gợi ý chỉ chọn sẵn khi còn trong danh sách chưa thu
  useEffect(() => {
    if (!autoPick.current || !item?.suggestedOrder || orders.isFetching) return;
    const match = orders.data?.items.find((o) => o.order.id === item.suggestedOrder!.id);
    if (search === item.suggestedOrder.code || match) {
      autoPick.current = false;
      if (match) {
        setPicked(match);
        setInput('');
      }
    }
  }, [orders.data, orders.isFetching, item, search]);

  if (!item) return null;
  const gap = picked ? amountGap(picked.amount, item.amount) : null;

  const choose = (o: UnpaidOrder | null) => {
    autoPick.current = false;
    setPicked(o);
    setInput('');
    setFieldError(null);
    setError(null);
  };

  const submit = async () => {
    if (!picked) {
      setFieldError('Chọn đơn hàng');
      return;
    }
    setError(null);
    setFieldError(null);
    try {
      const result = await mutation.mutateAsync({ id: item.id, orderId: picked.order.id, version: item.version });
      toast.success(`Đã gán vào đơn ${picked.order.code}, phiếu thu ${result.receipt.number}`);
      onClose();
    } catch (e) {
      const problem = getProblem(e) as (ProblemDetails & { current?: OrderPayment }) | undefined;
      if (problem?.code === 'already_processed' || problem?.code === 'version_conflict') {
        onStale(UNMATCHED_STALE);
      } else if (problem?.code === 'payment_state_changed') {
        const status = problem.current?.status;
        setError(`Đơn không còn chờ thanh toán (${status ? PAYMENT_STATUS[status].label : 'đã đổi'}).`);
        setPicked(null);
      } else if (problem?.errors?.orderId) {
        setFieldError(problem.errors.orderId);
      } else {
        setError(problemMessage(e));
      }
    }
  };

  const loading = mutation.isPending;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !loading && onClose()}>
      {/* Không tự focus ô chọn đơn: focus mở danh sách ngay khi hộp vừa hiện, che phần thông tin khoản thu */}
      <DialogContent className="sm:max-w-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Gán vào đơn</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4 rounded-md border p-3">
            <Info label="Số tiền">{formatCurrency(item.amount)}</Info>
            <Info label="Nội dung chuyển khoản">{item.transferContent || '—'}</Info>
          </div>
          {error && <AlertMessage severity="error">{error}</AlertMessage>}
          {picked ? (
            <div className="grid gap-1.5">
              <Label>Đơn hàng</Label>
              <div className="flex items-start justify-between gap-2 rounded-md border p-3 text-sm" data-testid="assign-order">
                <div>
                  <p className="font-medium">{picked.order.code}</p>
                  <p className="text-muted-foreground">
                    {picked.order.customerName ?? '—'} · {formatCurrency(picked.amount)}
                  </p>
                  {gap && <p className="text-destructive">{gap}</p>}
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => choose(null)}>
                  <X />
                  Đổi
                </Button>
              </div>
            </div>
          ) : (
            <SearchCombobox<UnpaidOrder>
              id="assign-order"
              label="Đơn hàng"
              placeholder="Gõ mã đơn, tên khách"
              input={input}
              onInputChange={setInput}
              options={orders.data?.items ?? []}
              fetching={orders.isFetching}
              emptyText="Không có đơn chưa thanh toán phù hợp"
              getKey={(o) => o.order.id}
              renderOption={(o) => {
                const diff = amountGap(o.amount, item.amount);
                return (
                  <>
                    <span className="grid">
                      <span className="font-medium">{o.order.code}</span>
                      <span className="text-xs text-muted-foreground">{o.order.customerName ?? '—'}</span>
                    </span>
                    <span className="grid text-right whitespace-nowrap">
                      <span>{formatCurrency(o.amount)}</span>
                      {diff && <span className="text-xs text-destructive">{diff}</span>}
                    </span>
                  </>
                );
              }}
              onPick={choose}
              invalid={Boolean(fieldError)}
            />
          )}
          {fieldError && <p className="text-sm text-destructive">{fieldError}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Đóng
          </Button>
          <Button onClick={submit} disabled={loading || Boolean(gap)}>
            {loading ? 'Đang gán...' : 'Gán'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
