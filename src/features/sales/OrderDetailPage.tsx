import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Scissors, Truck, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { FlagChips } from '@/components/common/FlagChips';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useConfirmOrder, useOrder } from '@/api/sales.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan, useTransitionActor } from '@/hooks/usePermission';
import { orderMachine } from '@/lib/machines/order';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { DELIVERY_ACTIONS, PACKAGE_FLAGS, PACKAGE_STATUS, packageButtons } from '@/features/fulfillment/shared';
import { formatCurrency, formatDateTime } from '@/utils/format';
import type { PackageSummary } from '@/types/fulfillment';
import type { Order } from '@/types/sales';
import { COMPLETION_BLOCKER_LABELS, ORDER_STATUS, PAYMENT_METHOD_LABELS, sourceLabel } from './shared';
import { OrderStage } from './OrderStage';
import { SplitPackageDialog } from './SplitPackageDialog';
import { Info } from './Info';
import { PaymentPanel } from './PaymentPanel';
import { CancelOrderDialog } from './CancelOrderDialog';
import { DeliveryDialog } from './DeliveryDialog';
import { StatusTimeline } from '@/components/common/StatusTimeline';
import { SettlementBadges } from '@/features/finance/SettlementBadges';
import { OrderReturnsCard } from '@/features/returns/OrderReturnsCard';

const orderRecord = (o: Order) => ({
  source: o.source,
  paymentMethod: o.paymentMethod,
  packages: o.packages.map((p) => p.status),
});

