import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSpinner } from '@/components/common/PageSpinner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { StatusBadge } from '@/components/common/StatusBadge';
import { StatusTimeline } from '@/components/common/StatusTimeline';
import { SelfApprovedTag } from '@/components/common/SelfApprovedTag';
import { DataTable } from '@/components/common/DataTable';
import { DetailGrid } from '@/components/common/DetailGrid';
import { FlagChips } from '@/components/common/FlagChips';
import { Kpi, KpiStrip } from '@/components/common/KpiStrip';
import { Money } from '@/components/common/Money';
import { Panel } from '@/components/common/Panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useOrderPayment } from '@/api/financeLifecycle.api';
import { problemMessage } from '@/api/problemMessages';
import { useTransitionActor } from '@/hooks/usePermission';
import { useAuth } from '@/hooks/useAuth';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { PERMISSIONS as P } from '@/utils/permissions';
import { ROUTES } from '@/router/routes';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format';
import { resolveBlock } from '@/lib/machines/settlement';
import { cn } from '@/lib/utils';
import { LEDGER_KIND_LABELS, isCostKind } from '@/utils/ledger';
import { PAYMENT_FLAGS, PAYMENT_STATES } from './lifecycleShared';
import { LifecycleActionDialog } from './LifecycleActionDialog';

function Person({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex flex-wrap items-center gap-2 text-sm">{children}</span>
    </div>
  );
}

