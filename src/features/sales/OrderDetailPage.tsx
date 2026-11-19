import { PaymentStatusBadge } from '@/features/finance/PaymentStatusBadge';
import { CopyButton } from '@/components/common/CopyButton';
import { LineThumb } from './LineThumb';
import { LineIssue } from './LineIssue';
import { PackageShipping } from '@/features/fulfillment/PackageShipping';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Link2, Pencil, Truck, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
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
import { useCancelRequestDecision } from '@/api/fulfillment.api';
import { getProblem } from '@/api/client';
import { isRouteMissing, problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan, useTransitionActor } from '@/hooks/usePermission';
import { orderMachine } from '@/lib/machines/order';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { DELIVERY_ACTIONS, PACKAGE_FLAGS, PACKAGE_STATUS, packageButtons } from '@/features/fulfillment/shared';
import { formatCurrency, formatDateTime } from '@/utils/format';
import type { PackageSummary } from '@/types/fulfillment';
import type { Order, OrderStatus } from '@/types/sales';
import {
  COMPLETION_BLOCKER_LABELS,
  allLinesCancelled,
  cancelledAmountOf,
  initiatorLabel,
  lineCancelEvents,
  ORDER_STATUS,
  wardNote,
  lineCancelPending,
  lineHasIssue,
  paymentMethodLabel,
  sourceLabel,
} from './shared';
import { OrderStage } from './OrderStage';
import { Info } from './Info';
import { CONFLICT_CODES, CancelOrderDialog } from './CancelOrderDialog';
import { PlatformCancelDialog } from './PlatformCancelDialog';
import { RejectCancelRequestDialog } from './RejectCancelRequestDialog';
import { InvoiceNumberDialog } from './InvoiceNumberDialog';
import { DeliveryDialog } from './DeliveryDialog';
import { StatusTimeline } from '@/components/common/StatusTimeline';
import { DetailGrid } from '@/components/common/DetailGrid';
import { HelpTip } from '@/components/common/HelpTip';
import { LifecycleSteps } from '@/components/common/LifecycleSteps';
import { usePageGuide } from '@/guides/usePageGuide';
import { OrderReturnsCard } from '@/features/returns/OrderReturnsCard';
import { OrderProfitCard } from '@/features/finance/OrderProfitCard';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { PendingBadge } from '@/features/channel/ListingStatusCell';
import { needsUnload } from './lineMatch';
import { useOrderLineMatch } from './useOrderLineMatch';

const orderRecord = (o: Order) => ({
  source: o.source,
  paymentMethod: o.paymentMethod,
  packages: o.packages.map((p) => p.status),
});

/** Thanh bước trên cùng: đường chính của trạng thái đơn (sơ đồ D1); Đã huỷ chen vào và dừng */
const ORDER_PATH: OrderStatus[] = ['unpaid', 'processing', 'completed'];

