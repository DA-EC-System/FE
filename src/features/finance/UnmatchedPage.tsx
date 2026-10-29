import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Link2, Undo2 } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { DateFilter, FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRefundUnmatched, useTabCounts, useUnmatchedReceipts } from '@/api/finance.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { ROUTES } from '@/router/routes';
import { formatCurrency, formatDateTime } from '@/utils/format';
import type { UnmatchedReason, UnmatchedReceipt, UnmatchedStatus } from '@/types/finance';
import { Info } from '@/features/sales/Info';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { GATEWAY_LABELS, UNMATCHED_REASON_LABELS, UNMATCHED_STATUS, labelOptions } from './shared';
import { DocLink, OrderCode, PayoutDialog, payoutFieldErrors, useCanWrite, useCompanyId } from './parts';
import { AssignDialog, UNMATCHED_STALE } from './AssignDialog';

const PAGE_SIZES = [25, 50, 100];
const TABS: UnmatchedStatus[] = ['open', 'assigned', 'refunded'];

/** UC-PF-07 — Tiền vào không khớp đơn: gán vào đơn hoặc hoàn lại cho người chuyển (AC-U1 đến AC-U3) */
export function UnmatchedPage() {
  const companyId = useCompanyId();
  const canWrite = useCanWrite();
  const f = useUrlFilters(PAGE_SIZES);
  const tabParam = f.params.get('status') as UnmatchedStatus | null;
  const tab = tabParam && TABS.includes(tabParam) ? tabParam : 'open';
  const reason = (f.params.get('reason') ?? '') as UnmatchedReason | '';
  const from = f.params.get('from') ?? '';
  const to = f.params.get('to') ?? '';
  const query = useUnmatchedReceipts({
    status: tab,
    page: f.page,
    pageSize: f.pageSize,
    search: f.q || undefined,
    reason: reason || undefined,
    from: from || undefined,
    to: to || undefined,
  });
  const counts = useTabCounts('unmatched-receipts', TABS);
  const refund = useRefundUnmatched();
  const [assigning, setAssigning] = useState<UnmatchedReceipt | null>(null);
  const [refunding, setRefunding] = useState<UnmatchedReceipt | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const filtered = Boolean(f.q || reason || from || to);

  const submitRefund = async (values: { paidOn: string; note: string }) => {
    if (!refunding) return;
    try {
      const voucher = await refund.mutateAsync({ id: refunding.id, ...values, version: refunding.version });
      toast.success(`Đã hoàn lại ${formatCurrency(voucher.amount)}, phiếu chi ${voucher.number}`);
      setRefunding(null);
    } catch (e) {
      const code = getProblem(e)?.code;
      if (code === 'already_processed' || code === 'version_conflict') {
        setNotice(UNMATCHED_STALE);
        setRefunding(null);
        return;
      }
      return payoutFieldErrors(e) ?? problemMessage(e);
    }
  };

  const columns = useMemo<ColumnDef<UnmatchedReceipt>[]>(() => {
    const cols: ColumnDef<UnmatchedReceipt>[] = [
      { id: 'receivedAt', header: 'Thời điểm nhận', meta: { className: 'w-40' }, cell: ({ row }) => formatDateTime(row.original.receivedAt) },
      { id: 'amount', header: 'Số tiền', meta: { className: 'w-32 text-right' }, cell: ({ row }) => formatCurrency(row.original.amount) },
      { id: 'content', header: 'Nội dung chuyển khoản', meta: { className: 'min-w-48' }, cell: ({ row }) => row.original.transferContent || '—' },
      { id: 'gateway', header: 'Cổng', meta: { className: 'w-24' }, cell: ({ row }) => (row.original.gateway ? GATEWAY_LABELS[row.original.gateway] : '—') },
      { id: 'reason', header: 'Lý do', meta: { className: 'w-44' }, cell: ({ row }) => UNMATCHED_REASON_LABELS[row.original.reason] },
      { id: 'suggested', header: 'Đơn gợi ý', meta: { className: 'w-28' }, cell: ({ row }) => <OrderCode order={row.original.suggestedOrder} /> },
      {
        id: 'result',
        header: 'Kết quả',
        meta: { className: 'w-40' },
        cell: ({ row }) => {
          const u = row.original;
          if (u.assignedOrder) {
            return (
              <div className="grid">
                <OrderCode order={u.assignedOrder} />
                {u.receipt && <DocLink to={ROUTES.company.receipt(companyId, u.receipt.id)}>{u.receipt.number}</DocLink>}
              </div>
            );
          }
          if (u.voucher) return <DocLink to={ROUTES.company.paymentVoucher(companyId, u.voucher.id)}>{u.voucher.number}</DocLink>;
          return '—';
        },
      },
    ];
    if (tab === 'open' && canWrite) {
      cols.push({
        id: 'actions',
        header: '',
        meta: { className: 'w-56 text-right' },
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setAssigning(row.original)}>
              <Link2 />
              Gán vào đơn
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRefunding(row.original)}>
              <Undo2 />
              Hoàn lại
            </Button>
          </div>
        ),
      });
    }
    return cols;
  }, [tab, canWrite, companyId]);

  return (
    <div>
      <PageHeader title="Khoản thu chưa khớp" subtitle="Tiền vào tài khoản không tự khớp được với đơn nào." />
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setNotice(null);
          f.update({ status: v === 'open' ? undefined : v, page: undefined });
        }}
      >
        <div className="mb-2 overflow-x-auto">
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t} value={t}>
                {UNMATCHED_STATUS[t].label}
                {counts[t] !== undefined && (
                  <Badge variant="secondary" className="ms-1">
                    {counts[t]}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      {notice && (
        <AlertMessage severity="error" className="mb-4" onClose={() => setNotice(null)}>
          {notice}
        </AlertMessage>
      )}
      {query.isError && (
        <AlertMessage severity="error" className="mb-4">
          {problemMessage(query.error)}
        </AlertMessage>
      )}
      <Card className="gap-0 py-0">
        <FilterBar>
          <SearchInput value={f.searchInput} onChange={f.setSearchInput} placeholder="Tìm nội dung chuyển khoản" />
          <FilterSelect label="Lý do" value={reason} onChange={f.setFilter('reason')} options={labelOptions(UNMATCHED_REASON_LABELS)} />
          <DateFilter label="Nhận từ ngày" value={from} onChange={f.setFilter('from')} max={to || undefined} />
          <DateFilter label="Nhận đến ngày" value={to} onChange={f.setFilter('to')} min={from || undefined} />
        </FilterBar>
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          fetching={query.isFetching}
          empty={filtered ? 'Không có khoản thu phù hợp' : 'Chưa có khoản thu chưa khớp'}
          pagination={{ page: f.page, pageSize: f.pageSize, total: query.data?.total ?? 0, pageSizes: PAGE_SIZES, onChange: f.onPageChange }}
        />
      </Card>
      <AssignDialog
        item={assigning}
        onClose={() => setAssigning(null)}
        onStale={(message) => {
          setNotice(message);
          setAssigning(null);
        }}
      />
      <PayoutDialog
        open={Boolean(refunding)}
        title="Hoàn lại khoản thu"
        submitLabel="Hoàn lại"
        loading={refund.isPending}
        summary={
          refunding && (
            <div className="grid grid-cols-2 gap-4 rounded-md border p-3">
              <Info label="Số tiền">{formatCurrency(refunding.amount)}</Info>
              <Info label="Nội dung chuyển khoản">{refunding.transferContent || '—'}</Info>
            </div>
          )
        }
        onSubmit={submitRefund}
        onClose={() => setRefunding(null)}
      />
    </div>
  );
}
