import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, FilterSelect } from '@/components/common/FilterBar';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { useOrderPayments, useSettlementRuns, useStartSettlement, useBankMatching } from '@/api/financeLifecycle.api';
import { useShops } from '@/api/shops.api';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { PERMISSIONS as P } from '@/utils/permissions';
import { ROUTES } from '@/router/routes';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format';
import type { SettlementLedgerLine } from '@/types/settlement';
import { PAYMENT_STATES } from './lifecycleShared';
import { LifecycleActionDialog } from './LifecycleActionDialog';

export function SettlementsPage() {
  const { companyContext } = useAuth(); const companyId = companyContext?.companyId ?? '';
  const can = useCan(); const navigate = useNavigate(); const f = useUrlFilters([25, 50, 100]);
  const tab = f.params.get('tab') ?? 'payments'; const shopId = f.params.get('shopId') ?? '';
  const status = f.params.get('status') ?? ''; const matched = f.params.get('matched') ?? '';
  const params = { page: f.page, pageSize: f.pageSize, shopId: shopId || undefined };
  const payments = useOrderPayments({ ...params, status: status || undefined });
  const runs = useSettlementRuns(params, tab === 'runs');
  const bank = useBankMatching({ page: f.page, pageSize: f.pageSize, matched: matched || undefined }, tab === 'bank');
  const shops = useShops({ enabled: can(P.shopView) }); const start = useStartSettlement();
  const [match, setMatch] = useState<SettlementLedgerLine | null>(null);
  const query = tab === 'runs' ? runs : tab === 'bank' ? bank : payments;
  const pagination = { page: f.page, pageSize: f.pageSize, total: query.data?.total ?? 0, pageSizes: [25, 50, 100], onChange: f.onPageChange };
  const run = async () => { if (!shopId) { toast.error('Chọn gian hàng để kéo quyết toán'); return; }
    try { await start.mutateAsync({ shopId }); toast.success('Đã nhận yêu cầu kéo quyết toán'); } catch (e) { toast.error(problemMessage(e)); } };
  return <div><PageHeader title="Đối soát sàn" subtitle="Trạng thái tiền độc lập với trạng thái đơn. Quyết toán theo từng khoản, khớp số rút về ngân hàng." />
    <Tabs value={tab} onValueChange={(value) => f.update({ tab: value, page: undefined, status: undefined })}><TabsList>
      <TabsTrigger value="payments">Tiền theo đơn</TabsTrigger><TabsTrigger value="runs">Lần đối soát</TabsTrigger><TabsTrigger value="bank">Khớp sao kê</TabsTrigger>
    </TabsList></Tabs>
    {query.isError && <AlertMessage severity="error">{problemMessage(query.error)} <Button variant="outline" onClick={() => void query.refetch()}>Thử lại</Button></AlertMessage>}
    <Card className="mt-4 gap-0 py-0"><FilterBar>
      {tab !== 'bank' && <FilterSelect label="Gian hàng" value={shopId} onChange={f.setFilter('shopId')} options={(shops.data?.items ?? []).map((s) => ({ value: s.id, label: s.shopName }))} />}
      {tab === 'payments' && <FilterSelect label="Trạng thái tiền" value={status} onChange={f.setFilter('status')} options={Object.entries(PAYMENT_STATES).map(([value, meta]) => ({ value, label: `${meta.label} (${payments.data?.counts[value as keyof typeof PAYMENT_STATES] ?? 0})` }))} />}
      {tab === 'bank' && <FilterSelect label="Khớp sao kê" value={matched} onChange={f.setFilter('matched')} options={[{ value: 'false', label: 'Chưa khớp' }, { value: 'true', label: 'Đã khớp' }]} />}
      {tab === 'runs' && can(P.settlementResolve) && <Button disabled={start.isPending || !shopId} onClick={() => void run()}>Kéo quyết toán</Button>}
    </FilterBar>
    {tab === 'payments' && <DataTable data={payments.data?.items ?? []} loading={payments.isLoading} getRowId={(p) => p.orderId} pagination={pagination} empty="Chưa có trạng thái tiền" onRowClick={(p) => navigate(ROUTES.company.settlement(companyId, p.orderId))} columns={[
      { header: 'Đơn', accessorKey: 'orderCode', cell: ({ row }) => row.original.orderCode ?? row.original.orderId },
      { header: 'Trạng thái tiền', cell: ({ row }) => <StatusBadge status={row.original.status} statuses={PAYMENT_STATES} /> },
      { header: 'Ước tính', cell: ({ row }) => formatCurrency(row.original.estimatedTotal) },
      { header: 'Quyết toán', cell: ({ row }) => row.original.settledTotal === null ? '—' : formatCurrency(row.original.settledTotal) },
      { header: 'Chênh lệch', cell: ({ row }) => row.original.diff === null ? '—' : formatCurrency(row.original.diff) },
      { header: 'Duyệt lệch', cell: ({ row }) => row.original.ceoApproval ? 'CEO đã duyệt' : row.original.needsCeoApproval ? 'Cần CEO duyệt' : 'Trong hạn mức' },
    ]} />}
    {tab === 'runs' && <DataTable data={runs.data?.items ?? []} loading={runs.isLoading} getRowId={(r) => r.id} pagination={pagination} empty="Chưa chạy đối soát" columns={[
      { header: 'Thời điểm', cell: ({ row }) => formatDateTime(row.original.createdAt) },
      { header: 'Gian hàng', cell: ({ row }) => shops.data?.items.find((s) => s.id === row.original.shopId)?.shopName ?? row.original.shopId },
      { header: 'Khoảng kéo', cell: ({ row }) => `${formatDateTime(row.original.from)} – ${formatDateTime(row.original.to)}` },
      { header: 'Trạng thái', cell: ({ row }) => row.original.status === 'running' ? 'Đang kéo' : row.original.status === 'done' ? 'Hoàn tất' : `Lỗi: ${row.original.error ?? 'Không rõ'}` },
      { header: 'Dòng / trùng', cell: ({ row }) => `${row.original.lineCount} / ${row.original.duplicates}` },
      { header: 'Lệch ví', cell: ({ row }) => row.original.walletDiff === null ? 'Sàn chưa trả số dư' : <span className={row.original.walletDiff ? 'text-destructive' : ''}>{formatCurrency(row.original.walletDiff)}</span> },
    ]} />}
    {tab === 'bank' && <DataTable data={bank.data?.items ?? []} loading={bank.isLoading} getRowId={(r) => r.id} pagination={pagination} empty="Chưa có khoản cần khớp" columns={[
      { header: 'Ngày', cell: ({ row }) => formatDate(row.original.occurredOn) },
      { header: 'Loại', cell: ({ row }) => ({ withdrawal: 'Rút tiền', supplier_refund: 'NCC hoàn tiền', lost_compensation: 'Bồi thường mất hàng' }[row.original.kind as 'withdrawal']) ?? row.original.kind },
      { header: 'Số tiền', cell: ({ row }) => formatCurrency(row.original.amount) },
      { header: 'Mã giao dịch sàn', accessorKey: 'txnId' },
      { header: 'Sao kê', cell: ({ row }) => row.original.bankMatch?.bankRef ?? (can(P.settlementResolve) ? <Button size="sm" onClick={() => setMatch(row.original)}>Khớp sao kê</Button> : 'Chưa khớp') },
    ]} />}</Card>
    {match && <LifecycleActionDialog path={`/finance/ledger/${match.id}/bank-match`} title="Khớp sao kê" field="bankRef" onClose={() => setMatch(null)} />}
  </div>;
}