/** Chi tiết đơn (sơ đồ D1): kiện, dòng hàng, tiền, lịch sử; xác nhận, huỷ, chia kiện, cập nhật giao theo kiện */
export function OrderDetailPage() {
  const navigate = useNavigate();
  const { orderId = '' } = useParams();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const can = useCan();
  const actor = useTransitionActor();
  const query = useOrder(orderId);
  const order = query.data;
  const confirmMut = useConfirmOrder();
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'cancel' | null>(null);
  const [delivering, setDelivering] = useState<PackageSummary | null>(null);
  const [splitting, setSplitting] = useState<PackageSummary | null>(null);

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

  const isMarketplace = order.source === 'marketplace';
  const available = orderMachine.available(order.status, actor, orderRecord(order)).map((t) => t.action);
  const canConfirm = available.includes('confirm');
  const canCancel = available.includes('cancel');
  const canProcess = can(PERMISSIONS.fulfillmentProcess);
  const note =
    isMarketplace && (order.status === 'unpaid' || order.status === 'processing')
      ? 'Đơn sàn: trạng thái thanh toán, giao và huỷ lấy từ sàn.'
      : order.status === 'unpaid' && order.paymentMethod === 'prepaid'
        ? 'Đơn trả trước sang Đang xử lý khi khách thanh toán.'
        : null;

  /** AC-A2: hook đã tải lại đơn sau khi gọi xong, nút đổi theo trạng thái mới */
  const onConflict = () => {
    setDialog(null);
    setDelivering(null);
    setSplitting(null);
    setNotice('Đơn vừa được người khác cập nhật. Đã tải lại đơn mới nhất.');
  };

  const confirm = async () => {
    setNotice(null);
    try {
      await confirmMut.mutateAsync({ id: order.id, version: order.version });
      toast.success('Đã xác nhận đơn');
    } catch (e) {
      const problem = getProblem(e);
      if (problem?.code === 'version_conflict' || problem?.code === 'invalid_transition') onConflict();
      else setNotice(problemMessage(e));
    }
  };

  return (
    <div>
      {back}
      <PageHeader
        title={`Đơn ${order.code}`}
        subtitle={`${sourceLabel(order)} · tạo lúc ${formatDateTime(order.createdAt)}${order.createdBy ? ` bởi ${order.createdBy.name}` : ''}`}
        action={
          canConfirm || canCancel ? (
            <div className="flex flex-wrap gap-2">
              {canCancel && (
                <Button variant="outline" onClick={() => setDialog('cancel')}>
                  <XCircle />
                  Huỷ đơn
                </Button>
              )}
              {canConfirm && (
                <Button onClick={confirm} disabled={confirmMut.isPending}>
                  <CheckCircle2 />
                  {confirmMut.isPending ? 'Đang xác nhận...' : 'Xác nhận đơn'}
                </Button>
              )}
            </div>
          ) : undefined
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-1" data-testid="order-status">
        <StatusBadge status={order.status} statuses={ORDER_STATUS} />
        <OrderStage order={order} />
        {order.rawMarketplaceStatus && <Badge variant="outline">Sàn: {order.rawMarketplaceStatus}</Badge>}
        {isMarketplace && <SettlementBadges orderId={order.id} />}
      </div>

      {note && (
        <AlertMessage severity="info" className="mb-4">
          {note}
        </AlertMessage>
      )}
      {order.completionBlocker && (
        <AlertMessage severity="info" className="mb-4">
          Chưa hoàn tất: {COMPLETION_BLOCKER_LABELS[order.completionBlocker] ?? order.completionBlocker}
          {order.returnWindowEndsAt && order.completionBlocker === 'return_window'
            ? ` (hết hạn trả hàng ${formatDateTime(order.returnWindowEndsAt)})`
            : ''}
        </AlertMessage>
      )}
      {notice && (
        <AlertMessage severity="error" className="mb-4" onClose={() => setNotice(null)}>
          {notice}
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
                    <TableHead className="w-32 text-right">Thành tiền</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.lines.map((l) => (
                    <TableRow key={l.id} data-row-id={l.variantId}>
                      <TableCell>
                        <p className="font-medium">{l.sku || l.externalSku}</p>
                        {l.externalSku && !l.variantId && <Badge variant="destructive">Chưa ghép SKU</Badge>}
                        <p className="text-xs text-muted-foreground">
                          {l.productName}
                          {l.attributesLabel && ` · ${l.attributesLabel}`}
                        </p>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(l.unitPrice)}</TableCell>
                      <TableCell className="text-right">{l.quantity}</TableCell>
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
              <CardTitle className="text-base">Kiện ({order.packages.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table data-testid="order-packages">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Mã kiện</TableHead>
                    <TableHead>Hàng</TableHead>
                    <TableHead className="w-48">Trạng thái</TableHead>
                    <TableHead className="w-48 text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.packages.map((p) => {
                    const delivery = packageButtons(p, actor).actions.some((a) => DELIVERY_ACTIONS.includes(a));
                    const splittable =
                      canProcess && (p.status === 'reserved' || p.status === 'backordered') && p.totalQty > 1;
                    return (
                      <TableRow key={p.id} data-row-id={p.code}>
                        <TableCell className="font-medium">
                          {canProcess ? (
                            <Link to={ROUTES.company.package(companyId, p.id)} className="text-primary hover:underline">
                              {p.code}
                            </Link>
                          ) : (
                            p.code
                          )}
                        </TableCell>
                        <TableCell className="whitespace-normal text-sm">
                          {p.lines.map((l) => `${l.sku} × ${l.quantity}`).join(', ')}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <StatusBadge status={p.status} statuses={PACKAGE_STATUS} />
                            <FlagChips flags={p.flags} meta={PACKAGE_FLAGS} />
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {splittable && (
                              <Button size="sm" variant="outline" onClick={() => setSplitting(p)}>
                                <Scissors />
                                Chia kiện
                              </Button>
                            )}
                            {delivery && (
                              <Button size="sm" onClick={() => setDelivering(p)}>
                                <Truck />
                                Cập nhật giao
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <OrderReturnsCard order={order} companyId={companyId} />

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
      {delivering && (
        <DeliveryDialog pkg={delivering} open onClose={() => setDelivering(null)} onConflict={onConflict} />
      )}
      <SplitPackageDialog pkg={splitting} onClose={() => setSplitting(null)} onConflict={onConflict} />
    </div>
  );
}
