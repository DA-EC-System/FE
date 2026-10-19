import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { DateFilter, FilterBar, FilterSelect, SearchInput } from '@/components/common/FilterBar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useInvoices, useReceipts, useVouchers } from '@/api/finance.api';
import { problemMessage } from '@/api/problemMessages';
import { ROUTES } from '@/router/routes';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format';
import type {
  DocStatus,
  InvoiceSummary,
  PaymentVoucher,
  Receipt,
  ReceiptSource,
  VoucherPurpose,
  VoucherStatus,
} from '@/types/finance';
import { useUrlFilters } from '@/features/sales/useUrlFilters';
import {
  CREATABLE_PURPOSES,
  DOC_STATUS,
  GATEWAY_LABELS,
  RECEIPT_SOURCE_LABELS,
  VOUCHER_PURPOSE_LABELS,
  labelOptions,
} from './shared';
import { OrderCode, StatusBadge, useCanWrite, useCompanyId } from './parts';
import { VoucherFormDialog } from './VoucherFormDialog';

const PAGE_SIZES = [25, 50, 100];
type DocTab = 'invoices' | 'receipts' | 'vouchers';
const TABS: { value: DocTab; label: string }[] = [
  { value: 'invoices', label: 'Hoá đơn' },
  { value: 'receipts', label: 'Phiếu thu' },
  { value: 'vouchers', label: 'Phiếu chi' },
];
const POSTED_STATUSES = ['posted', 'reversed'] as const;
const FILTER_KEYS = ['q', 'status', 'source', 'purpose', 'from', 'to', 'page'];

type Filters = ReturnType<typeof useUrlFilters>;

