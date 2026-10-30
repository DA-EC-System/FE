import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSpinner } from '@/components/common/PageSpinner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { StatusBadge } from '@/components/common/StatusBadge';
import { StatusTimeline } from '@/components/common/StatusTimeline';
import { DataTable } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useOrderPayment } from '@/api/financeLifecycle.api';
import { problemMessage } from '@/api/problemMessages';
import { useTransitionActor } from '@/hooks/usePermission';
import { useAuth } from '@/hooks/useAuth';
import { PERMISSIONS as P } from '@/utils/permissions';
import { ROUTES } from '@/router/routes';
import { formatCurrency, formatDate } from '@/utils/format';
import { resolveBlock } from '@/lib/machines/settlement';
import { PAYMENT_STATES } from './lifecycleShared';
import { LifecycleActionDialog } from './LifecycleActionDialog';

export function SettlementDetailPage() {
  const { id = '' } = useParams(); const query = useOrderPayment(id); const actor = useTransitionActor();
  const { companyContext } = useAuth(); const companyId = companyContext?.companyId ?? '';
  const [action, setAction] = useState<'resolve' | 'ceo-approve' | null>(null);
  if (query.isLoading) return <PageSpinner />;
  if (!query.data) return <AlertMessage severity="error">{problemMessage(query.error)} <Button onClick={() => void query.refetch()}>Thử lại</Button></AlertMessage>;
  const payment = query.data; const block = resolveBlock(payment, actor);
  return <div><Link to={ROUTES.company.settlements(companyId)}>← Đối soát sàn</Link>
    <PageHeader title={`Tiền đơn ${payment.orderCode ?? payment.orderId}`} action={<div className="flex gap-2">
      {!block && <Button onClick={() => setAction('resolve')}>Chốt lệch</Button>}
      {payment.status === 'mismatch' && payment.needsCeoApproval && !payment.ceoApproval && actor.permissions.includes(P.settlementApprove) && <Button variant="outline" onClick={() => setAction('ceo-approve')}>CEO duyệt lệch</Button>}
    </div>} />
    <StatusBadge status={payment.status} statuses={PAYMENT_STATES} />
    {block && payment.status === 'mismatch' && block !== 'forbidden' && <AlertMessage severity="warning">{block === 'second_person_required' ? 'Người chốt phải khác người soạn cấu hình phí đang áp dụng.' : 'Lệch vượt hạn mức, cần CEO duyệt trước khi chốt.'}</AlertMessage>}
    <Card className="my-4"><CardContent className="grid gap-3 pt-6 sm:grid-cols-3"><div>Ước tính: {formatCurrency(payment.estimatedTotal)}</div><div>Quyết toán: {payment.settledTotal === null ? '—' : formatCurrency(payment.settledTotal)}</div><div>Lệch: {payment.diff === null ? '—' : formatCurrency(payment.diff)}</div>
      <div>Ngưỡng: {formatCurrency(payment.threshold.abs)} / {payment.threshold.pct}%</div><div>Hạn mức tự chốt: {formatCurrency(payment.threshold.resolveLimit)}</div><div>Người soạn phí: {payment.feeConfigAuthor?.name ?? '—'}</div>
      {payment.ceoApproval && <p>Đã duyệt: {payment.ceoApproval.by?.name ?? '—'}</p>}{payment.resolved && <p>Lý do chốt: {payment.resolved.reason}</p>}
    </CardContent></Card>
    <DataTable data={payment.lines} getRowId={(l) => l.id} empty="Chưa có dòng tiền" columns={[
      { header: 'Ngày', cell: ({ row }) => formatDate(row.original.occurredOn) }, { header: 'Khoản', accessorKey: 'kind' },
      { header: 'Số tiền', cell: ({ row }) => formatCurrency(row.original.amount) }, { header: 'Nguồn', cell: ({ row }) => row.original.estimated ? 'Ước tính' : 'Thực tế' },
      { header: 'Ghi chú', accessorKey: 'reason' },
    ]} />
    <div className="mt-6"><StatusTimeline history={payment.statusHistory} statuses={PAYMENT_STATES} /></div>
    {action && <LifecycleActionDialog path={`/finance/payments/${id}/${action}`} version={payment.version} field={action === 'resolve' ? 'reason' : undefined} title={action === 'resolve' ? 'Chốt lệch' : 'CEO duyệt lệch'} onClose={() => setAction(null)} />}
  </div>;
}
