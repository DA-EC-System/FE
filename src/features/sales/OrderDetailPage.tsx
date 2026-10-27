import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Truck, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useConfirmOrder, useOrder } from '@/api/sales.api';
import { getProblem, type ProblemDetails } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { orderActions } from '@/features/fulfillment/shared';
import { formatCurrency, formatDateTime } from '@/utils/format';
import type { ShortLine } from '@/types/sales';
import { ORDER_STATUS, PAYMENT_METHOD_LABELS, sourceLabel } from './shared';
import { Info } from './Info';
import { PaymentPanel } from './PaymentPanel';
import { CancelOrderDialog } from './CancelOrderDialog';
import { DeliveryDialog } from './DeliveryDialog';
import { StatusTimeline } from '@/components/common/StatusTimeline';
import { SettlementBadges } from '@/features/finance/SettlementBadges';

type ConfirmNotice = { kind: 'short'; lines: ShortLine[] } | { kind: 'error'; message: string };

/** UC-SF-04, 06, 09 — Chi tiết đơn: dòng hàng, tiền, lịch sử trạng thái, xác nhận, huỷ, cập nhật giao, thanh toán */
export function OrderDetailPage() {
  const navigate = useNavigate();
  const { orderId = '' } = useParams();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const can = useCan();
  const query = useOrder(orderId);
  const order = query.data;
  const confirmMut = useConfirmOrder();
  const [notice, setNotice] = useState<ConfirmNotice | null>(null);
  const [dialog, setDialog] = useState<'cancel' | 'delivery' | null>(null);

  const back = (
    <Button variant="ghost" size="sm" className="mb-2 -ms-2" onClick={() => navigate(ROUTES.company.orders(companyId))}>
      <ArrowLeft />
      Đơn hàng
    </Button>
  );

  if (query.isError) {
    // Không có hoặc của công ty khác đều là 404 (AC-R5)
    const notFound = getProblem(query.error)?.status === 404;
    return (
      <div>
        {back}
        <PageHeader title={notFound ? 'Không tìm thấy' : 'Không tải được đơn hàng'} />
        <AlertMessage severity="error">
          {notFound ? 'Không tìm thấy đơn hàng. Đơn không tồn tại hoặc không thuộc công ty này.' : problemMessage(query.error)}
        </AlertMessage>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  const status = ORDER_STATUS[order.status];
  const isMarketplace = order.source === 'marketplace';
  const actions = orderActions(order, can);

  /** AC-A2: hook đã tải lại đơn sau khi gọi xong, nút đổi theo trạng thái mới */
  const onConflict = () => {
    setDialog(null);
    setNotice({ kind: 'error', message: 'Đơn vừa được người khác cập nhật. Đã tải lại đơn mới nhất.' });
  };

  const confirm = async () => {
    setNotice(null);
    try {
      await confirmMut.mutateAsync({ id: order.id, version: order.version });
      toast.success('Đã xác nhận đơn');
    } catch (e) {
      const problem = getProblem(e) as (ProblemDetails & { shortLines?: ShortLine[] }) | undefined;
      if (problem?.code === 'insufficient_stock') {
        setNotice({ kind: 'short', lines: problem.shortLines ?? [] });
      } else if (problem?.code === 'version_conflict' || problem?.code === 'invalid_transition') {
        onConflict();
      } else {
        setNotice({ kind: 'error', message: problemMessage(e) });
      }
    }
  };

  return (
    <div>
      {back}
      <PageHeader
        title={`Đơn ${order.code}`}
        subtitle={`${sourceLabel(order)} · tạo lúc ${formatDateTime(order.createdAt)}${order.createdBy ? ` bởi ${order.createdBy.name}` : ''}`}
        action={
          actions.confirm || actions.cancel || actions.delivery ? (
            <div className="flex flex-wrap gap-2">
              {actions.cancel && (
                <Button variant="outline" onClick={() => setDialog('cancel')}>
                  <XCircle />
                  Huỷ đơn
                </Button>
              )}
              {actions.delivery && (
                <Button onClick={() => setDialog('delivery')}>
                  <Truck />
                  Cập nhật giao
                </Button>
              )}
              {actions.confirm && (
                <Button onClick={confirm} disabled={confirmMut.isPending}>
                  <CheckCircle2 />
                  {confirmMut.isPending ? 'Đang xác nhận...' : 'Xác nhận đơn'}
                </Button>
              )}
            </div>
          ) : undefined
        }
      />
      <div className="mb-4 flex flex-wrap gap-1">
        <Badge variant={status.variant}>{status.label}</Badge>
        {order.isShortStock && <Badge variant="destructive">Thiếu hàng</Badge>}
        {isMarketplace && <SettlementBadges orderId={order.id} />}
      </div>

      {actions.note && (
        <AlertMessage severity="info" className="mb-4">
          {actions.note}
        </AlertMessage>
      )}
      {notice?.kind === 'short' && (
        <AlertMessage severity="error" className="mb-4" onClose={() => setNotice(null)}>
          <p className="font-medium">Không đủ hàng</p>
          <ul className="mt-1 list-disc ps-5" data-testid="short-lines">
            {notice.lines.map((l) => (
              <li key={l.variantId}>
                {l.sku}: cần {l.requested}, khả dụng {l.available}
              </li>
            ))}
          </ul>
        </AlertMessage>
      )}
      {notice?.kind === 'error' && (
        <AlertMessage severity="error" className="mb-4" onClose={() => setNotice(null)}>
          {notice.message}
        </AlertMessage>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="grid gap-4 lg:col-span-2">
          <Card className="py-4">
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Info label="Khách">
                {order.customer ? (
                  can(PERMISSIONS.customerView) ? (
                    <Link
                      to={ROUTES.company.customer(companyId, order.customer.id)}
                      className="font-medium text-primary hover:underline"
                    >
                      {order.customer.name}
                    </Link>
                  ) : (
                    order.customer.name
                  )
                ) : (
                  '—'
                )}
                {order.customer && <p className="text-muted-foreground">{order.customer.phone}</p>}
              </Info>
              <Info label="Giao tới">
                <p>
                  {order.shippingAddress.name} · {order.shippingAddress.phone}
                </p>
                <p className="text-muted-foreground">{order.shippingAddress.address}</p>
              </Info>
              <Info label="Thanh toán">{order.paymentMethod ? PAYMENT_METHOD_LABELS[order.paymentMethod] : 'Sàn thu hộ'}</Info>
              <Info label="Ghi chú">{order.note || '—'}</Info>
              {order.cancelReason && <Info label="Lý do huỷ">{order.cancelReason}</Info>}
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            <div className="overflow-x-auto">
              <Table data-testid="order-lines">
                <TableHeader>
                  <TableRow>
                    <TableHead>Sản phẩm</TableHead>
                    <TableHead className="w-28 text-right">Đơn giá</TableHead>
                    <TableHead className="w-24 text-right">Số lượng</TableHead>
                    <TableHead className="w-28 text-right">Khả dụng</TableHead>
                    <TableHead className="w-32 text-right">Thành tiền</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.lines.map((l) => (
                    <TableRow key={l.id} data-row-id={l.variantId}>
                      <TableCell>
                        <p className="font-medium">{l.sku}</p>
                        <p className="text-xs text-muted-foreground">
                          {l.productName}
                          {l.attributesLabel && ` · ${l.attributesLabel}`}
                        </p>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(l.unitPrice)}</TableCell>
                      <TableCell className="text-right">{l.quantity}</TableCell>
                      <TableCell
                        className={
                          order.status === 'pending_confirmation' && l.available < l.quantity
                            ? 'text-right text-destructive'
                            : 'text-right'
                        }
                      >
                        {l.available}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(l.lineTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="ms-auto grid w-full max-w-xs gap-2 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tạm tính</span>
                <span>{formatCurrency(order.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phí giao</span>
                <span>{formatCurrency(order.shippingFee)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-base font-semibold">
                <span>Tổng</span>
                <span>{formatCurrency(order.total)}</span>
              </div>
            </div>
          </Card>

          <Card className="py-4">
            <CardHeader>
              <CardTitle className="text-base">Lịch sử trạng thái</CardTitle>
            </CardHeader>
            <CardContent>
              <StatusTimeline history={order.statusHistory} statuses={ORDER_STATUS} />
            </CardContent>
          </Card>
        </div>

        {/* Đơn sàn do sàn thu hộ, không gọi API thanh toán (AC-P1) */}
        {!isMarketplace && <PaymentPanel order={order} />}
      </div>

      <CancelOrderDialog
        order={order}
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        onConflict={onConflict}
      />
      <DeliveryDialog
        order={order}
        open={dialog === 'delivery'}
        onClose={() => setDialog(null)}
        onConflict={onConflict}
      />
    </div>
  );
}
