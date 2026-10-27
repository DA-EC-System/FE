import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Undo2 } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { FilterBar, SearchInput } from '@/components/common/FilterBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRefundOrder, useRefunds, useTabCounts } from '@/api/finance.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { ROUTES } from '@/router/routes';
import { formatCurrency, formatDateTime } from '@/utils/format';
import type { RefundItem, RefundListStatus } from '@/types/finance';
import { Info } from '@/features/sales/Info';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { REFUND_STATUS, paidViaLabel } from './shared';
import { DocLink, OrderCode, PayoutDialog, payoutFieldErrors, useCanWrite, useCompanyId, voucherNumberIn } from './parts';

const PAGE_SIZES = [25, 50, 100];
const TABS: RefundListStatus[] = ['pending_refund', 'refunded'];

/** UC-PF-06 — Đơn trả trước đã huỷ cần hoàn tiền, ghi hoàn một bước (AC-R1, AC-R2) */
export function RefundsPage() {
  const companyId = useCompanyId();
  const canWrite = useCanWrite();
  const f = useUrlFilters(PAGE_SIZES);
  const tabParam = f.params.get('status') as RefundListStatus | null;
  const tab = tabParam && TABS.includes(tabParam) ? tabParam : 'pending_refund';
  const query = useRefunds({ status: tab, page: f.page, pageSize: f.pageSize, search: f.q || undefined });
  const counts = useTabCounts('refunds', TABS);
  const refund = useRefundOrder();
  const [target, setTarget] = useState<RefundItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (values: { paidOn: string; note: string }) => {
    if (!target?.order) return;
    const order = target.order;
    try {
      const voucher = await refund.mutateAsync({ orderId: order.id, ...values });
      toast.success(`Đã hoàn ${formatCurrency(voucher.amount)} cho đơn ${order.code}, phiếu chi ${voucher.number}`);
      setTarget(null);
    } catch (e) {
      const problem = getProblem(e);
      if (problem?.code === 'already_processed') {
        const number = voucherNumberIn(problem.detail);
        setNotice(number ? `Đơn vừa được người khác hoàn tiền (${number}).` : (problem.detail ?? problemMessage(e)));
        setTarget(null);
        return;
      }
      if (problem?.code === 'payment_state_changed') {
        setNotice('Đơn không còn chờ hoàn tiền.');
        setTarget(null);
        return;
      }
      return payoutFieldErrors(e) ?? problemMessage(e);
    }
  };

  const columns = useMemo<ColumnDef<RefundItem>[]>(() => {
    const cols: ColumnDef<RefundItem>[] = [
      { id: 'code', header: 'Mã đơn', meta: { className: 'w-28' }, cell: ({ row }) => <OrderCode order={row.original.order} /> },
      { id: 'customer', header: 'Khách', cell: ({ row }) => row.original.order?.customerName ?? '—' },
      { id: 'phone', header: 'SĐT', meta: { className: 'w-32' }, cell: ({ row }) => row.original.order?.customerPhone ?? '—' },
      { id: 'paidAmount', header: 'Số đã thu', meta: { className: 'w-32 text-right' }, cell: ({ row }) => formatCurrency(row.original.paidAmount) },
      { id: 'paidVia', header: 'Trả qua', meta: { className: 'w-40' }, cell: ({ row }) => paidViaLabel(row.original.paidVia) },
      { id: 'paidAt', header: 'Ngày trả', meta: { className: 'w-40' }, cell: ({ row }) => formatDateTime(row.original.paidAt) },
      { id: 'cancelledAt', header: 'Ngày huỷ', meta: { className: 'w-40' }, cell: ({ row }) => formatDateTime(row.original.cancelledAt) },
      {
        id: 'voucher',
        header: 'Phiếu chi',
        meta: { className: 'w-32' },
        cell: ({ row }) => {
          const v = row.original.voucher;
          return v ? <DocLink to={ROUTES.company.paymentVoucher(companyId, v.id)}>{v.number}</DocLink> : '—';
        },
      },
    ];
    if (tab === 'pending_refund' && canWrite) {
      cols.push({
        id: 'actions',
        header: '',
        meta: { className: 'w-32 text-right' },
        cell: ({ row }) =>
          row.original.order && (
            <Button size="sm" variant="outline" onClick={() => setTarget(row.original)}>
              <Undo2 />
              Hoàn tiền
            </Button>
          ),
      });
    }
    return cols;
  }, [tab, canWrite, companyId]);

  return (
    <div>
      <PageHeader title="Hoàn tiền" subtitle="Đơn trả trước đã huỷ sau khi khách trả tiền, chờ hoàn lại cho khách." />
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setNotice(null);
          f.update({ status: v === 'pending_refund' ? undefined : v, page: undefined });
        }}
      >
        <div className="mb-2 overflow-x-auto">
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t} value={t}>
                {REFUND_STATUS[t].label}
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
          <SearchInput value={f.searchInput} onChange={f.setSearchInput} placeholder="Tìm mã đơn, tên khách, SĐT" />
        </FilterBar>
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          getRowId={(r) => r.order?.id ?? ''}
          loading={query.isLoading}
          fetching={query.isFetching}
          empty={f.q ? 'Không có đơn phù hợp' : tab === 'pending_refund' ? 'Chưa có đơn chờ hoàn tiền' : 'Chưa có đơn đã hoàn'}
          pagination={{ page: f.page, pageSize: f.pageSize, total: query.data?.total ?? 0, pageSizes: PAGE_SIZES, onChange: f.onPageChange }}
        />
      </Card>
      <PayoutDialog
        open={Boolean(target)}
        title={`Hoàn tiền đơn ${target?.order?.code ?? ''}`}
        submitLabel="Hoàn tiền"
        loading={refund.isPending}
        summary={
          target && (
            <div className="grid grid-cols-2 gap-4 rounded-md border p-3" data-testid="refund-summary">
              <Info label="Đơn hàng">{target.order?.code ?? '—'}</Info>
              <Info label="Khách">{target.order?.customerName ?? '—'}</Info>
              <Info label="Số tiền hoàn">{formatCurrency(target.paidAmount)}</Info>
              <Info label="Trả qua">{paidViaLabel(target.paidVia)}</Info>
            </div>
          )
        }
        onSubmit={submit}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}
