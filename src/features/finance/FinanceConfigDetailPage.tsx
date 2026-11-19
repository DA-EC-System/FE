import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSpinner } from '@/components/common/PageSpinner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { StatusBadge } from '@/components/common/StatusBadge';
import { StatusTimeline } from '@/components/common/StatusTimeline';
import { SelfApprovedTag } from '@/components/common/SelfApprovedTag';
import { DataTable } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useFinanceConfig, useFinanceList, useFinanceWrite } from '@/api/financeLifecycle.api';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan, useTransitionActor } from '@/hooks/usePermission';
import { PERMISSIONS as P } from '@/utils/permissions';
import { ROUTES } from '@/router/routes';
import { formatCurrency, formatDate } from '@/utils/format';
import { feeConfigMachine } from '@/lib/machines/feeConfig';
import type { PageResult } from '@/api/types';
import type { ConfigAction, FinanceConfig, FinanceConfigSummary } from '@/types/finance';
import { HelpTip } from '@/components/common/HelpTip';
import { CONFIG_KINDS, CONFIG_STATES, PAYLOAD_FIELDS, PAYLOAD_HINTS, configRecord, formatPayloadValue } from './lifecycleShared';
import { LifecycleActionDialog } from './LifecycleActionDialog';
import { FinanceConfigForm } from './FinanceConfigForm';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';

