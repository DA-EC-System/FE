import { Fragment, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ChevronDown, ChevronRight, ClipboardCheck, PackageCheck, Printer } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useBatch, useIssueBatch, useMarkBatchPicked } from '@/api/fulfillment.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/router/routes';
import { formatDateTime } from '@/utils/format';
import type { BatchIssueFailure } from '@/types/fulfillment';
import { ORDER_STATUS, sourceLabel } from '@/features/sales/shared';
import { StatusTimeline } from '@/features/sales/StatusTimeline';
import { BATCH_STATUS, issueFailureLabel } from './shared';
import { IssueOrderButton, waitingPayment } from './IssueOrderButton';

/** UC-SF-07, 08 — Chi tiết lô: danh sách nhặt, đơn trong lô, nhặt xong, xuất cả lô (AC-B4, AC-B5, AC-X3) */
export function BatchDetailPage() {
  const { batchId = '' } = useParams();
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const query = useBatch(batchId);
  const batch = query.data;
  const picked = useMarkBatchPicked();
  const issueAll = useIssueBatch();
  const [dialog, setDialog] = useState<'picked' | 'issue' | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<BatchIssueFailure[]>([]);
  const [error, setError] = useState<string | null>(null);

  const back = (
    <Button variant="ghost" size="sm" className="mb-2 -ms-2" onClick={() => navigate(ROUTES.company.batches(companyId))}>
      <ArrowLeft />
      Lô nhặt hàng
    </Button>
  );

  if (query.isError) {
    const notFound = getProblem(query.error)?.status === 404;
    return (
      <div>
        {back}
        <PageHeader title={notFound ? 'Không tìm thấy' : 'Không tải được lô'} />
        <AlertMessage severity="error">
          {notFound ? 'Không tìm thấy lô nhặt. Lô không tồn tại hoặc không thuộc công ty này.' : problemMessage(query.error)}
        </AlertMessage>
      </div>
    );
  }
  if (!batch) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  const status = BATCH_STATUS[batch.status];
  const packing = batch.orders.filter((o) => o.status === 'packing');
  const blocked = packing.filter(waitingPayment);
  const orderCode = (id: string) => batch.orders.find((o) => o.id === id)?.code ?? id;

  const conflict = (e: unknown) => {
    const code = getProblem(e)?.code;
    setError(
      code === 'invalid_transition' || code === 'version_conflict'
        ? 'Lô vừa được người khác cập nhật. Đã tải lại lô mới nhất.'
        : problemMessage(e),
    );
  };

  const markPicked = async () => {
    setError(null);
    try {
      const result = await picked.mutateAsync({ id: batch.id, version: batch.version });
      toast.success(`Đã chuyển ${result.orders.length} đơn sang đóng gói`);
    } catch (e) {
      conflict(e);
    } finally {
      setDialog(null);
    }
  };

  const issueBatch = async () => {
    setError(null);
    try {
      const result = await issueAll.mutateAsync({ id: batch.id, version: batch.version });
      toast.success(`Đã xuất ${result.issued.length} đơn`);
      setFailed(result.failed);
    } catch (e) {
      conflict(e);
    } finally {
      setDialog(null);
    }
  };

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      {back}
      <PageHeader
        title={`Lô ${batch.code}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer />
              In danh sách nhặt
            </Button>
            {batch.status === 'picking' && (
              <Button onClick={() => setDialog('picked')} disabled={picked.isPending}>
                <ClipboardCheck />
                Nhặt xong
              </Button>
            )}
            {batch.status === 'packed' && packing.length > 0 && (
              <Button onClick={() => setDialog('issue')} disabled={issueAll.isPending}>
                <PackageCheck />
                Xuất kho cả lô
              </Button>
            )}
          </div>
        }
      />
      {error && (
        <AlertMessage severity="error" className="mb-4" onClose={() => setError(null)}>
          {error}
        </AlertMessage>
      )}
      {failed.length > 0 && (
        <AlertMessage severity="warning" className="mb-4" onClose={() => setFailed([])}>
          Đơn chưa xuất:
          <ul className="mt-1 list-disc ps-5" data-testid="issue-failed">
            {failed.map((f) => (
              <li key={f.orderId}>
                {orderCode(f.orderId)}: {issueFailureLabel(f.code)}
              </li>
            ))}
          </ul>
        </AlertMessage>
      )}

      <div className="grid gap-4">
        <Card>
          <CardContent className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Trạng thái</p>
              <Badge variant={status.variant} data-testid="batch-status">
                {status.label}
              </Badge>
            </div>
            <div>
              <p className="text-muted-foreground">Số đơn</p>
              <p>{batch.orderCount}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Người tạo</p>
              <p>{batch.createdBy?.name ?? '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Ngày tạo</p>
              <p>{formatDateTime(batch.createdAt)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="print-area">
          <CardHeader>
            <CardTitle>Danh sách nhặt · {batch.code}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table data-testid="pick-list">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">SKU</TableHead>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead>Thuộc tính</TableHead>
                  <TableHead className="w-24 text-right">Số lượng</TableHead>
                  <TableHead className="w-20 text-right">Số đơn</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batch.pickList.map((l) => (
                  <TableRow key={l.variantId} data-row-id={l.sku}>
                    <TableCell className="font-medium">{l.sku}</TableCell>
                    <TableCell className="whitespace-normal">{l.productName}</TableCell>
                    <TableCell>{l.attributesLabel || '—'}</TableCell>
                    <TableCell className="text-right">{l.quantity}</TableCell>
                    <TableCell className="text-right">{l.orderCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Đơn trong lô</CardTitle>
          </CardHeader>
          <CardContent>
            <Table data-testid="batch-orders">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead className="w-32">Mã đơn</TableHead>
                  <TableHead>Nguồn</TableHead>
                  <TableHead>Khách</TableHead>
                  <TableHead className="w-36">Trạng thái</TableHead>
                  <TableHead className="w-36 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {batch.orders.map((o) => {
                  const open = expanded.has(o.id);
                  const s = ORDER_STATUS[o.status];
                  return (
                    <Fragment key={o.id}>
                      <TableRow data-row-id={o.id} className="cursor-pointer" onClick={() => toggle(o.id)}>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label={open ? `Thu gọn ${o.code}` : `Mở rộng ${o.code}`}
                            aria-expanded={open}
                          >
                            {open ? <ChevronDown /> : <ChevronRight />}
                          </Button>
                        </TableCell>
                        <TableCell className="font-medium">{o.code}</TableCell>
                        <TableCell>{sourceLabel(o)}</TableCell>
                        <TableCell>{o.customerName ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant={s.variant}>{s.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {o.status === 'packing' && <IssueOrderButton order={o} />}
                        </TableCell>
                      </TableRow>
                      {open && (
                        <TableRow data-testid={`batch-order-${o.id}`} className="hover:bg-transparent">
                          <TableCell />
                          <TableCell colSpan={5} className="whitespace-normal">
                            <div className="grid gap-4 py-2 md:grid-cols-2">
                              <ul className="grid gap-1 text-sm">
                                {o.lines.map((l) => (
                                  <li key={l.variantId} className="flex justify-between gap-2">
                                    <span>
                                      <span className="font-medium">{l.sku}</span> · {l.productName}
                                      {l.attributesLabel && (
                                        <span className="text-muted-foreground"> ({l.attributesLabel})</span>
                                      )}
                                    </span>
                                    <span>× {l.quantity}</span>
                                  </li>
                                ))}
                              </ul>
                              <StatusTimeline history={o.statusHistory} />
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={dialog === 'picked'}
        title="Nhặt xong"
        message={`Chuyển ${batch.orders.filter((o) => o.status === 'picking').length} đơn của lô ${batch.code} sang đóng gói.`}
        confirmLabel="Nhặt xong"
        loading={picked.isPending}
        onConfirm={markPicked}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'issue'}
        title="Xuất kho cả lô"
        message={
          `Sẽ xuất ${packing.length - blocked.length} đơn.` +
          (blocked.length > 0 ? ` ${blocked.length} đơn bị chặn vì chưa thanh toán.` : '')
        }
        confirmLabel="Xuất kho"
        loading={issueAll.isPending}
        onConfirm={issueBatch}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