/** Chi tiết đơn (sơ đồ D1): kiện, dòng hàng, tiền, lịch sử; xác nhận, huỷ, chia kiện, cập nhật giao theo kiện */
export function OrderDetailPage() {
  const navigate = useNavigate();
  const { orderId = '' } = useParams();
  const location = useLocation();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const can = useCan();
  const actor = useTransitionActor();
  const query = useOrder(orderId);
  const order = query.data;
  useBreadcrumb(order?.code);
  const lineMatch = useOrderLineMatch(order);
  const { startTour } = usePageGuide('order-detail', { ready: Boolean(order) });
  const confirmMut = useConfirmOrder();
  const decisionMut = useCancelRequestDecision();
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'cancel' | 'platform-cancel' | 'accept-cancel' | 'reject-cancel' | 'invoice' | null>(null);
  const [delivering, setDelivering] = useState<PackageSummary | null>(null);

  const back = (
    <Button variant="ghost" size="sm" className="mb-2 -ms-2" onClick={() => navigate(ROUTES.company.orders(companyId))}>
      <ArrowLeft />
      Đơn hàng
    </Button>
  );

  if (query.isError) {
    // Không có hoặc của công ty khác đều là 404 (AC-R5)
    const notFound = getProblem(query.error)?.status === 404 && !isRouteMissing(query.error);
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
  const hasPaid = order.lines.some((l) => l.paidPrice != null);
  // Tiền khi có món đã huỷ (BE#417): huỷ hết món giữ giá trị lúc đặt, không thu; huỷ một phần thì chỉ thu món còn lại.
  const cancelledAmount = cancelledAmountOf(order.lines);
  const wholeCancelled = order.status === 'cancelled' || allLinesCancelled(order.lines);
  const partlyCancelled = !wholeCancelled && cancelledAmount > 0;
  const available = orderMachine.available(order.status, actor, orderRecord(order)).map((t) => t.action);
  const canConfirm = available.includes('confirm');
  const cancelRequested = order.flags.includes('cancel_requested');
  const canCancel = available.includes('cancel');
  // Đơn sàn huỷ qua sàn; khách đang xin huỷ thì trả lời yêu cầu thay vì huỷ riêng
  const canPlatformCancel =
    available.includes('cancel_on_platform') && !order.flags.includes('cancelling') && !cancelRequested;
  const canDecide = cancelRequested && can(PERMISSIONS.orderCancel);
  const canEditInvoice = can(PERMISSIONS.orderCreate) && order.status !== 'cancelled';
  const canProcess = can(PERMISSIONS.fulfillmentProcess);
  const note =
    isMarketplace && (order.status === 'unpaid' || order.status === 'processing')
      ? 'Đơn sàn: trạng thái thanh toán và giao lấy từ sàn; huỷ đơn sẽ gửi lên sàn.'
      : order.status === 'unpaid' && order.paymentMethod === 'prepaid'
        ? 'Đơn trả trước sang Đang xử lý khi khách thanh toán.'
        : null;

  /** AC-A2: hook đã tải lại đơn sau khi gọi xong, nút đổi theo trạng thái mới */
  const onConflict = () => {
    setDialog(null);
    setDelivering(null);
    setNotice('Đơn vừa được người khác cập nhật. Đã tải lại đơn mới nhất.');
  };

  /** Đồng ý huỷ; từ chối đi qua hộp chọn lý do của sàn */
  const acceptCancel = async () => {
    setNotice(null);
    try {
      await decisionMut.mutateAsync({ id: order.id, version: order.version, decision: 'accept' });
      toast.success(`Đã đồng ý huỷ đơn ${order.code}`);
      setDialog(null);
    } catch (e) {
      const problem = getProblem(e);
      if (problem?.code && CONFLICT_CODES.includes(problem.code)) onConflict();
      else {
        setDialog(null);
        setNotice(problemMessage(e, 'cancel'));
      }
    }
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
        help="Thanh bước là trạng thái đơn; nhãn giai đoạn bên dưới suy từ các kiện, rê chuột để xem nghĩa. Cột phải là thanh toán và lịch sử."
        onTour={startTour}
        action={
          canConfirm || canCancel || canPlatformCancel ? (
            <div className="flex flex-wrap gap-2">
              {canPlatformCancel && (
                <Button variant="outline" onClick={() => setDialog('platform-cancel')}>
                  <XCircle />
                  Huỷ đơn
                </Button>
              )}
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
        <span className="ms-2">Tiền: <PaymentStatusBadge status={order.paymentStatus} /></span>
        <OrderStage order={order} />
        {order.rawMarketplaceStatus && (
          <Badge variant="outline" title="Trạng thái gốc trên sàn">
            Sàn: {order.rawMarketplaceStatus}
          </Badge>
        )}
        {/* Câu giải thích không cần thao tác: đưa vào "?" thay cho Alert (FE#138) */}
        {note && <HelpTip content={note} topic="Trạng thái đơn" />}
      </div>
      {order.completionBlocker && (
        <p className="-mt-2 mb-4 text-sm text-muted-foreground" data-testid="completion-blocker">
          Chưa hoàn tất: {COMPLETION_BLOCKER_LABELS[order.completionBlocker] ?? order.completionBlocker}
          {order.returnWindowEndsAt && order.completionBlocker === 'return_window'
            ? ` (hết hạn trả hàng ${formatDateTime(order.returnWindowEndsAt)})`
            : ''}
        </p>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" data-testid="order-head">
        {order.externalOrderId && (
          <span className="inline-flex items-center gap-1" data-testid="external-order-id">
            <span className="text-muted-foreground">Mã đơn sàn</span>
            <span className="font-mono">{order.externalOrderId}</span>
            <CopyButton value={order.externalOrderId} label="Sao chép mã đơn sàn" />
          </span>
        )}
        <span data-testid="payment-method">
          <span className="text-muted-foreground">Thanh toán</span> {paymentMethodLabel(order)}
        </span>
      </div>

      {order.buyerNote && (
        <div
          className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
          data-testid="buyer-note"
        >
          <span className="font-medium">Khách ghi chú:</span> {order.buyerNote}
        </div>
      )}

      {cancelRequested && (
        <div
          className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
          data-testid="cancel-request"
        >
          <span>Khách xin huỷ đơn trên sàn. Trả lời trước khi đóng gói, sàn không cho đóng gói khi chưa trả lời.</span>
          {canDecide && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setDialog('reject-cancel')} disabled={decisionMut.isPending}>
                Từ chối
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setDialog('accept-cancel')} disabled={decisionMut.isPending}>
                Đồng ý huỷ
              </Button>
            </div>
          )}
        </div>
      )}
      {notice && (
        <AlertMessage severity="error" className="mb-4" onClose={() => setNotice(null)}>
          {notice}
        </AlertMessage>
      )}

      <Card className="mb-4 py-4" data-guide="order-steps">
        <CardContent>
          <LifecycleSteps
            path={ORDER_PATH}
            current={order.status}
            history={order.statusHistory}
            statuses={ORDER_STATUS}
            isFinal={orderMachine.isFinal}
          />
        </CardContent>
      </Card>

      <DetailGrid
        history={
          <StatusTimeline
            history={order.statusHistory}
            statuses={ORDER_STATUS}
            events={lineCancelEvents(order.lines).map((e) => ({
              key: e.key,
              at: e.at,
              content: (
                <div className="grid gap-1" data-testid="line-cancel-event">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{e.title}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {e.at ? formatDateTime(e.at) : 'trước 19/11/2026'}
                    </span>
                  </div>
                  {e.reason && <p>Lý do: {e.reason}</p>}
                  <p className="text-muted-foreground">Tiền hàng còn lại: {formatCurrency(e.remaining)}</p>
                </div>
              ),
            }))}
          />
        }
      >
          <Card className="py-4" data-guide="order-info">
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Info label="Khách">
                {/* Hồ sơ khách ngoài MVP (FE#249): tên khách là chữ, không link */}
                {order.customer?.name ?? '—'}
                {order.customer && <p className="text-muted-foreground">{order.customer.phone}</p>}
              </Info>
              <Info label="Giao tới">
                {order.shippingAddress ? (
                  <>
                    <p>
                      {order.shippingAddress.name} · {order.shippingAddress.phone}
                    </p>
                    <p className="text-muted-foreground" data-testid="shipping-address">
                      {order.shippingAddress.address}
                    </p>
                    {wardNote(order.shippingAddress) && (
                      <p className="text-xs text-muted-foreground" data-testid="shipping-ward">
                        Phường/xã {wardNote(order.shippingAddress)}
                      </p>
                    )}
                    {order.shippingAddress.postCode && (
                      <p className="text-xs text-muted-foreground">Mã bưu chính {order.shippingAddress.postCode}</p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">—</p>
                )}
              </Info>
              {order.note && <Info label="Ghi chú">{order.note}</Info>}
              {!!order.cancelInitiators?.length && (
                <Info label="Người huỷ">
                  <span data-testid="cancel-initiators">{order.cancelInitiators.map(initiatorLabel).join(', ')}</span>
                </Info>
              )}
              {order.cancelReason && <Info label="Lý do huỷ">{order.cancelReason}</Info>}
              <Info label="Số hoá đơn">
                <span className="inline-flex items-center gap-1" data-testid="invoice-number">
                  {order.invoiceNumber ?? '—'}
                  {canEditInvoice && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label="Sửa số hoá đơn"
                      onClick={() => setDialog('invoice')}
                    >
                      <Pencil />
                    </Button>
                  )}
                </span>
              </Info>
            </CardContent>
          </Card>

          <Card className="gap-0 py-0" data-guide="order-lines">
            <div className="overflow-x-auto">
              <Table data-testid="order-lines">
                <TableHeader>
                  <TableRow>
                    <TableHead>Sản phẩm</TableHead>
                    <TableHead className="w-28 text-right">Đơn giá</TableHead>
                    <TableHead className="w-24 text-right">Số lượng</TableHead>
                    <TableHead className="w-32 text-right">Thành tiền</TableHead>
                    {hasPaid && <TableHead className="w-32 text-right">Khách trả</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.lines.map((l) => (
                    <TableRow key={l.id} data-row-id={l.variantId}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <LineThumb src={l.thumbnailUrl} alt={l.productName} />
                          <div>
                            <p className="font-medium">{l.sku || l.externalSku}</p>
                            {l.untracked && <Badge variant="secondary">Không quản tồn</Badge>}
                            {l.externalSku && !l.variantId && !l.untracked && (
                              <div className="flex flex-wrap items-center gap-1" data-testid="line-unmapped">
                                <Badge variant="destructive">Chưa ghép SKU</Badge>
                                {lineMatch.pendingOf(l) && (
                                  <PendingBadge
                                    id={`line-pending-${l.id}`}
                                    pending={lineMatch.pendingOf(l)!}
                                    target={lineMatch.pendingTarget(l)}
                                  />
                                )}
                                {lineMatch.canMatchLine(l) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-xs"
                                    disabled={lineMatch.missingSkuId(l)}
                                    title={
                                      lineMatch.missingSkuId(l)
                                        ? 'Chưa có mã SKU sàn của dòng này. Tải lại SKU sàn ở trang gian hàng rồi ghép'
                                        : undefined
                                    }
                                    onClick={() => lineMatch.open(l)}
                                  >
                                    <Link2 />
                                    Ghép SKU
                                  </Button>
                                )}
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {lineMatch.shopHref(l) ? (
                                <Link
                                  to={lineMatch.shopHref(l)!}
                                  className="underline underline-offset-2 hover:text-foreground"
                                  title="Mở bảng ghép SKU của gian hàng"
                                  data-testid="line-shop-link"
                                >
                                  {l.productName}
                                </Link>
                              ) : (
                                l.productName
                              )}
                              {l.attributesLabel && ` · ${l.attributesLabel}`}
                            </p>
                            {l.externalShopSku && (
                              <p
                                className="text-xs text-muted-foreground"
                                title={l.externalSkuId ? `sku_id ${l.externalSkuId}` : undefined}
                              >
                                SKU sàn {l.externalShopSku}
                              </p>
                            )}
                            <LineIssue line={l} cancelPending={lineCancelPending(order, l)} />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(l.unitPrice)}</TableCell>
                      <TableCell className="text-right">{l.quantity}</TableCell>
                      <TableCell className="text-right">
                        <span className={(l.cancelledQty ?? 0) >= l.quantity ? 'text-muted-foreground line-through' : undefined}>
                          {formatCurrency(l.lineTotal)}
                        </span>
                        {(l.cancelledQty ?? 0) > 0 && (l.cancelledQty ?? 0) < l.quantity && (
                          <p className="text-xs text-muted-foreground">đã huỷ {l.cancelledQty}/{l.quantity}</p>
                        )}
                      </TableCell>
                      {hasPaid && (
                        <TableCell className="text-right">
                          {l.paidPrice != null && (
                            <span
                              className={
                                lineHasIssue(l) && !lineCancelPending(order, l) ? 'text-muted-foreground line-through' : undefined
                              }
                            >
                              {formatCurrency(l.paidPrice)}
                            </span>
                          )}
                          {l.taxAmount ? (
                            <p className="text-xs text-muted-foreground">thuế {formatCurrency(l.taxAmount)}</p>
                          ) : null}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="ms-auto grid w-full max-w-xs gap-2 p-4 text-sm">
              {partlyCancelled && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tiền hàng lúc đặt</span>
                    <span>{formatCurrency(order.subtotal + cancelledAmount)}</span>
                  </div>
                  <div className="flex justify-between" data-testid="cancelled-amount">
                    <span className="text-muted-foreground">Đã huỷ món</span>
                    <span>−{formatCurrency(cancelledAmount)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tạm tính</span>
                <span>{formatCurrency(order.subtotal)}</span>
              </div>
              {order.shippingFeeOriginal != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phí ship gốc</span>
                  <span>{formatCurrency(order.shippingFeeOriginal)}</span>
                </div>
              )}
              {order.shippingFeeDiscountSeller ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shop giảm phí ship</span>
                  <span>−{formatCurrency(order.shippingFeeDiscountSeller)}</span>
                </div>
              ) : null}
              {order.shippingFeeDiscountPlatform ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sàn giảm phí ship</span>
                  <span>−{formatCurrency(order.shippingFeeDiscountPlatform)}</span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {order.shippingFeeOriginal != null ? 'Phí ship khách trả' : 'Phí giao'}
                </span>
                <span>{formatCurrency(order.shippingFee)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-base font-semibold" data-testid="order-total">
                <span>{wholeCancelled ? 'Giá trị lúc đặt' : partlyCancelled ? 'Còn thu' : 'Tổng'}</span>
                <span className={wholeCancelled ? 'text-muted-foreground line-through' : undefined}>{formatCurrency(order.total)}</span>
              </div>
              {wholeCancelled && (
                <p className="text-end text-muted-foreground" data-testid="cancelled-no-charge">
                  Đơn đã huỷ, không thu tiền
                </p>
              )}
            </div>
          </Card>

          <Card className="py-4" data-guide="order-packages">
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
                    return (
                      <TableRow key={p.id} data-row-id={p.code}>
                        <TableCell className="font-medium">
                          {canProcess ? (
                            <Link
                              to={ROUTES.company.package(companyId, p.id)}
                              state={{ backTo: { path: location.pathname + location.search, label: `Về đơn ${order.code}` } }}
                              className="text-primary hover:underline"
                            >
                              {p.code}
                            </Link>
                          ) : (
                            p.code
                          )}
                        </TableCell>
                        <TableCell className="whitespace-normal text-sm">
                          {p.lines.map((l) => `${l.sku} × ${l.quantity}${l.pendingDropQty > 0 ? ` (chờ bỏ ${l.pendingDropQty})` : ''}`).join(', ')}
                          <PackageShipping pkg={p} />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <StatusBadge status={p.status} statuses={PACKAGE_STATUS} />
                            <FlagChips flags={p.flags} meta={PACKAGE_FLAGS} />
                          </div>
                          {/* Đổi ghép SKU khi kiện đã đóng (spec BE#237 §5.5): kho dỡ kiện về kệ để áp ghép mới */}
                          {needsUnload(p) && (
                            <p className="mt-1 text-xs text-destructive" data-testid="unload-task">
                              Dỡ kiện về kệ để áp ghép SKU mới
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
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

          <OrderProfitCard orderId={order.id} companyId={companyId} />
      </DetailGrid>

      <CancelOrderDialog
        order={order}
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        onConflict={onConflict}
      />
      <PlatformCancelDialog
        order={order}
        open={dialog === 'platform-cancel'}
        onClose={() => setDialog(null)}
        onConflict={onConflict}
      />
      <RejectCancelRequestDialog
        order={order}
        open={dialog === 'reject-cancel'}
        onClose={() => setDialog(null)}
        onConflict={onConflict}
      />
      <InvoiceNumberDialog
        order={order}
        open={dialog === 'invoice'}
        onClose={() => setDialog(null)}
        onConflict={onConflict}
      />
      <ConfirmDialog
        open={dialog === 'accept-cancel'}
        title={`Đồng ý huỷ đơn ${order.code}?`}
        message="Đơn huỷ trên sàn theo yêu cầu của khách; kiện đã đóng gói phải mở để trả hàng về kệ."
        confirmLabel="Đồng ý huỷ"
        destructive
        loading={decisionMut.isPending}
        onConfirm={acceptCancel}
        onClose={() => setDialog(null)}
      />
      {lineMatch.dialog}
      {delivering && (
        <DeliveryDialog pkg={delivering} open onClose={() => setDelivering(null)} onConflict={onConflict} />
      )}
    </div>
  );
}