export function FinanceConfigDetailPage() {
  const { id = '' } = useParams(); const query = useFinanceConfig(id); const can = useCan(); const actor = useTransitionActor();
  const navigate = useNavigate(); const { companyContext } = useAuth(); const companyId = companyContext?.companyId ?? '';
  const [editing, setEditing] = useState<'edit' | 'correction' | null>(null); const [action, setAction] = useState<ConfigAction | null>(null);
  useBreadcrumb(query.data ? CONFIG_KINDS[query.data.kind] : undefined);
  const dryRun = useFinanceWrite<FinanceConfig, { version: number }>('post', `/finance/configs/${id}/dry-run`);
  // So với bản đang áp dụng cùng ô (Test_UI cột "Khác bản đang hiệu lực"), chỉ cho bản chưa áp dụng
  const pending = ['draft', 'pending_approval', 'scheduled'].includes(query.data?.status ?? '');
  const live = useFinanceList<PageResult<FinanceConfigSummary>>('/finance/configs',
    { kind: query.data?.kind, shopId: query.data?.shopId ?? undefined, status: 'active', page: 1, pageSize: 5 }, pending);
  const current = pending ? live.data?.items.find((c) => c.id !== id) : undefined;
  if (query.isLoading) return <PageSpinner />;
  if (!query.data) return <AlertMessage severity="error">{problemMessage(query.error)} <Button onClick={() => void query.refetch()}>Thử lại</Button></AlertMessage>;
  const config = query.data; const actions = feeConfigMachine.available(config.status, actor, configRecord(config));
  const selected = actions.find((a) => a.action === action);
  const simulate = async () => { try { await dryRun.mutateAsync({ version: config.version }); toast.success('Đã tính thử, chưa ghi sổ'); } catch (e) { toast.error(problemMessage(e)); } };
  return <div><Link to={ROUTES.company.financeConfigs(companyId)}>← Cấu hình phí sàn và thuế</Link>
    <PageHeader title={CONFIG_KINDS[config.kind]} subtitle={`Hiệu lực ${formatDate(config.effectiveFrom)} → ${config.effectiveTo ? formatDate(config.effectiveTo) : 'Đến khi có bản thay thế'}`}
      action={<div className="flex flex-wrap gap-2">{can(P.financeConfigManage) && config.status === 'draft' && <><Button variant="outline" onClick={() => setEditing('edit')}>Sửa nháp</Button><Button disabled={dryRun.isPending} variant="outline" onClick={() => void simulate()}>Tính thử</Button></>}
        {can(P.financeConfigManage) && ['active', 'superseded'].includes(config.status) && <Button variant="outline" onClick={() => setEditing('correction')}>Lập bản điều chỉnh</Button>}
        {actions.map((a) => <Button key={a.action} onClick={() => setAction(a.action)}>{a.label}</Button>)}
      </div>} />
    <StatusBadge status={config.status} statuses={CONFIG_STATES} />{config.selfApproved && <span className="ms-2"><SelfApprovedTag /></span>}
    {config.statusReason && <AlertMessage severity="info">{config.statusReason}</AlertMessage>}
    {config.isCorrection && <AlertMessage severity="warning">Bản điều chỉnh, hồi tố từ {formatDate(config.retroactiveFrom)}. <Link to={ROUTES.company.financeConfig(companyId, config.supersedesId!)}>Xem bản bị điều chỉnh</Link></AlertMessage>}
    <Card className="my-4 gap-0 py-0"><table className="w-full text-sm" data-testid="config-payload"><thead className="border-b text-left text-xs text-muted-foreground"><tr>
      <th className="px-4 py-2 font-medium">Khoản mục</th><th className="px-4 py-2 font-medium">Phiên bản này</th>
      {current && <th className="px-4 py-2 font-medium"><Link className="hover:underline" to={ROUTES.company.financeConfig(companyId, current.id)}>Phiên bản đang áp dụng</Link> <span className="font-normal">từ {formatDate(current.effectiveFrom)}</span></th>}
    </tr></thead><tbody>{Object.entries(PAYLOAD_FIELDS[config.kind]).map(([key, label]) => {
      const mine = formatPayloadValue(key, config.payload[key]); const theirs = current ? formatPayloadValue(key, current.payload[key]) : null; const changed = theirs !== null && theirs !== mine;
      return <tr key={key} className="border-b last:border-0" data-changed={changed || undefined}>
        <td className="px-4 py-2 text-muted-foreground">{label}{PAYLOAD_HINTS[key] && <HelpTip className="ms-1" topic={label} content={PAYLOAD_HINTS[key]} />}</td>
        <td className={changed ? 'px-4 py-2 font-semibold text-warning-text' : 'px-4 py-2 font-medium'}>{mine}</td>
        {current && <td className="px-4 py-2 text-muted-foreground">{theirs}</td>}
      </tr>;
    })}</tbody></table>
      <CardContent className="grid gap-1 border-t py-3 text-sm sm:grid-cols-2"><p>Người lập: {config.createdBy?.name ?? '—'}</p><p>Người duyệt: {config.approvedBy?.name ?? '—'}</p></CardContent></Card>
    {config.dryRun ? <Card className="mb-4 p-4"><h2 className="font-semibold">Kết quả tính thử</h2><p>Lợi nhuận sau phí sàn 30 ngày gần nhất: {formatCurrency(config.dryRun.profit30.now)} → {formatCurrency(config.dryRun.profit30.next)}</p>
      <DataTable data={config.dryRun.rows} getRowId={(r) => r.shopId} columns={[
        { header: 'Gian hàng', accessorKey: 'shopName' }, { header: 'Tổng phí sàn (%)', accessorKey: 'feePct' },
        { header: 'Thuế tính vào giá (%)', accessorKey: 'taxPct', meta: { help: 'Hộ, cá nhân kinh doanh: tỷ lệ GTGT + TNCN sàn khấu trừ. Doanh nghiệp: phần thuế GTGT đầu ra trong giá bán, v/(1+v).' } },
        { header: 'Listing đổi giá', cell: ({ row }) => row.original.listingsRepriced ?? 'Chưa có dữ liệu' }, { header: 'Dưới giá tối thiểu', cell: ({ row }) => row.original.belowFloor ?? 'Chưa có dữ liệu' },
      ]} /></Card> : <p className="my-4 text-muted-foreground">Chưa tính thử. Cần tính thử trước khi gửi duyệt.</p>}
    <StatusTimeline history={config.statusHistory} statuses={CONFIG_STATES} />
    {editing && <FinanceConfigForm existing={config} correction={editing === 'correction'} onClose={() => setEditing(null)} onSaved={(c) => { setEditing(null); navigate(ROUTES.company.financeConfig(companyId, c.id)); }} />}
    {selected && <LifecycleActionDialog path={`/finance/configs/${id}/${selected.action.replace(/_/g, '-')}`} version={config.version} title={selected.label} field={selected.needsReason ? 'reason' : undefined} onClose={() => setAction(null)} />}
  </div>;
}
