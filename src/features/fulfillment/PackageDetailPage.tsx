import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, PackageCheck, Printer } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { FlagChips } from '@/components/common/FlagChips';
import { ReasonDialog } from '@/components/common/ReasonDialog';
import { StatusBadge } from '@/components/common/StatusBadge';
import { StatusTimeline } from '@/components/common/StatusTimeline';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { problemMessage } from '@/api/problemMessages';
import { conflictCurrent } from '@/features/identity/shared';
import { PageError, PageLoading } from '@/features/purchasing/parts';
import { sourceLabel } from '@/features/sales/shared';
import { useAuth } from '@/hooks/useAuth';
import { useTransitionActor } from '@/hooks/usePermission';
import { ROUTES } from '@/router/routes';
import { formatDateTime } from '@/utils/format';
import type { Package, PackageAction } from '@/types/fulfillment';
import { OPEN_PURPOSE_LABELS, PACKAGE_ACTION_LABELS, PACKAGE_FLAGS, PACKAGE_STATUS, handoverFailureLabel, packageButtons } from './shared';

type Pending =
  | { kind: 'confirm'; title: string; message: string; label: string; destructive?: boolean; command: PackageCommand }
  | { kind: 'reason'; title: string; label: string; build: (reason: string) => PackageCommand }
  | { kind: 'code'; title: string; label: string; field: 'code' | 'claimCode' };

/** Thao tác chuyển thẳng, không hỏi lại */
const DIRECT: Partial<Record<PackageAction, PackageCommand>> = {
  mark_ready: { kind: 'ready' },
  self_deliver: { kind: 'self-deliver' },
  deliver: { kind: 'delivery', action: 'deliver' },
  redeliver: { kind: 'delivery', action: 'redeliver' },
  redeliver_self: { kind: 'delivery', action: 'redeliver' },
  found: { kind: 'found' },
};

