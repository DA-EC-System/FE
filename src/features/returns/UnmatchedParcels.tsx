import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ReasonDialog } from '@/components/common/ReasonDialog';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useResolveParcel, useReturns, useUnmatchedParcels } from '@/api/returns.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { ROUTES } from '@/router/routes';
import { formatDateTime } from '@/utils/format';
import type { UnmatchedParcel } from '@/types/returns';
import { UNMATCHED_STATUS } from './shared';

type Pending = { kind: 'attach' | 'dismiss'; parcel: UnmatchedParcel };

/** Khu chờ xử lý: kiện hàng trả quét không khớp yêu cầu nào */
export function UnmatchedParcels({ companyId, canProcess }: { companyId: string; canProcess: boolean }) {
  const query = useUnmatchedParcels();
  const resolve = useResolveParcel();
  const [pending, setPending] = useState<Pending | null>(null);
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const waiting = useReturns({ status: 'awaiting_return', pageSize: 100 }, { enabled: pending?.kind === 'attach' });

  useEffect(() => {
    setTarget('');
    setError(null);
  }, [pending]);

  const run = async (body: { kind: 'attach'; returnRequestId: string } | { kind: 'dismiss'; reason: string }) => {
    if (!pending) return;
    setError(null);
    try {
      await resolve.mutateAsync({ id: pending.parcel.id, version: pending.parcel.version, ...body });
      toast.success(body.kind === 'attach' ? `Đã gắn kiện ${pending.parcel.code} vào yêu cầu` : `Đã ghi cách xử lý kiện ${pending.parcel.code}`);
      setPending(null);
    } catch (e) {
      const errors = getProblem(e)?.errors;
      setError((errors && Object.values(errors)[0]) ?? problemMessage(e));
    }
  };

  const items = query.data ?? [];

  return (
    <div className="p-4">
      {query.isError && <AlertMessage severity="error">{problemMessage(query.error)}</AlertMessage>}
      <div className="overflow-x-auto">
        <Table data-testid="unmatched-parcels">
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Mã quét</TableHead>
              <TableHead className="w-36">Trạng thái</TableHead>
              <TableHead>Ghi chú / cách xử lý</TableHead>
              <TableHead className="w-48">Nhận lúc</TableHead>
              {canProcess && <TableHead className="w-56" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((x) => (
              <TableRow key={x.id} data-row-id={x.code}>
                <TableCell className="font-medium">{x.code}</TableCell>
                <TableCell>
                  <StatusBadge status={x.status} statuses={UNMATCHED_STATUS} />
                </TableCell>
                <TableCell className="whitespace-normal">
                  {x.returnRequest ? (
                    <Link
                      className="text-primary underline-offset-4 hover:underline"
                      to={ROUTES.company.returnRequest(companyId, x.returnRequest.id)}
                    >
                      {x.returnRequest.code}
                    </Link>
                  ) : (
                    x.resolution || x.note || '—'
                  )}
                </TableCell>
                <TableCell>
                  {formatDateTime(x.receivedAt)}
                  {x.receivedBy ? ` · ${x.receivedBy.name}` : ''}
                </TableCell>
                {canProcess && (
                  <TableCell>
                    {x.status === 'open' && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setPending({ kind: 'attach', parcel: x })}>
                          Gắn yêu cầu
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setPending({ kind: 'dismiss', parcel: x })}>
                          Xử lý khác
                        </Button>
                      </div>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
            {!query.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={canProcess ? 5 : 4} className="text-center text-muted-foreground">
                  Không có kiện không khớp
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={pending?.kind === 'attach'} onOpenChange={(o) => !o && !resolve.isPending && setPending(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Gắn kiện {pending?.parcel.code} vào yêu cầu trả</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-2"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!target) return setError('Chọn yêu cầu trả');
              void run({ kind: 'attach', returnRequestId: target });
            }}
          >
            <Label htmlFor="attach-target">Yêu cầu đang chờ hàng về</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id="attach-target" className="w-full" aria-invalid={Boolean(error)}>
                <SelectValue placeholder={waiting.isLoading ? 'Đang tải...' : 'Chọn yêu cầu'} />
              </SelectTrigger>
              <SelectContent>
                {(waiting.data?.items ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.code} · đơn {r.order.code}
                    {r.customerName ? ` · ${r.customerName}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {waiting.data?.items.length === 0 && <p className="text-sm text-muted-foreground">Không có yêu cầu nào chờ hàng về</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={() => setPending(null)} disabled={resolve.isPending}>
                Huỷ
              </Button>
              <Button type="submit" disabled={resolve.isPending}>
                Gắn và nhận hàng
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ReasonDialog
        open={pending?.kind === 'dismiss'}
        title={`Xử lý kiện ${pending?.parcel.code ?? ''}`}
        message="Kiện không thuộc yêu cầu trả nào. Ghi cách xử lý: trả lại đơn vị vận chuyển, nhập kho qua phiếu kiểm..."
        label="Cách xử lý"
        loading={resolve.isPending}
        error={error}
        onConfirm={(reason) => void run({ kind: 'dismiss', reason })}
        onClose={() => setPending(null)}
      />
    </div>
  );
}
