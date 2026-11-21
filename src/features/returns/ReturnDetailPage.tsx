import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Money } from '@/components/common/Money';
import { ReasonDialog } from '@/components/common/ReasonDialog';
import { StatusBadge } from '@/components/common/StatusBadge';
import { StatusTimeline } from '@/components/common/StatusTimeline';
import { AttachmentField } from '@/components/common/AttachmentField';
import { HelpTip } from '@/components/common/HelpTip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  type ReturnCommand,
  useReceiveReturn,
  useReturn,
  useReturnCommand,
  useReturnPlatformHistory,
} from '@/api/returns.api';
import { getProblem } from '@/api/client';
import { isRouteMissing, problemMessage } from '@/api/problemMessages';
import { conflictCurrent } from '@/features/identity/shared';
import { DetailGrid, DocLink, Info, PageError, PageLoading } from '@/features/purchasing/parts';
import { useAuth } from '@/hooks/useAuth';
import { useCan, useTransitionActor } from '@/hooks/usePermission';
import { returnMachine } from '@/lib/machines/returns';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatDateTime } from '@/utils/format';
import type { ReturnAction, ReturnRequest } from '@/types/returns';
import { ACTION_MESSAGES, CLOSE_RESULT_LABELS, RETURN_STATUS } from './shared';
import { PlatformRejectDialog } from './PlatformRejectDialog';
import { RespondByBadge } from './RespondByBadge';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';

/** Thao tác của bảng chuyển → lệnh gửi API (receive đi qua quét nhận) */
const COMMANDS: Partial<Record<ReturnAction, ReturnCommand['kind']>> = {
  accept: 'accept',
  reject: 'reject',
  refund_only: 'refund-only',
  platform_reopen: 'platform-reopen',
  platform_refund: 'platform-refund',
  no_show: 'no-show',
};

/** Câu toast sau khi thao tác xong, nối mã yêu cầu ở cuối */
const DONE_MESSAGES: Partial<Record<ReturnAction, string>> = {
  accept: 'Đã chấp nhận trả hàng cho yêu cầu',
  reject: 'Đã từ chối yêu cầu',
  refund_only: 'Đã hoàn tiền, khách giữ hàng, cho yêu cầu',
  platform_reopen: 'Đã ghi nhận sàn duyệt cho khách trả hàng, yêu cầu',
  platform_refund: 'Đã ghi nhận sàn duyệt cho khách hoàn tiền, yêu cầu',
  no_show: 'Đã đóng vì khách không gửi hàng, yêu cầu',
};

type Pending = { action: ReturnAction; label: string; needsReason: boolean };

