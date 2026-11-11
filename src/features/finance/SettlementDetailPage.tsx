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
import type { SettlementLedgerLine } from '@/types/settlement';
import { PAYMENT_FLAGS, PAYMENT_STATES } from './lifecycleShared';
import { LifecycleActionDialog } from './LifecycleActionDialog';

/** Tên khoản của sổ quyết toán (bộ kind khác LEDGER_KIND_LABELS của sổ cũ FE#76) */
const SETTLEMENT_KINDS: Record<SettlementLedgerLine['kind'], string> = {
  revenue: 'Doanh thu', platform_subsidy: 'Sàn trợ giá', shipping_income: 'Phí ship thu khách', shipping_cost: 'Phí vận chuyển',
  fee_fixed: 'Phí cố định', fee_transaction: 'Phí giao dịch', fee_service: 'Phí dịch vụ', fee_optional: 'Phí tuỳ chọn',
  withholding_tax: 'Thuế sàn khấu trừ', customer_refund: 'Hoàn tiền khách', return_fee: 'Phí hoàn hàng',
  lost_compensation: 'Bồi thường mất hàng', penalty: 'Phạt', cogs: 'Giá vốn', cogs_reversal: 'Hoàn giá vốn', ads: 'Quảng cáo',
  opex: 'Chi phí vận hành', supplier_payment: 'Trả NCC', supplier_refund: 'NCC hoàn tiền', cod_collected: 'Thu COD',
  withdrawal: 'Rút tiền', adjustment: 'Điều chỉnh',
};

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
  const total = live.reduce((s, l) => s + l.amount, 0);

  return (
    <div>
      <PageHeader
        title={`Tiền đơn ${payment.orderCode ?? payment.orderId}`}
        subtitle="Số sàn quyết toán so với số Commerio ước tính cho đơn này."
        help="Dòng ước tính được thay bằng dòng thực tế khi kéo quyết toán; dòng đã bị thay vẫn giữ để đối chiếu nhưng không cộng vào tổng. Lệch quá ngưỡng thì chốt kèm lý do; vượt hạn mức tự chốt thì CEO duyệt trước."
        action={
          <>
            <Button variant="outline" onClick={() => navigate(ROUTES.company.settlements(companyId))}>
              <ArrowLeft />
              Về danh sách
            </Button>
            {canCeo && <Button variant="outline" onClick={() => setAction('ceo-approve')}>CEO duyệt lệch</Button>}
            {!block && <Button onClick={() => setAction('resolve')}>Chốt lệch</Button>}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={payment.status} statuses={PAYMENT_STATES} />
        <FlagChips flags={payment.flags} meta={PAYMENT_FLAGS} />
      </div>
      {block && payment.status === 'mismatch' && block !== 'forbidden' && (
        <AlertMessage severity="warning">
          {block === 'second_person_required' ? 'Người chốt phải khác người soạn cấu hình phí đang áp dụng.' : 'Lệch vượt hạn mức, cần CEO duyệt trước khi chốt.'}
        </AlertMessage>
      )}
      <KpiStrip label="Số tiền của đơn" className="mb-4">
        <Kpi label="Sàn quyết toán" help="Số sàn thực trả cho đơn, có sau khi kéo quyết toán." value={payment.settledTotal === null ? '—' : <Money value={payment.settledTotal} />} />
        <Kpi label="Commerio ước tính" help="Tính theo cấu hình phí và thuế lúc giao hàng." value={<Money value={payment.estimatedTotal} />} />
        <Kpi
          label="Chênh lệch"
          help="Quyết toán trừ ước tính. Âm là sàn trả ít hơn."
          value={payment.diff === null ? '—' : <Money value={payment.diff} />}
          detail={`Ngưỡng ${formatCurrency(payment.threshold.abs)} / ${payment.threshold.pct}%`}
        />
        <Kpi label="Hạn mức tự chốt" help="Lệch vượt số này thì CEO duyệt trước khi chốt." value={<Money value={payment.threshold.resolveLimit} />} />
      </KpiStrip>
      <DetailGrid history={<StatusTimeline history={payment.statusHistory} statuses={PAYMENT_STATES} />}>
        <Panel title="Người liên quan" bodyClassName="grid gap-4 sm:grid-cols-3">
          <Person label="Người soạn phí">{payment.feeConfigAuthor?.name ?? '—'}</Person>
          <Person label="CEO duyệt">
            {payment.ceoApproval ? `${payment.ceoApproval.by?.name ?? '—'} · ${formatDateTime(payment.ceoApproval.at)}` : payment.needsCeoApproval ? 'Chưa duyệt' : 'Không cần'}
          </Person>
          <Person label="Lý do chốt">
            {payment.resolved ? (
              <>
                {payment.resolved.reason ?? '—'}
                {payment.resolved.selfApproved && <SelfApprovedTag />}
              </>
            ) : '—'}
          </Person>
        </Panel>
        <Panel title="Dòng tiền" extra={<span className="text-[12.5px] text-muted-foreground tabular-nums">{lines.length}</span>} flush>
          <DataTable
            data={lines}
            getRowId={(l) => l.id}
            empty="Chưa có dòng tiền"
            rowClassName={(l) => cn(l.replacedBy && 'text-muted-foreground opacity-60')}
            columns={[
              { header: 'Ngày', cell: ({ row }) => formatDate(row.original.occurredOn) },
              { header: 'Khoản', cell: ({ row }) => <span className="flex flex-wrap items-center gap-1">{SETTLEMENT_KINDS[row.original.kind] ?? row.original.kind}<FlagChips flags={row.original.flags} meta={PAYMENT_FLAGS} /></span> },
              { header: 'Nguồn', cell: ({ row }) => row.original.estimated ? <Badge variant="warning">Ước tính</Badge> : <Badge variant="success">Thực tế</Badge> },
              { header: 'Số tiền', meta: { numeric: true }, cell: ({ row }) => <Money value={row.original.amount} className={row.original.replacedBy ? 'line-through' : undefined} /> },
              { header: 'Ghi chú', cell: ({ row }) => row.original.replacedBy ? 'Đã thay bằng số thực tế' : row.original.reason ?? '' },
            ]}
          />
          {live.length > 0 && (
            <div className="flex justify-end gap-6 border-t px-4 py-2.5 text-sm" data-testid="lines-total">
              <span className="me-auto text-muted-foreground">Tổng (không tính dòng đã thay)</span>
              <Money className="font-medium" value={total} />
            </div>
          )}
        </Panel>
      </DetailGrid>
      {action && <LifecycleActionDialog path={`/finance/payments/${id}/${action}`} version={payment.version} field={action === 'resolve' ? 'reason' : undefined} title={action === 'resolve' ? 'Chốt lệch' : 'CEO duyệt lệch'} onClose={() => setAction(null)} />}
    </div>
  );
}
