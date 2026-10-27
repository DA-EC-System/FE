import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { DateFilter, FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useTransactions } from '@/api/payment.api';
import { problemMessage } from '@/api/problemMessages';
import { useCan } from '@/hooks/usePermission';
import { ROUTES } from '@/router/routes';
import { PERMISSIONS } from '@/utils/permissions';
import { formatCurrency, formatDateTime } from '@/utils/format';
import type { Gateway, PaymentTransaction, TransactionStatus } from '@/types/payment';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { GATEWAY_LABELS, TRANSACTION_SOURCE_LABELS, TRANSACTION_STATUS, labelOptions } from '@/features/finance/shared';
import { DocLink, OrderCode, useCompanyId } from '@/features/finance/parts';
import { TransactionSheet } from './TransactionSheet';

const PAGE_SIZES = [25, 50, 100];

/** UC-PF-03 — Giao dịch cổng ghi nhận qua webhook, tra cứu, SePay; chỉ xem (AC-G1, AC-G2) */
export function TransactionsPage() {
  const companyId = useCompanyId();
  const canFinance = useCan()(PERMISSIONS.financeView);
  const f = useUrlFilters(PAGE_SIZES);
  const gateway = (f.params.get('gateway') ?? '') as Gateway | '';
  const status = (f.params.get('status') ?? '') as TransactionStatus | '';
  const from = f.params.get('from') ?? '';
  const to = f.params.get('to') ?? '';
  const openId = f.params.get('txn');
  const query = useTransactions({
    page: f.page,
    pageSize: f.pageSize,
    search: f.q || undefined,
    gateway: gateway || undefined,
    status: status || undefined,
    from: from || undefined,
    to: to || undefined,
  });
  const filtered = Boolean(f.q || gateway || status || from || to);

  const columns = useMemo<ColumnDef<PaymentTransaction>[]>(
    () => [
      { id: 'occurredAt', header: 'Thời điểm', meta: { className: 'w-40' }, cell: ({ row }) => formatDateTime(row.original.occurredAt) },
      { id: 'gateway', header: 'Cổng', meta: { className: 'w-24' }, cell: ({ row }) => GATEWAY_LABELS[row.original.gateway] },
      { id: 'gatewayTxnId', header: 'Mã giao dịch cổng', meta: { className: 'w-40' }, cell: ({ row }) => row.original.gatewayTxnId },
      { id: 'paymentCode', header: 'Mã thanh toán', meta: { className: 'w-36' }, cell: ({ row }) => row.original.paymentCode ?? '—' },
      { id: 'order', header: 'Đơn hàng', meta: { className: 'w-28' }, cell: ({ row }) => <OrderCode order={row.original.order} /> },
      { id: 'amount', header: 'Số tiền', meta: { className: 'w-32 text-right' }, cell: ({ row }) => formatCurrency(row.original.amount) },
      { id: 'source', header: 'Nguồn', meta: { className: 'w-24' }, cell: ({ row }) => TRANSACTION_SOURCE_LABELS[row.original.source] },
      {
        id: 'status',
        header: 'Trạng thái',
        meta: { className: 'w-44' },
        cell: ({ row }) => {
          const t = row.original;
          const s = TRANSACTION_STATUS[t.status];
          return (
            <div className="grid justify-items-start gap-1">
              <Badge variant={s.variant}>{s.label}</Badge>
              {t.status === 'needs_review' && t.unmatchedReceiptId && canFinance && (
                <DocLink to={ROUTES.company.unmatched(companyId)}>Xem khoản thu chưa khớp</DocLink>
              )}
            </div>
          );
        },
      },
      {
        id: 'receipt',
        header: 'Phiếu thu',
        meta: { className: 'w-32' },
        cell: ({ row }) => {
          const r = row.original.receipt;
          if (!r) return '—';
          return canFinance ? <DocLink to={ROUTES.company.receipt(companyId, r.id)}>{r.number}</DocLink> : r.number;
        },
      },
    ],
    [canFinance, companyId],
  );

  return (
    <div>
      <PageHeader title="Giao dịch cổng" subtitle="Giao dịch cổng thanh toán ghi nhận qua webhook, tra cứu và SePay." />
      {query.isError && (
        <AlertMessage severity="error" className="mb-4">
          {problemMessage(query.error)}
        </AlertMessage>
      )}
      <Card className="gap-0 py-0">
        <FilterBar>
          <SearchInput value={f.searchInput} onChange={f.setSearchInput} placeholder="Tìm mã thanh toán, mã giao dịch, mã đơn" />
          <FilterSelect label="Cổng" value={gateway} onChange={f.setFilter('gateway')} options={labelOptions(GATEWAY_LABELS)} />
          <FilterSelect label="Trạng thái" value={status} onChange={f.setFilter('status')} options={labelOptions(TRANSACTION_STATUS)} />
          <DateFilter label="Từ ngày" value={from} onChange={f.setFilter('from')} max={to || undefined} />
          <DateFilter label="Đến ngày" value={to} onChange={f.setFilter('to')} min={from || undefined} />
        </FilterBar>
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          fetching={query.isFetching}
          onRowClick={(r) => f.update({ txn: r.id })}
          empty={filtered ? 'Không có giao dịch phù hợp' : 'Chưa có giao dịch'}
          pagination={{ page: f.page, pageSize: f.pageSize, total: query.data?.total ?? 0, pageSizes: PAGE_SIZES, onChange: f.onPageChange }}
        />
      </Card>
      <TransactionSheet id={openId} onClose={() => f.update({ txn: undefined })} />
    </div>
  );
}
