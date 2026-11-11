import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, FilterSelect } from '@/components/common/FilterBar';
import { StatusBadge } from '@/components/common/StatusBadge';
import { FlagChips } from '@/components/common/FlagChips';
import { Kpi, KpiStrip } from '@/components/common/KpiStrip';
import { Money } from '@/components/common/Money';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { useOrderPayments, useSettlementRuns, useStartSettlement, useBankMatching } from '@/api/financeLifecycle.api';
import { useShops } from '@/api/shops.api';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useCan } from '@/hooks/usePermission';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { usePageGuide } from '@/guides/usePageGuide';
import { PERMISSIONS as P } from '@/utils/permissions';
import { ROUTES } from '@/router/routes';
import { formatDate, formatDateTime } from '@/utils/format';
import type { OrderPayment, SettlementLedgerLine } from '@/types/settlement';
import { PAYMENT_FLAGS, PAYMENT_STATES } from './lifecycleShared';
import { LifecycleActionDialog } from './LifecycleActionDialog';
import { MismatchPanel } from './MismatchPanel';

const BANK_KINDS: Record<string, string> = { withdrawal: 'Rút tiền', supplier_refund: 'NCC hoàn tiền', lost_compensation: 'Bồi thường mất hàng' };

/** Tổng của trang đang xem, cột chưa có số (null) không cộng */
const sumOf = (items: OrderPayment[], pick: (p: OrderPayment) => number | null) =>
  items.reduce((s, p) => s + (pick(p) ?? 0), 0);

