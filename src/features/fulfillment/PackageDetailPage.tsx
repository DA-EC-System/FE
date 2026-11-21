import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { FlagChips } from '@/components/common/FlagChips';
import { HelpTip } from '@/components/common/HelpTip';
import { ReasonDialog } from '@/components/common/ReasonDialog';
import { StatusBadge } from '@/components/common/StatusBadge';
import { StatusTimeline } from '@/components/common/StatusTimeline';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  type PackageCommand,
  useHandOver,
  usePackage,
  usePackageCommand,
  usePrintPackageDocuments,
} from '@/api/fulfillment.api';
import { getProblem } from '@/api/client';
import { isRouteMissing, problemMessage } from '@/api/problemMessages';
import { conflictCurrent } from '@/features/identity/shared';
import { DetailGrid, PageError, PageLoading } from '@/features/purchasing/parts';
import { sourceLabel } from '@/features/sales/shared';
import { useAuth } from '@/hooks/useAuth';
import { useCan, useTransitionActor } from '@/hooks/usePermission';
import { PERMISSIONS } from '@/utils/permissions';
import { ROUTES } from '@/router/routes';
import { formatDateTime } from '@/utils/format';
import type { Package, PackageAction } from '@/types/fulfillment';
import { OPEN_PURPOSE_LABELS, PACKAGE_ACTION_LABELS, PACKAGE_FLAGS, PACKAGE_STATUS, canPrintLabel, handoverFailureLabel, packageBackTo, packageButtons, shippingProviderTypeLabel } from './shared';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { PendingDropBadge } from './PendingDropBadge';
import { SplitPackageDialog } from './SplitPackageDialog';
import { ScannedLines } from './ScannedLines';
import { checkScanRows, scanErrorsOf, scanRowsFrom, type ScanRow } from './scanLines';

type Pending =
  | { kind: 'confirm'; title: string; message: string; label: string; destructive?: boolean; command: PackageCommand }
  | { kind: 'reason'; title: string; label: string; build: (reason: string) => PackageCommand }
  | { kind: 'code'; title: string; label: string }
  /** Nhận hàng về: kho nhập số quét thật từng món (FE#212) */
  | { kind: 'scan'; action: 'receive-return' | 'found' };

/** Thao tác chuyển thẳng, không hỏi lại */
const DIRECT: Partial<Record<PackageAction, PackageCommand>> = {
  mark_ready: { kind: 'ready' },
  self_deliver: { kind: 'self-deliver' },
  deliver: { kind: 'delivery', action: 'deliver' },
  redeliver: { kind: 'delivery', action: 'redeliver' },
  redeliver_self: { kind: 'delivery', action: 'redeliver' },
};

