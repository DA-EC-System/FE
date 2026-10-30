import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSpinner } from '@/components/common/PageSpinner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { StatusBadge } from '@/components/common/StatusBadge';
import { StatusTimeline } from '@/components/common/StatusTimeline';
import { DataTable } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useFinanceConfig, useFinanceWrite } from '@/api/financeLifecycle.api';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan, useTransitionActor } from '@/hooks/usePermission';
import { PERMISSIONS as P } from '@/utils/permissions';
import { ROUTES } from '@/router/routes';
import { formatCurrency, formatDate } from '@/utils/format';
import { feeConfigMachine } from '@/lib/machines/feeConfig';
import type { ConfigAction, FinanceConfig } from '@/types/finance';
import { CONFIG_KINDS, CONFIG_STATES, PAYLOAD_FIELDS, configRecord } from './lifecycleShared';
import { LifecycleActionDialog } from './LifecycleActionDialog';
import { FinanceConfigForm } from './FinanceConfigForm';

export function FinanceConfigDetailPage() {
  const { id = '' } = useParams(); const query = useFinanceConfig(id); const can = useCan(); const actor = useTransitionActor();
  const navigate = useNavigate(); const { companyContext } = useAuth(); const companyId = companyContext?.companyId ?? '';
  const [editing, setEditing] = useState<'edit' | 'correction' | null>(null); const [action, setAction] = useState<ConfigAction | null>(null);
  const dryRun = useFinanceWrite<FinanceConfig, { version: number }>('post', `/finance/configs/${id}/dry-run`);
  if (query.isLoading) return <PageSpinner />;
  if (!query.data) return <AlertMessage severity="error">{problemMessage(query.error)} <Button onClick={() => void query.refetch()}>Thử lại</Button></AlertMessage>;
  const config = query.data; const actions = feeConfigMachine.available(config.status, actor, configRecord(config));
  const selected = actions.find((a) => a.action === action);
  const simulate = async () => { try { await dryRun.mutateAsync({ version: config.version }); toast.success('Đã chạy thử, chưa ghi sổ'); } catch (e) { toast.error(problemMessage(e)); } };
  return <div><Link to={ROUTES.company.financeConfigs(companyId)}>← Cấu hình phí và thuế</Link>
    <PageHeader title={CONFIG_KINDS[config.kind]} subtitle={`Hiệu lực ${formatDate(config.effectiveFrom)} → ${config.effectiveTo ? formatDate(config.effectiveTo) : 'Chưa kết thúc'}`}
      action={<div className="flex flex-wrap gap-2">{can(P.configManage) && config.status === 'draft' && <><Button variant="outline" onClick={() => setEditing('edit')}>Sửa nháp</Button><Button disabled={dryRun.isPending} variant="outline" onClick={() => void simulate()}>Chạy thử</Button></>}
        {can(P.configManage) && ['active', 'expired'].includes(config.status) && <Button variant="outline" onClick={() => setEditing('correction')}>Soạn bản sửa lỗi</Button>}
        {actions.map((a) => <Button key={a.action} onClick={() => setAction(a.action)}>{a.label}</Button>)}
      </div>} />
    <StatusBadge status={config.status} statuses={CONFIG_STATES} />{config.selfApproved && <span className="ms-2 text-sm">Tự duyệt</span>}
    {config.statusReason && <AlertMessage severity="info">{config.statusReason}</AlertMessage>}
    {config.isCorrection && <AlertMessage severity="warning">Bản sửa lỗi; hồi tố từ {formatDate(config.retroactiveFrom)}. <Link to={ROUTES.company.financeConfig(companyId, config.supersedesId!)}>Xem bản được sửa</Link></AlertMessage>}
    <Card className="my-4"><CardContent className="grid gap-3 pt-6 sm:grid-cols-2">{Object.entries(PAYLOAD_FIELDS[config.kind]).map(([key, label]) => <p key={key}>{label}: <strong>{Array.isArray(config.payload[key]) ? (config.payload[key] as number[]).join(', ') : key === 'regime' ? ({ company: 'Doanh nghiệp', household: 'Hộ kinh doanh', individual: 'Cá nhân' }[String(config.payload[key]) as 'company'] ?? '—') : String(config.payload[key] ?? '—')}</strong></p>)}
      <p>Người soạn: {config.createdBy?.name ?? '—'}</p><p>Người duyệt: {config.approvedBy?.name ?? '—'}</p></CardContent></Card>
    {config.dryRun ? <Card className="mb-4 p-4"><h2 className="font-semibold">Kết quả chạy thử</h2><p>Lãi 30 ngày: {formatCurrency(config.dryRun.profit30.now)} → {formatCurrency(config.dryRun.profit30.next)}</p>
      <DataTable data={config.dryRun.rows} getRowId={(r) => r.shopId} columns={[
        { header: 'Gian hàng', accessorKey: 'shopName' }, { header: 'Phí (%)', accessorKey: 'feePct' }, { header: 'Thuế (%)', accessorKey: 'taxPct' },
        { header: 'Giá tính lại', cell: ({ row }) => row.original.listingsRepriced ?? 'Chưa có dữ liệu' }, { header: 'Dưới đáy', cell: ({ row }) => row.original.belowFloor ?? 'Chưa có dữ liệu' },
      ]} /></Card> : <p className="my-4 text-muted-foreground">Chưa chạy thử. Cần chạy thử trước khi gửi duyệt.</p>}
    <StatusTimeline history={config.statusHistory} statuses={CONFIG_STATES} />
    {editing && <FinanceConfigForm existing={config} correction={editing === 'correction'} onClose={() => setEditing(null)} onSaved={(c) => { setEditing(null); navigate(ROUTES.company.financeConfig(companyId, c.id)); }} />}
    {selected && <LifecycleActionDialog path={`/finance/configs/${id}/${selected.action.replace(/_/g, '-')}`} version={config.version} title={selected.label} field={selected.needsReason ? 'reason' : undefined} onClose={() => setAction(null)} />}
  </div>;
}