export function SettlementDetailPage() {
  const { id = '' } = useParams(); const query = useOrderPayment(id); const actor = useTransitionActor();
  const { companyContext } = useAuth(); const companyId = companyContext?.companyId ?? ''; const navigate = useNavigate();
  const [action, setAction] = useState<'resolve' | 'ceo-approve' | null>(null);
  useBreadcrumb(query.data ? (query.data.orderCode ?? query.data.orderId) : undefined);
  if (query.isLoading) return <PageSpinner />;
  if (!query.data) return <AlertMessage severity="error">{problemMessage(query.error)} <Button onClick={() => void query.refetch()}>Thử lại</Button></AlertMessage>;
  const payment = query.data; const block = resolveBlock(payment, actor);
  const canCeo = payment.status === 'mismatch' && payment.needsCeoApproval && !payment.ceoApproval && actor.permissions.includes(P.settlementApprove);
  const lines = payment.lines;
  const live = lines.filter((l) => !l.replacedBy);
  // §21.1: cogs, cogs_reversal không phải tiền mặt, không cộng vào thực nhận
  const total = live.filter((l) => !isCostKind(l.kind)).reduce((s, l) => s + l.amount, 0);

  return (
    <div>
      <PageHeader
        title={`Đối soát đơn ${payment.orderCode ?? payment.orderId}`}
        subtitle="So số tiền sàn thanh toán với số phải thu của đơn này."
        help="Khi lấy được sao kê sàn, dòng ước tính được thay bằng dòng thực tế; dòng đã thay vẫn hiện (gạch ngang) để đối chiếu, không cộng vào tổng. Chênh lệch vượt ngưỡng cho phép thì phải xử lý kèm lý do; vượt hạn mức tự xử lý thì cần CEO duyệt trước."
        action={
          <>
            <Button variant="outline" onClick={() => navigate(ROUTES.company.settlements(companyId))}>
              <ArrowLeft />
              Về danh sách
            </Button>
            {canCeo && <Button variant="outline" onClick={() => setAction('ceo-approve')}>CEO duyệt chênh lệch</Button>}
            {!block && <Button onClick={() => setAction('resolve')}>Xử lý chênh lệch</Button>}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={payment.status} statuses={PAYMENT_STATES} />
        <FlagChips flags={payment.flags} meta={PAYMENT_FLAGS} />
      </div>
      {block && payment.status === 'mismatch' && block !== 'forbidden' && (
        <AlertMessage severity="warning">
          {block === 'second_person_required' ? 'Người xử lý chênh lệch phải khác người lập cấu hình phí đang áp dụng.' : 'Chênh lệch vượt hạn mức tự xử lý, cần CEO duyệt trước.'}
        </AlertMessage>
      )}
      <KpiStrip label="Số tiền của đơn" className="mb-4">
        <Kpi label="Sàn thanh toán" help="Số sàn thực trả cho đơn, có sau khi lấy sao kê sàn." value={payment.settledTotal === null ? '—' : <Money value={payment.settledTotal} />} />
        <Kpi label="Phải thu" help="Tính theo cấu hình phí và thuế lúc giao hàng." value={<Money value={payment.estimatedTotal} />} />
        <Kpi
          label="Chênh lệch"
          help="Sàn thanh toán trừ phải thu. Âm là sàn trả thiếu."
          value={payment.diff === null ? '—' : <Money value={payment.diff} />}
          detail={`Ngưỡng chênh lệch: ${formatCurrency(payment.threshold.abs)} hoặc ${payment.threshold.pct}%`}
        />
        <Kpi label="Hạn mức tự xử lý" help="Chênh lệch vượt số này thì cần CEO duyệt trước khi xử lý." value={<Money value={payment.threshold.resolveLimit} />} />
      </KpiStrip>
      <DetailGrid history={<StatusTimeline history={payment.statusHistory} statuses={PAYMENT_STATES} />}>
        <Panel title="Người liên quan" bodyClassName="grid gap-4 sm:grid-cols-3">
          <Person label="Người lập cấu hình phí">{payment.feeConfigAuthor?.name ?? '—'}</Person>
          <Person label="CEO duyệt">
            {payment.ceoApproval ? `${payment.ceoApproval.by?.name ?? '—'} · ${formatDateTime(payment.ceoApproval.at)}` : payment.needsCeoApproval ? 'Chờ CEO duyệt' : 'Không cần duyệt'}
          </Person>
          <Person label="Lý do xử lý">
            {payment.resolved ? (
              <>
                {payment.resolved.reason ?? '—'}
                {payment.resolved.selfApproved && <SelfApprovedTag />}
              </>
            ) : '—'}
          </Person>
        </Panel>
        <Panel title="Giao dịch của đơn" extra={<span className="text-[12.5px] text-muted-foreground tabular-nums">{lines.length}</span>} flush>
          <DataTable
            data={lines}
            getRowId={(l) => l.id}
            empty="Chưa có giao dịch nào"
            rowClassName={(l) => cn(l.replacedBy && 'text-muted-foreground opacity-60')}
            columns={[
              { header: 'Ngày phát sinh', cell: ({ row }) => formatDate(row.original.occurredOn) },
              { header: 'Khoản mục', cell: ({ row }) => <span className="flex flex-wrap items-center gap-1">{LEDGER_KIND_LABELS[row.original.kind] ?? row.original.kind}<FlagChips flags={row.original.flags} meta={PAYMENT_FLAGS} /></span> },
              { header: 'Trạng thái ghi nhận', cell: ({ row }) => row.original.estimated ? <Badge variant="warning">Ước tính</Badge> : <Badge variant="success">Thực tế</Badge> },
              { header: 'Số tiền', meta: { numeric: true }, cell: ({ row }) => <Money value={row.original.amount} className={row.original.replacedBy ? 'line-through' : undefined} /> },
              { header: 'Ghi chú', cell: ({ row }) => row.original.replacedBy ? 'Đã thay bằng số sàn thanh toán' : isCostKind(row.original.kind) ? 'Không cộng vào tổng (giá vốn, sàn không trả khoản này)' : row.original.reason ?? '' },
            ]}
          />
          {live.length > 0 && (
            <div className="flex justify-end gap-6 border-t px-4 py-2.5 text-sm" data-testid="lines-total">
              <span className="me-auto text-muted-foreground">Cộng (không gồm dòng đã thay và giá vốn)</span>
              <Money className="font-medium" value={total} />
            </div>
          )}
        </Panel>
      </DetailGrid>
      {action && <LifecycleActionDialog path={`/finance/payments/${id}/${action}`} version={payment.version} field={action === 'resolve' ? 'reason' : undefined} title={action === 'resolve' ? 'Xử lý chênh lệch' : 'CEO duyệt chênh lệch'} onClose={() => setAction(null)} />}
    </div>
  );
}