/** Chi tiết kiện (sơ đồ D2): nút theo bảng chuyển, lịch sử trạng thái */
export function PackageDetailPage() {
  const { packageId = '' } = useParams();
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const actor = useTransitionActor();
  const can = useCan();
  const query = usePackage(packageId);
  useBreadcrumb(query.data?.code);
  const command = usePackageCommand();
  const handOver = useHandOver();
  const printDocs = usePrintPackageDocuments();
  const [pending, setPending] = useState<Pending | null>(null);
  const [splitting, setSplitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [scanRows, setScanRows] = useState<ScanRow[]>([]);
  const [scanErrors, setScanErrors] = useState<Record<string, string> | null>(null);
  const location = useLocation();
  const backTo = packageBackTo(location.state);
  const back = () => navigate(backTo?.path ?? ROUTES.company.packages(companyId));

  useEffect(() => {
    setCode('');
    setError(null);
    setScanErrors(null);
  }, [pending]);

  if (query.isLoading) return <PageLoading />;
  if (query.isError || !query.data) {
    const notFound = getProblem(query.error)?.status === 404 && !isRouteMissing(query.error);
    return <PageError message={notFound ? 'Không tìm thấy kiện hàng' : problemMessage(query.error)} onBack={back} />;
  }
  const p = query.data;
  const buttons = packageButtons(p, actor);

  const run = async (cmd: PackageCommand, done: string) => {
    setError(null);
    try {
      await command.mutateAsync({ id: p.id, version: p.version, command: cmd });
      toast.success(done);
      setPending(null);
    } catch (e) {
      if (conflictCurrent<Package>(e)) toast.warning('Kiện vừa được cập nhật, đã tải lại');
      const problem = getProblem(e);
      // Lỗi từng dòng quét hiện ngay ở dòng đó, giữ câu của BE
      const lineErrors = pending?.kind === 'scan' ? scanErrorsOf(problem?.errors) : null;
      if (lineErrors) {
        setScanErrors(lineErrors);
        setError(problem?.errors?.code ?? null);
        return;
      }
      const fieldError = problem?.errors ? Object.values(problem.errors)[0] : undefined;
      const message = problemMessage(e, cmd.kind === 'ready' ? 'rts' : undefined);
      if (pending) setError(fieldError ?? message);
      else toast.error(message);
    }
  };

  const doHandOver = async () => {
    try {
      const r = await handOver.mutateAsync([{ id: p.id, version: p.version }]);
      if (r.failed[0]) toast.error(handoverFailureLabel(r.failed[0].code));
      else toast.success(`Đã bàn giao kiện ${p.code}`);
    } catch (e) {
      toast.error(problemMessage(e));
    }
  };

  const onAction = (a: PackageAction) => {
    const label = PACKAGE_ACTION_LABELS[a];
    if (a === 'pack') return navigate(ROUTES.company.packScan(companyId, p.id), { state: location.state });
    if (a === 'hand_over') return void doHandOver();
    const direct = DIRECT[a];
    if (direct) return void run(direct, `${p.code}: ${label}`);
    switch (a) {
      case 'undo_handover':
        return setPending({ kind: 'reason', title: 'Huỷ bàn giao', label: 'Lý do', build: (reason) => ({ kind: 'undo-handover', reason }) });
      case 'fail':
        return setPending({
          kind: 'reason',
          title: 'Báo giao thất bại',
          label: 'Lý do giao không thành công',
          build: (reason) => ({ kind: 'delivery', action: 'fail', reason }),
        });
      case 'return':
        return setPending({
          kind: 'confirm',
          title: 'Chuyển hoàn hàng',
          message: `Kiện ${p.code} chuyển sang Đang hoàn hàng. Khi hàng về, quét mã kiện để nhận.`,
          label: 'Chuyển hoàn hàng',
          command: { kind: 'delivery', action: 'return' },
        });
      case 'open':
      case 'open_cancel':
        return setPending({
          kind: 'confirm',
          title: label,
          message:
            a === 'open_cancel'
              ? `Mở kiện ${p.code}, trả hàng về kệ. Kiện bị huỷ, số hàng tạm giữ được trả về Có thể bán.`
              : p.status === 'awaiting_pickup'
                ? // Kiện Chờ lấy hàng chờ mở (D25): giữ vận đơn, không gọi sàn; đóng lại rồi báo sẵn sàng lại
                  `Mở kiện ${p.code} để sửa. Kiện quay về Chờ đóng gói, giữ nguyên mã vận đơn ${p.trackingCode ?? ''}: đóng gói lại rồi bấm Sẵn sàng giao lại, không cần lấy mã vận đơn mới.`.replace(
                    '  ',
                    ' ',
                  )
                : `Mở kiện ${p.code} để sửa. Kiện quay về Chờ đóng gói, cần đóng gói lại.${
                    // eslint-disable-next-line no-restricted-syntax -- chờ capability từ BE (audit nhieu-san bước 3), không thêm chỗ mới
                    p.shop?.platform === 'lazada' && p.platformPackageCode ? ' Sàn huỷ mã kiện cũ (repack), đóng gói lại sẽ lấy mã kiện và mã vận đơn mới.' : ''
                  }`,
          label,
          destructive: a === 'open_cancel',
          command: { kind: 'open' },
        });
      case 'receive_return':
      case 'found':
        setScanRows(scanRowsFrom(p.lines));
        return setPending({ kind: 'scan', action: a === 'found' ? 'found' : 'receive-return' });
      case 'lose':
        return setPending({
          kind: 'confirm',
          title: 'Xác nhận thất lạc',
          message: `${p.lostReport?.by.name ?? 'Người khác'} đã báo thất lạc kiện ${p.code} (khiếu nại ${p.lostReport?.claimCode ?? '—'}). Xác nhận kiện thất lạc?`,
          label: 'Xác nhận thất lạc',
          destructive: true,
          command: { kind: 'confirm-lost' },
        });
      case 'lose_on_unload':
        // Kiện đã đóng chờ mở mà dỡ về kệ không thấy (commerio-backend#238): BE ghi bàn giao rồi chuyển thất lạc
        return setPending({
          kind: 'confirm',
          title: 'Dỡ kiện không thấy',
          message: `${p.lostReport?.by.name ?? 'Người khác'} báo không tìm thấy kiện ${p.code} khi dỡ về kệ (${p.lostReport?.claimCode ?? '—'}). Xác nhận kiện thất lạc? Hàng trong kiện được ghi là đã rời kho.`,
          label: 'Xác nhận thất lạc',
          destructive: true,
          command: { kind: 'confirm-lost' },
        });
      default:
        return undefined;
    }
  };

  const submitCode = () => {
    if (pending?.kind !== 'code') return;
    const v = code.trim();
    if (!v) return setError(sealedLost ? 'Nhập ghi chú' : 'Nhập mã khiếu nại');
    void run({ kind: 'report-lost', claimCode: v }, `Đã báo thất lạc ${p.code}, chờ người khác xác nhận`);
  };

  const submitScan = () => {
    if (pending?.kind !== 'scan') return;
    const v = code.trim();
    const checked = checkScanRows(scanRows);
    const blocked = Object.keys(checked.errors).length > 0;
    setScanErrors(blocked ? checked.errors : null);
    const codeMissing = pending.action === 'receive-return' && !v;
    setError(codeMissing ? 'Quét hoặc nhập mã' : null);
    if (blocked || codeMissing) return;
    if (pending.action === 'found') return void run({ kind: 'found', lines: checked.lines }, `Đã nhận kiện tìm thấy ${p.code}`);
    void run({ kind: 'receive-return', code: v, lines: checked.lines }, `Đã nhận hàng hoàn ${p.code}`);
  };

  const print = async () => {
    try {
      await printDocs.mutateAsync({ ids: [p.id] });
    } catch (e) {
      toast.error(problemMessage(e));
    }
  };

  const loading = command.isPending || handOver.isPending;
  // Báo mất kiện còn trong kho (dỡ kiện không thấy): chưa có khiếu nại với đơn vị vận chuyển, ô là ghi chú
  const sealedLost = p.status === 'packed' || p.status === 'awaiting_pickup';
  // Thất lạc do sàn báo (`platform_lost`), không có người báo
  const platformLost =
    p.status === 'lost' && [...p.statusHistory].reverse().find((h) => h.to === 'lost')?.source === 'marketplace';
  // In khi sàn đã cấp vận đơn: Lazada từ lúc đóng gói, TikTok sau khi báo sàn (§19.3, commerio-backend#239 KH-B03)
  const printable = canPrintLabel(p);
  // Báo sàn mất tới vài chục giây: nút báo đang làm gì (KH-U13)
  const reporting = command.isPending && command.variables?.command.kind === 'ready';
  // Tách kiện: kiện chưa đóng gói còn hơn một món (21 mục 19.2)
  const splittable =
    can(PERMISSIONS.fulfillmentProcess) && (p.status === 'reserved' || p.status === 'backordered') && p.totalQty > 1;
  const hasActions = buttons.actions.length > 0 || buttons.reportLost || printable || splittable || Boolean(buttons.lostNote);
  // Gộp cảnh báo theo dữ liệu kiện vào một khung
  const warnings = [
    p.flagNote,
    p.flags.includes('needs_open') && p.openPurpose ? `Cần mở lại kiện: ${OPEN_PURPOSE_LABELS[p.openPurpose]}` : null,
    p.lostReport && p.status !== 'lost'
      ? sealedLost
        ? `${p.lostReport.by.name} báo dỡ kiện không thấy lúc ${formatDateTime(p.lostReport.at)}: ${p.lostReport.claimCode}. Cần người khác xác nhận.`
        : `${p.lostReport.by.name} báo thất lạc lúc ${formatDateTime(p.lostReport.at)}, mã khiếu nại ${p.lostReport.claimCode}. Cần người khác xác nhận.`
      : null,
    platformLost ? 'Sàn báo kiện thất lạc. Theo dõi bồi thường với sàn.' : null,
    buttons.blocked,
  ].filter((w): w is string => Boolean(w));

  return (
    <div className="grid gap-4">
      <PageHeader
        title={`Kiện hàng ${p.code}`}
        subtitle={`Đơn hàng ${p.order.code}`}
        action={
          <Button variant="outline" onClick={back}>
            {backTo?.label ?? 'Về danh sách kiện'}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2" data-testid="package-status">
        <StatusBadge status={p.status} statuses={PACKAGE_STATUS} />
        <FlagChips flags={p.flags} meta={PACKAGE_FLAGS} />
        {p.selfDelivery && <Badge variant="outline">Shop tự giao</Badge>}
        <HelpTip
          topic="Trạng thái kiện"
          content="Kiện đi theo bước Chờ đóng gói → Đã đóng gói → Chờ lấy hàng → Đang giao → Đã giao. Nút thao tác đổi theo bước hiện tại; rê chuột vào nhãn cảnh báo để xem nghĩa."
        />
      </div>

      {(warnings.length > 0 || p.replaces) && (
        <AlertMessage severity="warning">
          <div className="grid gap-1" data-testid="package-warnings">
            {warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
            {p.replaces && (
              <p data-testid="package-replaces">
                Kiện này thay kiện{' '}
                <Link
                  className="text-primary underline-offset-4 hover:underline"
                  to={ROUTES.company.package(companyId, p.replaces.id)}
                  state={location.state}
                >
                  {p.replaces.code}
                </Link>{' '}
                do sàn chia lại kiện (kiện cũ: {PACKAGE_STATUS[p.replaces.status]?.label ?? p.replaces.status}).
              </p>
            )}
          </div>
        </AlertMessage>
      )}

      {(hasActions || buttons.note) && (
        <Card className="py-4">
          <CardContent className="flex flex-wrap items-center gap-2" data-testid="package-actions">
            {buttons.actions.map((a) => (
              <Button
                key={a}
                variant={
                  a === 'open_cancel' || a === 'lose' || a === 'lose_on_unload' || a === 'fail'
                    ? 'destructive'
                    : a === 'pack' || a === 'hand_over'
                      ? 'default'
                      : 'outline'
                }
                disabled={loading}
                onClick={() => onAction(a)}
              >
                {a === 'mark_ready' && reporting ? 'Đang báo sàn…' : PACKAGE_ACTION_LABELS[a]}
              </Button>
            ))}
            {buttons.reportLost && (
              <Button
                variant="outline"
                disabled={loading}
                onClick={() =>
                  setPending(
                    sealedLost
                      ? { kind: 'code', title: 'Báo dỡ kiện không thấy', label: 'Ghi chú (vd: không thấy trên kệ)' }
                      : { kind: 'code', title: 'Báo thất lạc', label: 'Mã khiếu nại với đơn vị vận chuyển' },
                  )
                }
              >
                {sealedLost ? 'Báo không thấy kiện' : 'Báo thất lạc'}
              </Button>
            )}
            {splittable && (
              <Button variant="outline" disabled={loading} onClick={() => setSplitting(true)}>
                Tách kiện
              </Button>
            )}
            {printable && (
              <Button variant="outline" disabled={printDocs.isPending} onClick={print}>
                {printDocs.isPending ? 'Đang lấy phiếu giao hàng...' : 'In phiếu giao hàng'}
              </Button>
            )}
            {buttons.note && <span className="text-sm text-muted-foreground">{buttons.note}</span>}
            {buttons.lostNote && (
              <span className="text-sm text-muted-foreground" data-testid="lost-note">
                {buttons.lostNote}
              </span>
            )}
          </CardContent>
        </Card>
      )}

      <DetailGrid history={<StatusTimeline history={p.statusHistory} statuses={PACKAGE_STATUS} />}>
      <Card className="py-4">
        <CardHeader>
          <CardTitle className="text-base">Thông tin</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground">Đơn hàng</p>
            <Link className="text-primary underline-offset-4 hover:underline" to={ROUTES.company.order(companyId, p.order.id)}>
              {p.order.code}
            </Link>
          </div>
          <div>
            <p className="text-muted-foreground">Kênh bán</p>
            <p>{sourceLabel(p)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Người mua</p>
            <p>{p.customerName ?? '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Mã vận đơn</p>
            <p>{p.trackingCode ?? '—'}</p>
          </div>
          {p.source === 'marketplace' && (
            <>
              <div>
                <p className="text-muted-foreground">Đơn vị vận chuyển</p>
                <p data-testid="package-carrier">{p.carrier?.name ?? p.shipmentProvider ?? '—'}</p>
              </div>
              {p.shippingProviderType && (
                <div>
                  <p className="text-muted-foreground">Loại vận chuyển</p>
                  <p>{shippingProviderTypeLabel(p.shippingProviderType)}</p>
                </div>
              )}
              {p.promisedShippingAt && (
                <div>
                  <p className="text-muted-foreground">Hạn gửi hàng của sàn</p>
                  <p>{formatDateTime(p.promisedShippingAt)}</p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground">Mã kiện hàng sàn</p>
                <p>{p.platformPackageCode ?? '—'}</p>
              </div>
            </>
          )}
          <div>
            <p className="text-muted-foreground">Hạn bàn giao</p>
            <p>{p.shipBy ? formatDateTime(p.shipBy) : '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Thời gian bàn giao</p>
            <p>{p.handedOverAt ? formatDateTime(p.handedOverAt) : '—'}</p>
          </div>
          {p.deliveredAt && (
            <div>
              <p className="text-muted-foreground">Thời gian giao</p>
              <p>
                {formatDateTime(p.deliveredAt)}
                {p.deliveredBy ? ` · ${p.deliveredBy.name}` : ''}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="py-4">
        <CardHeader>
          <CardTitle className="text-base">Sản phẩm trong kiện</CardTitle>
        </CardHeader>
        <CardContent>
          <Table data-testid="package-lines">
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">SKU</TableHead>
                <TableHead>Sản phẩm</TableHead>
                <TableHead>Phân loại</TableHead>
                <TableHead className="w-24 text-right">Số lượng</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.lines.map((l) => (
                <TableRow key={l.id} data-row-id={l.sku}>
                  <TableCell>
                    <p className="font-mono font-medium">{l.sku}</p>
                    {l.variantId && l.externalSku && l.externalSku !== l.sku && (
                      <p className="font-mono text-xs text-muted-foreground">SKU sàn {l.externalSku}</p>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {l.productName}
                    {l.untracked ? (
                      <Badge variant="secondary" className="ms-2">
                        Không quản lý tồn
                      </Badge>
                    ) : (
                      !l.variantId && (
                        <Badge variant="destructive" className="ms-2">
                          Chưa liên kết SKU
                        </Badge>
                      )
                    )}
                  </TableCell>
                  <TableCell>{l.attributesLabel || '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <PendingDropBadge qty={l.pendingDropQty} />
                      {l.quantity}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </DetailGrid>

      <ConfirmDialog
        open={pending?.kind === 'confirm'}
        title={pending?.kind === 'confirm' ? pending.title : ''}
        message={
          <>
            {pending?.kind === 'confirm' ? pending.message : ''}
            {error && (
              <AlertMessage severity="error" className="mt-3">
                {error}
              </AlertMessage>
            )}
          </>
        }
        confirmLabel={pending?.kind === 'confirm' ? pending.label : ''}
        destructive={pending?.kind === 'confirm' && pending.destructive}
        loading={command.isPending}
        onConfirm={() => pending?.kind === 'confirm' && void run(pending.command, `${p.code}: ${pending.label}`)}
        onClose={() => setPending(null)}
      />
      <ReasonDialog
        open={pending?.kind === 'reason'}
        title={pending?.kind === 'reason' ? pending.title : ''}
        label={pending?.kind === 'reason' ? pending.label : undefined}
        destructive
        loading={command.isPending}
        error={error}
        onConfirm={(reason) => pending?.kind === 'reason' && void run(pending.build(reason), `${p.code}: ${pending.title}`)}
        onClose={() => setPending(null)}
      />
      <SplitPackageDialog
        pkg={splitting ? p : null}
        onClose={() => setSplitting(false)}
        onConflict={() => {
          setSplitting(false);
          toast.warning('Kiện vừa được cập nhật, đã tải lại');
        }}
      />
      <Dialog open={pending?.kind === 'code'} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pending?.kind === 'code' ? pending.title : ''}</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submitCode();
            }}
          >
            <Label htmlFor="package-code-input">{pending?.kind === 'code' ? pending.label : ''}</Label>
            <Input id="package-code-input" value={code} onChange={(e) => setCode(e.target.value)} aria-invalid={Boolean(error)} />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={() => setPending(null)}>
                Huỷ
              </Button>
              <Button type="submit" disabled={command.isPending}>
                Xác nhận
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={pending?.kind === 'scan'} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className="sm:max-w-2xl" data-testid="package-scan-dialog">
          <DialogHeader>
            <DialogTitle>
              {pending?.kind === 'scan' && pending.action === 'found' ? `Nhận kiện tìm thấy ${p.code}` : `Quét nhận hàng hoàn ${p.code}`}
            </DialogTitle>
            <DialogDescription>
              Nhập số lượng thực nhận của từng SKU. Thiếu thì giảm số (0 là không có), có SKU ngoài danh sách thì thêm. Số này
              vào khu Hàng lỗi/chờ kiểm, chưa cộng vào Có thể bán.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              submitScan();
            }}
          >
            {pending?.kind === 'scan' && pending.action === 'receive-return' && (
              <div className="grid gap-2">
                <Label htmlFor="package-code-input">Mã kiện hoặc mã vận đơn</Label>
                <Input id="package-code-input" value={code} onChange={(e) => setCode(e.target.value)} aria-invalid={Boolean(error)} />
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <ScannedLines rows={scanRows} onChange={setScanRows} errors={scanErrors} disabled={command.isPending} />
            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={() => setPending(null)}>
                Huỷ
              </Button>
              <Button type="submit" disabled={command.isPending}>
                Xác nhận
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