/** Chi tiết kiện (sơ đồ D2): nút theo bảng chuyển, lịch sử trạng thái */
export function PackageDetailPage() {
  const { packageId = '' } = useParams();
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const actor = useTransitionActor();
  const query = usePackage(packageId);
  const command = usePackageCommand();
  const handOver = useHandOver();
  const printDocs = usePrintPackageDocuments();
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const back = () => navigate(ROUTES.company.packages(companyId));

  useEffect(() => {
    setCode('');
    setError(null);
  }, [pending]);

  if (query.isLoading) return <PageLoading />;
  if (query.isError || !query.data) {
    const notFound = getProblem(query.error)?.status === 404;
    return <PageError message={notFound ? 'Không tìm thấy kiện' : problemMessage(query.error)} onBack={back} />;
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
      const fieldError = problem?.errors ? Object.values(problem.errors)[0] : undefined;
      if (pending) setError(fieldError ?? problemMessage(e));
      else toast.error(problemMessage(e));
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
    if (a === 'pack') return navigate(ROUTES.company.packScan(companyId, p.id));
    if (a === 'hand_over') return void doHandOver();
    const direct = DIRECT[a];
    if (direct) return void run(direct, `${p.code}: ${label}`);
    switch (a) {
      case 'undo_handover':
        return setPending({ kind: 'reason', title: 'Đảo bàn giao', label: 'Lý do', build: (reason) => ({ kind: 'undo-handover', reason }) });
      case 'fail':
        return setPending({
          kind: 'reason',
          title: 'Giao thất bại',
          label: 'Lý do giao không thành công',
          build: (reason) => ({ kind: 'delivery', action: 'fail', reason }),
        });
      case 'return':
        return setPending({
          kind: 'confirm',
          title: 'Hoàn về',
          message: `Kiện ${p.code} chuyển sang Đang hoàn. Khi hàng về, quét mã kiện để nhận.`,
          label: 'Hoàn về',
          command: { kind: 'delivery', action: 'return' },
        });
      case 'open':
      case 'open_cancel':
        return setPending({
          kind: 'confirm',
          title: label,
          message:
            a === 'open_cancel'
              ? `Mở kiện ${p.code}, trả hàng về kệ. Kiện huỷ, hàng giữ được nhả.`
              : `Mở kiện ${p.code} để sửa. Kiện về Đã giữ hàng, cần đóng gói lại.${
                  p.platformPackageCode ? ' Sàn huỷ mã kiện cũ (repack), đóng gói lại sẽ lấy mã và vận đơn mới.' : ''
                }`,
          label,
          destructive: a === 'open_cancel',
          command: { kind: 'open' },
        });
      case 'receive_return':
        return setPending({ kind: 'code', title: 'Quét nhận hàng hoàn', label: 'Mã kiện hoặc mã vận đơn', field: 'code' });
      case 'lose':
        return setPending({
          kind: 'confirm',
          title: 'Xác nhận thất lạc',
          message: `${p.lostReport?.by.name ?? 'Người khác'} đã báo thất lạc kiện ${p.code} (khiếu nại ${p.lostReport?.claimCode ?? '—'}). Xác nhận kiện thất lạc?`,
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
    if (!v) return setError(pending.field === 'code' ? 'Quét hoặc nhập mã' : 'Nhập mã khiếu nại');
    const cmd: PackageCommand = pending.field === 'code' ? { kind: 'receive-return', code: v } : { kind: 'report-lost', claimCode: v };
    void run(cmd, pending.field === 'code' ? `Đã nhận hàng hoàn ${p.code}` : `Đã báo thất lạc ${p.code}, chờ người khác xác nhận`);
  };

  const print = async () => {
    try {
      await printDocs.mutateAsync({ ids: [p.id] });
    } catch (e) {
      toast.error(problemMessage(e));
    }
  };

  const loading = command.isPending || handOver.isPending;
  // Vận đơn của sàn có khi kiện đã có mã kiện sàn (§19.3)
  const printable = Boolean(p.platformPackageCode) && (p.status === 'packed' || p.status === 'awaiting_pickup');
  const hasActions = buttons.actions.length > 0 || buttons.reportLost || printable;

  return (
    <div className="grid gap-4">
      <PageHeader
        title={`Kiện ${p.code}`}
        subtitle={`Đơn ${p.order.code}`}
        action={
          <Button variant="outline" onClick={back}>
            <ArrowLeft />
            Về hàng đợi
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2" data-testid="package-status">
        <StatusBadge status={p.status} statuses={PACKAGE_STATUS} />
        <FlagChips flags={p.flags} meta={PACKAGE_FLAGS} />
        {p.selfDelivery && <Badge variant="outline">Tự giao</Badge>}
      </div>

      {p.flagNote && <AlertMessage severity="warning">{p.flagNote}</AlertMessage>}
      {p.flags.includes('needs_open') && p.openPurpose && (
        <AlertMessage severity="warning">Chờ mở kiện: {OPEN_PURPOSE_LABELS[p.openPurpose]}</AlertMessage>
      )}
      {p.lostReport && p.status !== 'lost' && (
        <AlertMessage severity="warning">
          {p.lostReport.by.name} báo thất lạc lúc {formatDateTime(p.lostReport.at)}, mã khiếu nại {p.lostReport.claimCode}. Cần người khác xác nhận.
        </AlertMessage>
      )}

      {(hasActions || buttons.note) && (
        <Card className="py-4">
          <CardContent className="flex flex-wrap items-center gap-2" data-testid="package-actions">
            {buttons.actions.map((a) => (
              <Button
                key={a}
                variant={a === 'open_cancel' || a === 'lose' || a === 'fail' ? 'destructive' : a === 'pack' || a === 'hand_over' ? 'default' : 'outline'}
                disabled={loading}
                onClick={() => onAction(a)}
              >
                {a === 'pack' && <PackageCheck />}
                {PACKAGE_ACTION_LABELS[a]}
              </Button>
            ))}
            {buttons.reportLost && (
              <Button
                variant="outline"
                disabled={loading}
                onClick={() => setPending({ kind: 'code', title: 'Báo thất lạc', label: 'Mã khiếu nại với đơn vị vận chuyển', field: 'claimCode' })}
              >
                Báo thất lạc
              </Button>
            )}
            {printable && (
              <Button variant="outline" disabled={printDocs.isPending} onClick={print}>
                <Printer />
                {printDocs.isPending ? 'Đang lấy vận đơn...' : 'In vận đơn'}
              </Button>
            )}
            {buttons.note && <span className="text-sm text-muted-foreground">{buttons.note}</span>}
          </CardContent>
        </Card>
      )}

      <Card className="py-4">
        <CardHeader>
          <CardTitle className="text-base">Thông tin</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground">Đơn</p>
            <Link className="text-primary underline-offset-4 hover:underline" to={ROUTES.company.order(companyId, p.order.id)}>
              {p.order.code}
            </Link>
          </div>
          <div>
            <p className="text-muted-foreground">Nguồn</p>
            <p>{sourceLabel(p)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Khách</p>
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
                <p data-testid="package-carrier">{p.carrier?.name ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Mã kiện sàn</p>
                <p>{p.platformPackageCode ?? '—'}</p>
              </div>
            </>
          )}
          <div>
            <p className="text-muted-foreground">Hạn bàn giao</p>
            <p>{p.shipBy ? formatDateTime(p.shipBy) : '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Bàn giao lúc</p>
            <p>{p.handedOverAt ? formatDateTime(p.handedOverAt) : '—'}</p>
          </div>
          {p.deliveredAt && (
            <div>
              <p className="text-muted-foreground">Giao lúc</p>
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
          <CardTitle className="text-base">Hàng trong kiện</CardTitle>
        </CardHeader>
        <CardContent>
          <Table data-testid="package-lines">
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">SKU</TableHead>
                <TableHead>Sản phẩm</TableHead>
                <TableHead>Thuộc tính</TableHead>
                <TableHead className="w-24 text-right">Số lượng</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.lines.map((l) => (
                <TableRow key={l.variantId} data-row-id={l.sku}>
                  <TableCell className="font-medium">{l.sku}</TableCell>
                  <TableCell className="whitespace-normal">{l.productName}</TableCell>
                  <TableCell>{l.attributesLabel || '—'}</TableCell>
                  <TableCell className="text-right">{l.quantity}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="py-4">
        <CardHeader>
          <CardTitle className="text-base">Lịch sử</CardTitle>
        </CardHeader>
        <CardContent>
          <StatusTimeline history={p.statusHistory} statuses={PACKAGE_STATUS} />
        </CardContent>
      </Card>

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
    </div>
  );
}