export function SettlementsPage() {
  const { companyContext } = useAuth(); const companyId = companyContext?.companyId ?? '';
  const can = useCan(); const navigate = useNavigate(); const f = useUrlFilters([25, 50, 100]);
  const { startTour } = usePageGuide('settlements');
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
  const counts = payments.data?.counts;
  const items = payments.data?.items ?? [];
  const run = async () => {
    if (!shopId) { toast.error('Chọn gian hàng để kéo quyết toán'); return; }
    try { await start.mutateAsync({ shopId }); toast.success('Đã nhận yêu cầu kéo quyết toán'); } catch (e) { toast.error(problemMessage(e)); }
  };

  return (
    <div>
      <PageHeader
        title="Đối soát sàn"
        subtitle="So tiền sàn quyết toán với số Commerio ước tính, theo từng đơn."
        help="Trạng thái tiền của đơn độc lập với trạng thái đơn. Lệch quá ngưỡng thì cần chốt kèm lý do; lệch vượt hạn mức tự chốt thì CEO duyệt trước. Tiền rút về ngân hàng khớp với sao kê ở tab Khớp sao kê."
        onTour={startTour}
      />
      <Tabs value={tab} onValueChange={(value) => f.update({ tab: value, page: undefined, status: undefined })}>
        <div className="mb-2 overflow-x-auto">
          <TabsList data-guide="settlement-tabs">
            <TabsTrigger value="payments">
              Tiền theo đơn
              {counts && counts.mismatch > 0 && <Badge variant="destructive" className="ms-1">{counts.mismatch}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="runs">Lần đối soát</TabsTrigger>
            <TabsTrigger value="bank">Khớp sao kê</TabsTrigger>
          </TabsList>
        </div>
      </Tabs>
      {query.isError && (
        <AlertMessage severity="error">
          {problemMessage(query.error)} <Button variant="outline" onClick={() => void query.refetch()}>Thử lại</Button>
        </AlertMessage>
      )}
      {tab === 'payments' && (
        <>
          <div data-guide="settlement-kpis">
          <KpiStrip label="Trạng thái tiền theo đơn">
            <Kpi label="Chờ quyết toán" help={PAYMENT_STATES.pending.hint} value={counts?.pending ?? 0} unit="đơn" loading={payments.isLoading} />
            <Kpi
              label="Lệch tiền"
              help={PAYMENT_STATES.mismatch.hint}
              value={<span className={counts?.mismatch ? 'text-destructive' : undefined}>{counts?.mismatch ?? 0}</span>}
              unit="đơn"
              loading={payments.isLoading}
            />
            <Kpi label="Đã khớp" help={PAYMENT_STATES.settled.hint} value={counts?.settled ?? 0} unit="đơn" loading={payments.isLoading} />
            <Kpi label="Đã chốt lệch" help={PAYMENT_STATES.resolved.hint} value={counts?.resolved ?? 0} unit="đơn" loading={payments.isLoading} />
          </KpiStrip>
          </div>
          <MismatchPanel companyId={companyId} shopId={shopId || undefined} />
        </>
      )}
      <Card className="mt-4 gap-0 py-0" data-guide={tab === 'bank' ? 'settlement-bank' : undefined}>
        <FilterBar>
          {tab !== 'bank' && <FilterSelect loading={shops.isLoading} label="Gian hàng" value={shopId} onChange={f.setFilter('shopId')} options={(shops.data?.items ?? []).map((s) => ({ value: s.id, label: s.shopName }))} />}
          {tab === 'payments' && <FilterSelect label="Trạng thái tiền" value={status} onChange={f.setFilter('status')} options={Object.entries(PAYMENT_STATES).map(([value, meta]) => ({ value, label: `${meta.label} (${counts?.[value as keyof typeof PAYMENT_STATES] ?? 0})` }))} />}
          {tab === 'bank' && <FilterSelect label="Khớp sao kê" value={matched} onChange={f.setFilter('matched')} options={[{ value: 'false', label: 'Chưa khớp' }, { value: 'true', label: 'Đã khớp' }]} />}
          {tab === 'runs' && can(P.settlementResolve) && <Button data-guide="settlement-pull" disabled={start.isPending || !shopId} onClick={() => void run()}>Kéo quyết toán</Button>}
        </FilterBar>
        {tab === 'payments' && (
          <>
            <DataTable data={items} loading={payments.isLoading} fetching={payments.isFetching} getRowId={(p) => p.orderId} pagination={pagination} empty="Chưa có trạng thái tiền" onRowClick={(p) => navigate(ROUTES.company.settlement(companyId, p.orderId))} columns={[
              { header: 'Đơn', accessorKey: 'orderCode', cell: ({ row }) => <span className="font-mono">{row.original.orderCode ?? row.original.orderId}</span> },
              { header: 'Trạng thái tiền', cell: ({ row }) => <span className="flex flex-wrap gap-1"><StatusBadge status={row.original.status} statuses={PAYMENT_STATES} /><FlagChips flags={row.original.flags} meta={PAYMENT_FLAGS} /></span> },
              { header: 'Ước tính', meta: { numeric: true, help: 'Số Commerio tính theo cấu hình phí và thuế lúc giao.' }, cell: ({ row }) => <Money value={row.original.estimatedTotal} /> },
              { header: 'Quyết toán', meta: { numeric: true, help: 'Số sàn thực trả cho đơn, có sau khi kéo quyết toán.' }, cell: ({ row }) => row.original.settledTotal === null ? '—' : <Money value={row.original.settledTotal} /> },
              { header: 'Chênh lệch', meta: { numeric: true, help: 'Quyết toán trừ ước tính. Âm là sàn trả ít hơn.' }, cell: ({ row }) => row.original.diff === null ? '—' : <Money value={row.original.diff} /> },
              { header: 'Duyệt lệch', cell: ({ row }) => row.original.ceoApproval ? 'CEO đã duyệt' : row.original.needsCeoApproval ? 'Cần CEO duyệt' : 'Trong hạn mức' },
            ]} />
            {items.length > 0 && (
              <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t px-4 py-2.5 text-sm" data-testid="payments-total">
                <span className="me-auto text-muted-foreground">Tổng trang này</span>
                <span>Ước tính <Money className="font-medium" value={sumOf(items, (p) => p.estimatedTotal)} /></span>
                <span>Quyết toán <Money className="font-medium" value={sumOf(items, (p) => p.settledTotal)} /></span>
                <span>Lệch <Money className="font-medium" value={sumOf(items, (p) => p.diff)} /></span>
              </div>
            )}
          </>
        )}
        {tab === 'runs' && <DataTable data={runs.data?.items ?? []} loading={runs.isLoading} fetching={runs.isFetching} getRowId={(r) => r.id} pagination={pagination} empty="Chưa chạy đối soát" columns={[
          { header: 'Thời điểm', cell: ({ row }) => formatDateTime(row.original.createdAt) },
          { header: 'Gian hàng', cell: ({ row }) => shops.data?.items.find((s) => s.id === row.original.shopId)?.shopName ?? row.original.shopId },
          { header: 'Khoảng kéo', cell: ({ row }) => `${formatDateTime(row.original.from)} – ${formatDateTime(row.original.to)}` },
          { header: 'Trạng thái', cell: ({ row }) => row.original.status === 'running' ? <Badge variant="info">Đang kéo</Badge> : row.original.status === 'done' ? <Badge variant="success">Hoàn tất</Badge> : <Badge variant="destructive">Lỗi: {row.original.error ?? 'Không rõ'}</Badge> },
          { header: 'Dòng / trùng', meta: { numeric: true, help: 'Số dòng quyết toán kéo về / số dòng trùng đã bỏ qua.' }, cell: ({ row }) => `${row.original.lineCount} / ${row.original.duplicates}` },
          { header: 'Lệch ví', meta: { numeric: true, help: 'Số dư ví sàn trừ số dư Commerio tính được. Khác 0 là còn khoản chưa ghi.' }, cell: ({ row }) => row.original.walletDiff === null ? <span className="text-muted-foreground">Sàn chưa trả số dư</span> : <Money value={row.original.walletDiff} className={row.original.walletDiff ? 'text-destructive' : ''} /> },
        ]} />}
        {tab === 'bank' && <DataTable data={bank.data?.items ?? []} loading={bank.isLoading} fetching={bank.isFetching} getRowId={(r) => r.id} pagination={pagination} empty="Chưa có khoản cần khớp" columns={[
          { header: 'Ngày', cell: ({ row }) => formatDate(row.original.occurredOn) },
          { header: 'Loại', cell: ({ row }) => BANK_KINDS[row.original.kind] ?? row.original.kind },
          { header: 'Số tiền', meta: { numeric: true }, cell: ({ row }) => <Money value={row.original.amount} /> },
          { header: 'Mã giao dịch sàn', accessorKey: 'txnId', cell: ({ row }) => <span className="font-mono">{row.original.txnId ?? '—'}</span> },
          { header: 'Sao kê', cell: ({ row }) => row.original.bankMatch ? <span className="flex flex-wrap items-center gap-2"><Badge variant="success">Khớp</Badge><span className="font-mono">{row.original.bankMatch.bankRef}</span></span> : can(P.settlementResolve) ? <Button size="sm" onClick={() => setMatch(row.original)}>Khớp sao kê</Button> : <Badge variant="warning">Chưa khớp</Badge> },
        ]} />}
      </Card>
      {match && <LifecycleActionDialog path={`/finance/ledger/${match.id}/bank-match`} title="Khớp sao kê" field="bankRef" onClose={() => setMatch(null)} />}
    </div>
  );
}
