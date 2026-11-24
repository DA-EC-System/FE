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
import { shopDisplayName, maybeShopName } from '@/features/channel/shopList';

const BANK_KINDS: Record<string, string> = { withdrawal: 'Rút tiền từ ví sàn', supplier_refund: 'NCC hoàn tiền', lost_compensation: 'Sàn bồi thường mất hàng' };

/** Tổng của trang đang xem, cột chưa có số (null) không cộng */
const sumOf = (items: OrderPayment[], pick: (p: OrderPayment) => number | null) =>
  items.reduce((s, p) => s + (pick(p) ?? 0), 0);

export function SettlementsPage() {
  const { companyContext } = useAuth(); const companyId = companyContext?.companyId ?? '';
  const can = useCan(); const navigate = useNavigate(); const f = useUrlFilters([25, 50, 100]);
  const { startTour } = usePageGuide('settlements');
  const tab = f.params.get('tab') ?? 'payments'; const shopId = f.params.get('shopId') ?? '';
  const status = f.params.get('status') ?? ''; const matched = f.params.get('matched') ?? ''; const kind = f.params.get('kind') ?? '';
  const params = { page: f.page, pageSize: f.pageSize, shopId: shopId || undefined };
  const payments = useOrderPayments({ ...params, status: status || undefined });
  const runs = useSettlementRuns(params, tab === 'runs');
  const bank = useBankMatching({ page: f.page, pageSize: f.pageSize, kind: kind || undefined, matched: matched || undefined }, tab === 'bank');
  const shops = useShops({ enabled: can(P.shopView) }); const start = useStartSettlement();
  const [match, setMatch] = useState<SettlementLedgerLine | null>(null);
  const query = tab === 'runs' ? runs : tab === 'bank' ? bank : payments;
  const pagination = { page: f.page, pageSize: f.pageSize, total: query.data?.total ?? 0, pageSizes: [25, 50, 100], onChange: f.onPageChange };
  const counts = payments.data?.counts;
  const items = payments.data?.items ?? [];
  const run = async () => {
    if (!shopId) { toast.error('Chọn gian hàng để lấy sao kê sàn'); return; }
    try { await start.mutateAsync({ shopId }); toast.success('Đang lấy sao kê sàn, kết quả hiện trong bảng khi xong'); } catch (e) { toast.error(problemMessage(e)); }
  };

  return (
    <div>
      <PageHeader
        title="Đối soát công nợ sàn"
        subtitle="Đối chiếu số tiền sàn thanh toán với số phải thu theo sổ, theo từng đơn."
        help="Trạng thái thanh toán của đơn không phụ thuộc trạng thái giao hàng. Chênh lệch vượt ngưỡng cho phép thì phải xử lý kèm lý do; vượt hạn mức tự xử lý thì CEO duyệt trước. Tiền rút từ ví sàn về tài khoản ngân hàng được đối chiếu ở tab Đối chiếu ngân hàng."
        onTour={startTour}
      />
      <Tabs value={tab} onValueChange={(value) => f.update({ tab: value, page: undefined, status: undefined, kind: undefined, matched: undefined })}>
        <div className="mb-2 overflow-x-auto">
          <TabsList data-guide="settlement-tabs">
            <TabsTrigger value="payments">
              Đối soát theo đơn
              {counts && counts.mismatch > 0 && <Badge variant="destructive" className="ms-1">{counts.mismatch}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="runs">Sao kê sàn</TabsTrigger>
            <TabsTrigger value="bank">Đối chiếu ngân hàng</TabsTrigger>
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
          <KpiStrip label="Trạng thái thanh toán">
            <Kpi label="Chờ sàn thanh toán" help={PAYMENT_STATES.pending.hint} value={counts?.pending ?? 0} unit="đơn" loading={payments.isLoading} />
            <Kpi
              label="Chênh lệch"
              help={PAYMENT_STATES.mismatch.hint}
              value={<span className={counts?.mismatch ? 'text-destructive' : undefined}>{counts?.mismatch ?? 0}</span>}
              unit="đơn"
              loading={payments.isLoading}
            />
            <Kpi label="Đã đối soát khớp" help={PAYMENT_STATES.settled.hint} value={counts?.settled ?? 0} unit="đơn" loading={payments.isLoading} />
            <Kpi label="Đã xử lý chênh lệch" help={PAYMENT_STATES.resolved.hint} value={counts?.resolved ?? 0} unit="đơn" loading={payments.isLoading} />
          </KpiStrip>
          </div>
          <MismatchPanel companyId={companyId} shopId={shopId || undefined} />
        </>
      )}
      <Card className="mt-4 gap-0 py-0" data-guide={tab === 'bank' ? 'settlement-bank' : undefined}>
        <FilterBar>
          {tab !== 'bank' && <FilterSelect loading={shops.isLoading} label="Gian hàng" value={shopId} onChange={f.setFilter('shopId')} options={(shops.data?.items ?? []).map((s) => ({ value: s.id, label: shopDisplayName(s) }))} />}
          {tab === 'payments' && <FilterSelect label="Trạng thái thanh toán" value={status} onChange={f.setFilter('status')} options={Object.entries(PAYMENT_STATES).map(([value, meta]) => ({ value, label: `${meta.label} (${counts?.[value as keyof typeof PAYMENT_STATES] ?? 0})` }))} />}
          {tab === 'bank' && <FilterSelect label="Loại khoản" value={kind} onChange={f.setFilter('kind')} options={Object.entries(BANK_KINDS).map(([value, label]) => ({ value, label }))} />}
          {tab === 'bank' && <FilterSelect label="Tình trạng đối chiếu" value={matched} onChange={f.setFilter('matched')} options={[{ value: 'false', label: 'Chưa khớp' }, { value: 'true', label: 'Đã khớp' }]} />}
          {tab === 'runs' && can(P.settlementResolve) && <Button data-guide="settlement-pull" disabled={start.isPending || !shopId} onClick={() => void run()}>Lấy sao kê sàn</Button>}
        </FilterBar>
        {tab === 'payments' && (
          <>
            <DataTable data={items} loading={payments.isLoading} fetching={payments.isFetching} getRowId={(p) => p.orderId} pagination={pagination} empty="Chưa có trạng thái thanh toán" onRowClick={(p) => navigate(ROUTES.company.settlement(companyId, p.orderId))} columns={[
              { header: 'Mã đơn', accessorKey: 'orderCode', cell: ({ row }) => <span className="font-mono whitespace-nowrap">{row.original.orderCode ?? row.original.orderId}</span> },
              { header: 'Trạng thái thanh toán', cell: ({ row }) => <span className="flex flex-wrap gap-1"><StatusBadge status={row.original.status} statuses={PAYMENT_STATES} /><FlagChips flags={row.original.flags} meta={PAYMENT_FLAGS} /></span> },
              { header: 'Phải thu', meta: { numeric: true, help: 'Số phải thu theo sổ: giá bán trừ phí sàn và thuế sàn khấu trừ, tính theo cấu hình phí, thuế có hiệu lực ngày giao.' }, cell: ({ row }) => <Money value={row.original.estimatedTotal} /> },
              { header: 'Sàn thanh toán', meta: { numeric: true, help: 'Số sàn thực trả cho đơn theo sao kê sàn, có sau khi lấy sao kê.' }, cell: ({ row }) => row.original.settledTotal === null ? '—' : <Money value={row.original.settledTotal} /> },
              { header: 'Chênh lệch', meta: { numeric: true, help: 'Sàn thanh toán trừ phải thu. Âm là sàn trả thiếu.' }, cell: ({ row }) => row.original.diff === null ? '—' : <Money value={row.original.diff} /> },
              { header: 'Phê duyệt', cell: ({ row }) => row.original.ceoApproval ? 'CEO đã duyệt' : row.original.needsCeoApproval ? 'Chờ CEO duyệt' : 'Không cần duyệt' },
            ]} />
            {items.length > 0 && (
              <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t px-4 py-2.5 text-sm" data-testid="payments-total">
                <span className="me-auto text-muted-foreground">Tổng trang này</span>
                <span>Phải thu <Money className="font-medium" value={sumOf(items, (p) => p.estimatedTotal)} /></span>
                <span>Sàn thanh toán <Money className="font-medium" value={sumOf(items, (p) => p.settledTotal)} /></span>
                <span>Chênh lệch <Money className="font-medium" value={sumOf(items, (p) => p.diff)} /></span>
              </div>
            )}
          </>
        )}
        {tab === 'runs' && <DataTable data={runs.data?.items ?? []} loading={runs.isLoading} fetching={runs.isFetching} getRowId={(r) => r.id} pagination={pagination} empty="Chưa lấy sao kê sàn lần nào" columns={[
          { header: 'Thời điểm lấy', cell: ({ row }) => formatDateTime(row.original.createdAt) },
          { header: 'Gian hàng', cell: ({ row }) => maybeShopName(shops.data?.items.find((s) => s.id === row.original.shopId)) ?? row.original.shopId },
          { header: 'Kỳ sao kê', cell: ({ row }) => `${formatDateTime(row.original.from)} – ${formatDateTime(row.original.to)}` },
          { header: 'Trạng thái', cell: ({ row }) => row.original.status === 'running' ? <Badge variant="info">Đang lấy</Badge> : row.original.status === 'done' ? <Badge variant="success">Hoàn tất</Badge> : <Badge variant="destructive">Lỗi: {row.original.error ?? 'Không rõ'}</Badge> },
          { header: 'Số dòng / trùng bỏ qua', meta: { numeric: true, help: 'Số dòng sao kê lấy về / số dòng trùng đã bỏ qua.' }, cell: ({ row }) => `${row.original.lineCount} / ${row.original.duplicates}` },
          { header: 'Chênh lệch số dư ví', meta: { numeric: true, help: 'Số dư ví người bán theo sao kê sàn trừ số dư theo sổ Commerio. Khác 0 là còn khoản chưa ghi sổ.' }, cell: ({ row }) => row.original.walletDiff === null ? <span className="text-muted-foreground">Sàn không gửi số dư</span> : <Money value={row.original.walletDiff} className={row.original.walletDiff ? 'text-destructive' : ''} /> },
        ]} />}
        {tab === 'bank' && <DataTable data={bank.data?.items ?? []} loading={bank.isLoading} fetching={bank.isFetching} getRowId={(r) => r.id} pagination={pagination} empty="Chưa có khoản cần đối chiếu" columns={[
          { header: 'Ngày phát sinh', cell: ({ row }) => formatDate(row.original.occurredOn) },
          { header: 'Loại khoản', cell: ({ row }) => BANK_KINDS[row.original.kind] ?? row.original.kind },
          { header: 'Số tiền', meta: { numeric: true }, cell: ({ row }) => <Money value={row.original.amount} /> },
          { header: 'Mã giao dịch sàn', accessorKey: 'txnId', cell: ({ row }) => <span className="font-mono">{row.original.txnId ?? '—'}</span> },
          { header: 'Sao kê ngân hàng', cell: ({ row }) => row.original.bankMatch ? <span className="grid gap-0.5"><span className="flex flex-wrap items-center gap-2"><Badge variant="success">Đã khớp</Badge><span className="font-mono">{row.original.bankMatch.bankRef}</span></span><span className="text-xs text-muted-foreground" data-testid="bank-matched-by">{row.original.bankMatch.by.name}, {formatDateTime(row.original.bankMatch.at)}</span></span> : can(P.settlementResolve) ? <Button size="sm" onClick={() => setMatch(row.original)}>Đối chiếu</Button> : <Badge variant="warning">Chưa khớp</Badge> },
        ]} />}
      </Card>
      {match && <LifecycleActionDialog path={`/finance/ledger/${match.id}/bank-match`} title="Đối chiếu ngân hàng" field="bankRef" description={`${BANK_KINDS[match.kind] ?? match.kind} ${formatDate(match.occurredOn)}: nhập mã giao dịch trên sao kê ngân hàng. Đã đối chiếu thì không sửa được.`} onClose={() => setMatch(null)} />}
    </div>
  );
}