/** Lịch sử đơn ngược phía sàn: reverse_status, ofc_status gốc (§20.1) */
function PlatformHistory({ returnId }: { returnId: string }) {
  const query = useReturnPlatformHistory(returnId);
  if (query.isLoading) return <Skeleton className="h-24 w-full" />;
  if (query.isError) return <AlertMessage severity="error">{problemMessage(query.error)}</AlertMessage>;
  const items = query.data?.items ?? [];
  if (!items.length) return <p className="text-sm text-muted-foreground">Sàn chưa có cập nhật nào.</p>;
  return (
    <Table data-testid="platform-history">
      <TableHeader>
        <TableRow>
          <TableHead className="w-40">Thời gian</TableHead>
          <TableHead className="w-44">Trạng thái trả hàng</TableHead>
          <TableHead className="w-52">Trạng thái hàng hoàn</TableHead>
          <TableHead>Ghi chú</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((h, i) => (
          <TableRow key={`${h.at}-${i}`}>
            <TableCell>{formatDateTime(h.at)}</TableCell>
            <TableCell className="font-mono text-xs">{h.reverseStatus}</TableCell>
            <TableCell className="font-mono text-xs">{h.ofcStatus ?? '—'}</TableCell>
            <TableCell className="whitespace-normal">{h.note ?? '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Chi tiết yêu cầu trả (sơ đồ D3): dòng trả theo kiện, tiền, phiếu kiểm hàng về, nút theo bảng chuyển */
export function ReturnDetailPage() {
  const { returnId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const actor = useTransitionActor();
  const can = useCan();
  const query = useReturn(returnId);
  useBreadcrumb(query.data?.code);
  const command = useReturnCommand();
  const receive = useReceiveReturn();
  const [pending, setPending] = useState<Pending | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const back = () => navigate(ROUTES.company.returns(companyId));

  if (query.isLoading) return <PageLoading />;
  if (query.isError || !query.data) {
    const notFound = getProblem(query.error)?.status === 404 && !isRouteMissing(query.error);
    return <PageError message={notFound ? 'Không tìm thấy yêu cầu trả hàng' : problemMessage(query.error)} onBack={back} />;
  }
  const r = query.data;
  const actions = returnMachine.available(r.status, actor, { source: r.source });
  const loading = command.isPending || receive.isPending;

  const run = async (p: Pending, reason?: string) => {
    setError(null);
    try {
      if (p.action === 'receive') {
        await receive.mutateAsync({ code: r.code });
        toast.success(`Đã nhận hàng hoàn ${r.code} và tạo phiếu kiểm hàng hoàn`);
      } else {
        const kind = COMMANDS[p.action]!;
        const cmd = (reason ? { kind, reason } : { kind }) as ReturnCommand;
        await command.mutateAsync({ id: r.id, version: r.version, command: cmd });
        toast.success(`${DONE_MESSAGES[p.action] ?? 'Đã cập nhật yêu cầu'} ${r.code}`);
      }
      setPending(null);
    } catch (e) {
      if (conflictCurrent<ReturnRequest>(e)) toast.warning('Yêu cầu vừa được cập nhật, đã tải lại');
      const fieldError = Object.values(getProblem(e)?.errors ?? {})[0];
      setError(fieldError ?? problemMessage(e));
    }
  };

  const open = (action: ReturnAction, label: string, needsReason = false) => {
    setError(null);
    // Yêu cầu từ sàn: lý do từ chối theo danh sách của sàn, kèm ảnh (§20.1)
    if (action === 'reject' && r.source === 'marketplace') {
      setRejecting(true);
      return;
    }
    setPending({ action, label, needsReason });
  };

  const canCost = can(PERMISSIONS.costView);

  return (
    <div className="grid gap-4">
      <PageHeader
        title={`Yêu cầu trả hàng ${r.code}`}
        subtitle={`Đơn ${r.order.code}`}
        action={
          <Button variant="outline" onClick={back}>
            Về danh sách
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2" data-testid="return-status">
        <StatusBadge status={r.status} statuses={RETURN_STATUS} />
        {r.closeResult && <Badge variant="outline">{CLOSE_RESULT_LABELS[r.closeResult]}</Badge>}
        {r.rawMarketplaceStatus && <Badge variant="outline">Sàn: {r.rawMarketplaceStatus}</Badge>}
        {r.platform?.disputeInProgress && <Badge variant="outline">Khách đang khiếu nại trên sàn</Badge>}
        <RespondByBadge status={r.status} respondBy={r.platform?.respondBy} />
        <HelpTip
          topic="Trạng thái yêu cầu"
          content={
            r.source === 'marketplace'
              ? 'Yêu cầu từ sàn, trạng thái cập nhật theo sàn. Nếu khách khiếu nại và sàn duyệt cho khách, yêu cầu được mở lại.'
              : 'Yêu cầu tạo thủ công: Chờ phản hồi → Chờ hàng hoàn về → Đã nhận hàng hoàn → Đã đóng.'
          }
        />
      </div>

      {actions.length > 0 && (
        <Card className="py-4">
          <CardContent className="flex flex-wrap items-center gap-2" data-testid="return-actions">
            {actions.map((t) => (
              <Button
                key={t.action}
                variant={t.action === 'reject' || t.action === 'no_show' ? 'destructive' : t.action === 'accept' || t.action === 'receive' ? 'default' : 'outline'}
                disabled={loading}
                onClick={() => open(t.action, t.label, Boolean(t.needsReason))}
              >
                {t.label}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      <DetailGrid
        history={
          r.source === 'marketplace' ? (
            <Tabs defaultValue="app">
              <TabsList>
                <TabsTrigger value="app">Trên Commerio</TabsTrigger>
                <TabsTrigger value="platform">Trên sàn</TabsTrigger>
              </TabsList>
              <TabsContent value="app" className="pt-2">
                <StatusTimeline history={r.statusHistory} statuses={RETURN_STATUS} />
              </TabsContent>
              <TabsContent value="platform" className="overflow-x-auto pt-2">
                <PlatformHistory returnId={r.id} />
              </TabsContent>
            </Tabs>
          ) : (
            <StatusTimeline history={r.statusHistory} statuses={RETURN_STATUS} />
          )
        }
      >
      <Card className="py-4">
        <CardHeader>
          <CardTitle className="text-base">Thông tin</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Info label="Đơn">
            <Link className="text-primary underline-offset-4 hover:underline" to={ROUTES.company.order(companyId, r.order.id)}>
              {r.order.code}
            </Link>
          </Info>
          <Info label="Nguồn">{r.source === 'marketplace' ? `Sàn · ${r.shopName ?? ''}` : 'Tạo thủ công'}</Info>
          <Info label="Người mua">{r.customerName ?? '—'}</Info>
          <Info label="Lý do trả hàng">{r.reason}</Info>
          {r.rejectReason && (
            <Info label="Lý do từ chối">
              <span className="inline-flex items-center gap-1">
                {r.rejectReason.label}
                <HelpTip topic="Lý do từ chối" content="Lý do chọn từ danh sách của sàn khi từ chối; sàn dựa vào đó và ảnh bằng chứng để xét khiếu nại của khách." />
              </span>
            </Info>
          )}
          {r.platform && (
            <Info label="Trạng thái trên sàn">
              <span className="font-mono text-xs" data-testid="platform-status">
                {r.platform.reverseStatus}
                {r.platform.ofcStatus ? ` · ${r.platform.ofcStatus}` : ''}
              </span>
            </Info>
          )}
          <Info label="Mã vận đơn hàng hoàn">{r.returnTrackingCode ?? '—'}</Info>
          <Info label="Ngày tạo">{formatDateTime(r.createdAt)}</Info>
          {r.receivedAt && (
            <Info label="Ngày nhận hàng hoàn">
              {formatDateTime(r.receivedAt)}
              {r.receivedBy ? ` · ${r.receivedBy.name}` : ''}
            </Info>
          )}
          {r.inspection && (
            <Info label="Phiếu kiểm hàng hoàn">
              <DocLink companyId={companyId} docRef={r.inspection} />
            </Info>
          )}
          {r.attachments.length > 0 && (
            <div className="sm:col-span-3">
              <Info label="Ảnh bằng chứng gửi sàn">
                <AttachmentField value={r.attachments} onChange={() => undefined} disabled />
              </Info>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="py-4">
        <CardHeader>
          <CardTitle className="text-base">Sản phẩm trả</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table data-testid="return-lines">
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">SKU</TableHead>
                <TableHead>Sản phẩm</TableHead>
                <TableHead className="w-32">Kiện hàng</TableHead>
                <TableHead className="w-20 text-right">SL trả</TableHead>
                <TableHead className="w-32 text-right">Đơn giá</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.lines.map((l) => (
                <TableRow key={`${l.packageId}-${l.variantId}`} data-row-id={l.sku}>
                  <TableCell className="font-mono font-medium">{l.sku}</TableCell>
                  <TableCell className="whitespace-normal">
                    {l.productName}
                    {l.attributesLabel && <span className="text-muted-foreground"> · {l.attributesLabel}</span>}
                  </TableCell>
                  <TableCell>
                    {can(PERMISSIONS.fulfillmentProcess) ? (
                      <Link className="text-primary underline-offset-4 hover:underline" to={ROUTES.company.package(companyId, l.packageId)}
                        state={{ backTo: { path: location.pathname + location.search, label: `Về yêu cầu ${r.code}` } }}
                      >
                        {l.packageCode}
                      </Link>
                    ) : (
                      l.packageCode
                    )}
                  </TableCell>
                  <TableCell className="text-right">{l.quantity}</TableCell>
                  <TableCell className="text-right">
                    <Money value={l.unitPrice} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="py-4">
        <CardHeader>
          <CardTitle className="text-base">Hoàn tiền</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3" data-testid="return-money">
          <Info label="Số tiền hoàn">
            <Money value={r.money.refundAmount} />
            <span className="ms-2 text-muted-foreground">{r.money.refunded ? 'Đã hoàn' : 'Chưa hoàn'}</span>
          </Info>
          <Info label="SL bán lại">{r.money.resellQty ?? 'Chờ kiểm hàng hoàn'}</Info>
          {canCost && (
            <Info label="Giảm giá vốn hàng trả lại (phần bán lại)">
              {r.money.resellCost === null ? '—' : <Money value={r.money.resellCost} />}
            </Info>
          )}
        </CardContent>
      </Card>

      </DetailGrid>

      <ConfirmDialog
        open={Boolean(pending && !pending.needsReason)}
        title={pending?.label ?? ''}
        message={
          <>
            {pending?.action === 'receive'
              ? `Nhận hàng hoàn ${r.code}. Hệ thống tạo phiếu kiểm hàng hoàn để kho phân loại: bán lại, hỏng, trả hàng NCC.`
              : pending && ACTION_MESSAGES[pending.action]}
            {error && (
              <AlertMessage severity="error" className="mt-3">
                {error}
              </AlertMessage>
            )}
          </>
        }
        confirmLabel={pending?.label ?? ''}
        loading={loading}
        onConfirm={() => pending && void run(pending)}
        onClose={() => setPending(null)}
      />
      <ReasonDialog
        open={Boolean(pending?.needsReason)}
        title={pending?.label ?? ''}
        message={pending?.action === 'no_show' ? 'Yêu cầu đóng, không hoàn tiền, không có hàng về kho.' : undefined}
        destructive
        loading={loading}
        error={error}
        onConfirm={(reason) => pending && void run(pending, reason)}
        onClose={() => setPending(null)}
      />
      {r.source === 'marketplace' && (
        <PlatformRejectDialog request={r} open={rejecting} onClose={() => setRejecting(false)} />
      )}
    </div>
  );
}