/** UC-PF-04..06 phần xem — Hoá đơn, Phiếu thu, Phiếu chi trên một màn có tab (AC-D1, AC-D3, AC-D4) */
export function FinanceDocumentsPage() {
  const f = useUrlFilters(PAGE_SIZES);
  const canWrite = useCanWrite();
  const [creating, setCreating] = useState(false);
  const tabParam = f.params.get('tab') as DocTab | null;
  const tab = TABS.some((t) => t.value === tabParam) ? (tabParam as DocTab) : 'invoices';

  const switchTab = (next: string) => {
    f.setSearchInput('');
    f.update({
      ...Object.fromEntries(FILTER_KEYS.map((k) => [k, undefined])),
      tab: next === 'invoices' ? undefined : next,
    });
  };

  return (
    <div>
      <PageHeader
        title="Chứng từ"
        subtitle="Hoá đơn sinh khi xuất kho, phiếu thu sinh khi nhận tiền, phiếu chi lập khi hoàn tiền."
        action={
          tab === 'vouchers' && canWrite ? (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              Lập phiếu chi
            </Button>
          ) : undefined
        }
      />
      <Tabs value={tab} onValueChange={switchTab}>
        <div className="mb-2 overflow-x-auto">
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      {tab === 'invoices' && <InvoicesTab f={f} />}
      {tab === 'receipts' && <ReceiptsTab f={f} />}
      {tab === 'vouchers' && <VouchersTab f={f} />}
      <VoucherFormDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function DateRange({ f, fromLabel = 'Từ ngày', toLabel = 'Đến ngày' }: { f: Filters; fromLabel?: string; toLabel?: string }) {
  const from = f.params.get('from') ?? '';
  const to = f.params.get('to') ?? '';
  return (
    <>
      <DateFilter label={fromLabel} value={from} onChange={f.setFilter('from')} max={to || undefined} />
      <DateFilter label={toLabel} value={to} onChange={f.setFilter('to')} min={from || undefined} />
    </>
  );
}

function listParams(f: Filters) {
  return {
    page: f.page,
    pageSize: f.pageSize,
    search: f.q || undefined,
    from: f.params.get('from') || undefined,
    to: f.params.get('to') || undefined,
  };
}

const isFiltered = (f: Filters, keys: string[]) => Boolean(f.q || keys.some((k) => f.params.get(k)));

function ListError({ error }: { error: unknown }) {
  return (
    <AlertMessage severity="error" className="mb-4">
      {problemMessage(error)}
    </AlertMessage>
  );
}

function InvoicesTab({ f }: { f: Filters }) {
  const navigate = useNavigate();
  const companyId = useCompanyId();
  const status = (f.params.get('status') ?? '') as DocStatus | '';
  const query = useInvoices({ ...listParams(f), status: status || undefined });

  const columns = useMemo<ColumnDef<InvoiceSummary>[]>(
    () => [
      { id: 'number', header: 'Số', meta: { className: 'w-32' }, cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
      { id: 'order', header: 'Đơn hàng', meta: { className: 'w-28' }, cell: ({ row }) => <OrderCode order={row.original.order} /> },
      { id: 'customer', header: 'Khách', cell: ({ row }) => row.original.order?.customerName ?? '—' },
      { id: 'issuedAt', header: 'Ngày lập', meta: { className: 'w-40' }, cell: ({ row }) => formatDateTime(row.original.issuedAt) },
      { id: 'total', header: 'Tổng tiền', meta: { className: 'w-32 text-right' }, cell: ({ row }) => formatCurrency(row.original.total) },
      { id: 'status', header: 'Trạng thái', meta: { className: 'w-32' }, cell: ({ row }) => <StatusBadge status={DOC_STATUS[row.original.status]} /> },
    ],
    [],
  );

  return (
    <>
      {query.isError && <ListError error={query.error} />}
      <Card className="gap-0 py-0">
        <FilterBar>
          <SearchInput value={f.searchInput} onChange={f.setSearchInput} placeholder="Tìm số hoá đơn, mã đơn, tên khách" />
          <FilterSelect label="Trạng thái" value={status} onChange={f.setFilter('status')} options={labelOptions(DOC_STATUS, POSTED_STATUSES)} />
          <DateRange f={f} />
        </FilterBar>
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          fetching={query.isFetching}
          onRowClick={(r) => navigate(ROUTES.company.invoice(companyId, r.id))}
          empty={isFiltered(f, ['status', 'from', 'to']) ? 'Không có hoá đơn phù hợp' : 'Chưa có hoá đơn'}
          pagination={{ page: f.page, pageSize: f.pageSize, total: query.data?.total ?? 0, pageSizes: PAGE_SIZES, onChange: f.onPageChange }}
        />
      </Card>
    </>
  );
}

function ReceiptsTab({ f }: { f: Filters }) {
  const navigate = useNavigate();
  const companyId = useCompanyId();
  const status = (f.params.get('status') ?? '') as DocStatus | '';
  const source = (f.params.get('source') ?? '') as ReceiptSource | '';
  const query = useReceipts({ ...listParams(f), status: status || undefined, source: source || undefined });

  const columns = useMemo<ColumnDef<Receipt>[]>(
    () => [
      { id: 'number', header: 'Số', meta: { className: 'w-32' }, cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
      { id: 'source', header: 'Nguồn', meta: { className: 'w-44' }, cell: ({ row }) => RECEIPT_SOURCE_LABELS[row.original.source] },
      {
        id: 'order',
        header: 'Đơn hàng',
        cell: ({ row }) => (
          <div className="grid">
            <OrderCode order={row.original.order} />
            {row.original.order?.customerName && <span className="text-xs text-muted-foreground">{row.original.order.customerName}</span>}
          </div>
        ),
      },
      { id: 'gateway', header: 'Cổng', meta: { className: 'w-24' }, cell: ({ row }) => (row.original.gateway ? GATEWAY_LABELS[row.original.gateway] : '—') },
      { id: 'amount', header: 'Số tiền', meta: { className: 'w-32 text-right' }, cell: ({ row }) => formatCurrency(row.original.amount) },
      { id: 'postedAt', header: 'Ngày ghi sổ', meta: { className: 'w-40' }, cell: ({ row }) => formatDateTime(row.original.postedAt) },
      { id: 'status', header: 'Trạng thái', meta: { className: 'w-32' }, cell: ({ row }) => <StatusBadge status={DOC_STATUS[row.original.status]} /> },
    ],
    [],
  );

  return (
    <>
      {query.isError && <ListError error={query.error} />}
      <Card className="gap-0 py-0">
        <FilterBar>
          <SearchInput value={f.searchInput} onChange={f.setSearchInput} placeholder="Tìm số phiếu, mã đơn" />
          <FilterSelect label="Nguồn" value={source} onChange={f.setFilter('source')} options={labelOptions(RECEIPT_SOURCE_LABELS)} />
          <FilterSelect label="Trạng thái" value={status} onChange={f.setFilter('status')} options={labelOptions(DOC_STATUS, POSTED_STATUSES)} />
          <DateRange f={f} />
        </FilterBar>
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          fetching={query.isFetching}
          onRowClick={(r) => navigate(ROUTES.company.receipt(companyId, r.id))}
          empty={isFiltered(f, ['status', 'source', 'from', 'to']) ? 'Không có phiếu thu phù hợp' : 'Chưa có phiếu thu'}
          pagination={{ page: f.page, pageSize: f.pageSize, total: query.data?.total ?? 0, pageSizes: PAGE_SIZES, onChange: f.onPageChange }}
        />
      </Card>
    </>
  );
}

/** Chứng từ gốc của phiếu chi: mã đơn, hoặc nội dung chuyển khoản của khoản thu */
export function VoucherSource({ voucher }: { voucher: PaymentVoucher }) {
  if (voucher.order) return <OrderCode order={voucher.order} />;
  const um = voucher.unmatchedReceipt;
  if (um) return <span>{um.transferContent || `Khoản thu ${formatCurrency(um.amount)}`}</span>;
  return <>—</>;
}

function VouchersTab({ f }: { f: Filters }) {
  const navigate = useNavigate();
  const companyId = useCompanyId();
  const status = (f.params.get('status') ?? '') as VoucherStatus | '';
  const purpose = (f.params.get('purpose') ?? '') as VoucherPurpose | '';
  const query = useVouchers({ ...listParams(f), status: status || undefined, purpose: purpose || undefined });

  const columns = useMemo<ColumnDef<PaymentVoucher>[]>(
    () => [
      { id: 'number', header: 'Số', meta: { className: 'w-32' }, cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
      { id: 'purpose', header: 'Mục đích', meta: { className: 'w-48' }, cell: ({ row }) => VOUCHER_PURPOSE_LABELS[row.original.purpose] },
      { id: 'source', header: 'Chứng từ gốc', cell: ({ row }) => <VoucherSource voucher={row.original} /> },
      { id: 'amount', header: 'Số tiền', meta: { className: 'w-32 text-right' }, cell: ({ row }) => formatCurrency(row.original.amount) },
      { id: 'paidOn', header: 'Ngày chi', meta: { className: 'w-28' }, cell: ({ row }) => formatDate(row.original.paidOn) },
      { id: 'createdBy', header: 'Người lập', meta: { className: 'w-40' }, cell: ({ row }) => row.original.createdBy?.name ?? '—' },
      { id: 'status', header: 'Trạng thái', meta: { className: 'w-32' }, cell: ({ row }) => <StatusBadge status={DOC_STATUS[row.original.status]} /> },
    ],
    [],
  );

  return (
    <>
      {query.isError && <ListError error={query.error} />}
      <Card className="gap-0 py-0">
        <FilterBar>
          <SearchInput value={f.searchInput} onChange={f.setSearchInput} placeholder="Tìm số phiếu, mã đơn" />
          <FilterSelect label="Mục đích" value={purpose} onChange={f.setFilter('purpose')} options={labelOptions(VOUCHER_PURPOSE_LABELS, CREATABLE_PURPOSES)} />
          <FilterSelect label="Trạng thái" value={status} onChange={f.setFilter('status')} options={labelOptions(DOC_STATUS)} />
          <DateRange f={f} fromLabel="Chi từ ngày" toLabel="Chi đến ngày" />
        </FilterBar>
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          fetching={query.isFetching}
          onRowClick={(r) => navigate(ROUTES.company.paymentVoucher(companyId, r.id))}
          empty={isFiltered(f, ['status', 'purpose', 'from', 'to']) ? 'Không có phiếu chi phù hợp' : 'Chưa có phiếu chi'}
          pagination={{ page: f.page, pageSize: f.pageSize, total: query.data?.total ?? 0, pageSizes: PAGE_SIZES, onChange: f.onPageChange }}
        />
      </Card>
    </>
  );
}
