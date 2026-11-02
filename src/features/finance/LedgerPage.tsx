import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Download, Loader2, X } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { AlertMessage } from '@/components/common/AlertMessage';
import { DataTable } from '@/components/common/DataTable';
import { DateFilter, FilterBar } from '@/components/common/FilterBar';
import { Money } from '@/components/common/Money';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useExportLedger, useLedger, useOrderProfits, useTaxWarnings } from '@/api/ledger.api';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { ROUTES } from '@/router/routes';
import { formatDateTime } from '@/utils/format';
import { LEDGER_KIND_LABELS, formatMilestone } from '@/utils/ledger';
import type { LedgerFilter, LedgerLine, LedgerTotals, OrderProfitRow } from '@/types/finance';
import { LedgerStateBadge, ProfitStateBadge, TaxMismatchBadge } from './ledgerShared';

const PAGE_SIZES = [25, 50, 100];

const FILTERS: { value: LedgerFilter; label: string }[] = [
  { value: 'all', label: 'Mọi dòng' },
  { value: 'estimated', label: 'Ước tính' },
  { value: 'actual', label: 'Thực tế' },
  { value: 'replaced', label: 'Đã thay' },
];

const KPIS: { key: keyof LedgerTotals; label: string; hint: string }[] = [
  { key: 'receivable', label: 'Phải thu sàn', hint: 'Ước tính, chờ sàn quyết toán' },
  { key: 'platformBalance', label: 'Số dư shop trên sàn', hint: 'Đã quyết toán, trừ tiền đã rút' },
  { key: 'withdrawn', label: 'Đã rút về ngân hàng', hint: 'Tổng các lần rút' },
  { key: 'committedPurchase', label: 'Tiền sẽ ra', hint: 'Đề nghị nhập đã duyệt chưa nhận đủ' },
];

/** Cảnh báo doanh thu luỹ kế năm chạm mốc; app không khai thuế */
function TaxWarnings() {
  const query = useTaxWarnings();
  const data = query.data;
  if (!data?.items.length) return null;
  return (
    <div className="mb-4 grid gap-2" data-testid="tax-warnings">
      {data.items.map((w) => (
        <AlertMessage key={w.milestone} severity={w.over ? 'error' : 'warning'}>
          Doanh thu luỹ kế năm {data.year} {w.over ? 'đã vượt' : 'sắp vượt'} mốc {formatMilestone(w.milestone)}:{' '}
          <Money value={w.ytdRevenue} />. App không khai thuế, chỉ cảnh báo để kế toán chuẩn bị.
        </AlertMessage>
      ))}
    </div>
  );
}

function Kpis({ totals }: { totals: LedgerTotals | undefined }) {
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {KPIS.map((k) => (
        <Card key={k.key} className="gap-1 py-4" data-testid={`kpi-${k.key}`}>
          <CardContent className="grid gap-1">
            <span className="text-sm text-muted-foreground">{k.label}</span>
            {totals ? (
              <Money value={totals[k.key]} className="text-xl font-semibold" />
            ) : (
              <Skeleton className="h-7 w-32" />
            )}
            <span className="text-xs text-muted-foreground">{k.hint}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Ẩn nút xuất MISA: BE chưa có quyền và route xuất (sơ đồ D4.1 chưa làm); không tự đặt mã quyền ở FE */
const LEDGER_EXPORT_READY = false;

/** Sổ tiền (sơ đồ D4.1): dòng sổ chỉ thêm, ước tính bị thay khi sàn quyết toán; lãi theo đơn */
export function LedgerPage() {
  const navigate = useNavigate();
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const canExport = LEDGER_EXPORT_READY;
  const f = useUrlFilters(PAGE_SIZES);
  const tab = f.params.get('tab') === 'profit' ? 'profit' : 'lines';
  const filterParam = f.params.get('filter') as LedgerFilter | null;
  const filter: LedgerFilter = FILTERS.some((x) => x.value === filterParam) ? filterParam! : 'all';
  const from = f.params.get('from') ?? '';
  const to = f.params.get('to') ?? '';
  const orderId = f.params.get('orderId') ?? '';

  const ledger = useLedger({
    filter,
    orderId: orderId || undefined,
    from: from || undefined,
    to: to || undefined,
    page: tab === 'lines' ? f.page : 1,
    pageSize: f.pageSize,
  });
  const profits = useOrderProfits({ page: f.page, pageSize: f.pageSize }, tab === 'profit');
  const exporter = useExportLedger();

  const lineColumns = useMemo<ColumnDef<LedgerLine>[]>(
    () => [
      { id: 'at', header: 'Lúc', meta: { className: 'w-40' }, cell: ({ row }) => formatDateTime(row.original.at) },
      {
        id: 'kind',
        header: 'Khoản',
        meta: { className: 'w-40' },
        cell: ({ row }) => (
          <div className="grid">
            <span>{LEDGER_KIND_LABELS[row.original.kind]}</span>
            <span className="text-xs text-muted-foreground">{row.original.code}</span>
          </div>
        ),
      },
      {
        id: 'doc',
        header: 'Đơn/chứng từ',
        meta: { className: 'w-36' },
        cell: ({ row }) => row.original.orderCode ?? row.original.txnId ?? '—',
      },
      { id: 'shop', header: 'Gian hàng', meta: { className: 'min-w-36' }, cell: ({ row }) => row.original.shopName ?? 'Đơn tạo tay' },
      {
        id: 'amount',
        header: 'Số tiền',
        meta: { className: 'w-36 text-right' },
        cell: ({ row }) => (
          <Money value={row.original.amount} className={row.original.replaced ? 'text-muted-foreground line-through' : undefined} />
        ),
      },
      { id: 'state', header: 'Loại', meta: { className: 'w-28' }, cell: ({ row }) => <LedgerStateBadge line={row.original} /> },
      { id: 'version', header: 'Phiên bản', meta: { className: 'w-28' }, cell: ({ row }) => row.original.configVersion ?? '—' },
      {
        id: 'note',
        header: 'Ghi chú',
        meta: { className: 'min-w-40' },
        cell: ({ row }) => (
          <span className="whitespace-normal">
            {row.original.note ?? '—'}
            {row.original.txnId && row.original.orderCode ? (
              <span className="block text-xs text-muted-foreground">{row.original.txnId}</span>
            ) : null}
          </span>
        ),
      },
    ],
    [],
  );

  const profitColumns = useMemo<ColumnDef<OrderProfitRow>[]>(
    () => [
      { id: 'order', header: 'Đơn', meta: { className: 'w-28' }, cell: ({ row }) => <span className="font-medium">{row.original.order.code}</span> },
      { id: 'shop', header: 'Gian hàng', meta: { className: 'min-w-36' }, cell: ({ row }) => row.original.shopName ?? 'Đơn tạo tay' },
      { id: 'net', header: 'Thực nhận', meta: { className: 'w-32 text-right' }, cell: ({ row }) => <Money value={row.original.net} /> },
      {
        id: 'cogs',
        header: 'Giá vốn',
        meta: { className: 'w-32 text-right' },
        cell: ({ row }) => (row.original.cogs === null ? '—' : <Money value={row.original.cogs} />),
      },
      {
        id: 'gross',
        header: 'Lãi gộp',
        meta: { className: 'w-32 text-right' },
        cell: ({ row }) => (row.original.gross === null ? '—' : <Money value={row.original.gross} />),
      },
      {
        id: 'state',
        header: 'Trạng thái',
        meta: { className: 'w-48' },
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <ProfitStateBadge estimated={row.original.estimated} />
            <TaxMismatchBadge value={row.original.taxMismatch} />
          </div>
        ),
      },
    ],
    [],
  );

  const runExport = () =>
    exporter.mutate(
      { from: from || undefined, to: to || undefined },
      {
        onSuccess: () => toast.success('Đã xuất chứng từ'),
        onError: (e) => toast.error(problemMessage(e)),
      },
    );

  const error = tab === 'lines' ? ledger.error : profits.error;

  return (
    <div>
      <PageHeader
        title="Sổ tiền"
        subtitle="Mọi khoản tiền theo đơn và gian hàng. Dòng ước tính được thay bằng dòng thực tế khi sàn quyết toán, không sửa tại chỗ."
        action={
          canExport ? (
            <Button onClick={runExport} disabled={exporter.isPending}>
              {exporter.isPending ? <Loader2 className="animate-spin" aria-label="Đang xuất" /> : <Download />}
              Xuất chứng từ kiểu MISA
            </Button>
          ) : undefined
        }
      />
      <TaxWarnings />
      <Kpis totals={ledger.data?.totals} />
      <Tabs value={tab} onValueChange={(v) => f.update({ tab: v === 'lines' ? undefined : v, page: undefined })}>
        <TabsList className="mb-2">
          <TabsTrigger value="lines">Dòng sổ</TabsTrigger>
          <TabsTrigger value="profit">Lãi theo đơn</TabsTrigger>
        </TabsList>
      </Tabs>
      {error && (
        <AlertMessage severity="error" className="mb-4">
          {problemMessage(error)}
        </AlertMessage>
      )}
      <Card className="gap-0 py-0">
        {tab === 'lines' ? (
          <>
            <FilterBar>
              <Tabs value={filter} onValueChange={(v) => f.update({ filter: v === 'all' ? undefined : v, page: undefined })}>
                <TabsList aria-label="Loại dòng">
                  {FILTERS.map((x) => (
                    <TabsTrigger key={x.value} value={x.value}>
                      {x.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <DateFilter label="Từ ngày" value={from} onChange={f.setFilter('from')} max={to || undefined} />
              <DateFilter label="Đến ngày" value={to} onChange={f.setFilter('to')} min={from || undefined} />
              {orderId && (
                <Button variant="outline" size="sm" className="self-end" onClick={() => f.update({ orderId: undefined, page: undefined })}>
                  Chỉ dòng của một đơn
                  <X />
                </Button>
              )}
            </FilterBar>
            <DataTable
              columns={lineColumns}
              data={ledger.data?.items ?? []}
              getRowId={(r) => r.id}
              loading={ledger.isLoading}
              fetching={ledger.isFetching}
              onRowClick={(r) => r.orderId && navigate(ROUTES.company.order(companyId, r.orderId))}
              empty="Không có dòng sổ nào"
              pagination={{
                page: f.page,
                pageSize: f.pageSize,
                total: ledger.data?.total ?? 0,
                pageSizes: PAGE_SIZES,
                onChange: f.onPageChange,
              }}
            />
          </>
        ) : (
          <DataTable
            columns={profitColumns}
            data={profits.data?.items ?? []}
            getRowId={(r) => r.order.id}
            loading={profits.isLoading}
            fetching={profits.isFetching}
            onRowClick={(r) => navigate(ROUTES.company.order(companyId, r.order.id))}
            empty="Chưa có đơn nào ghi sổ"
            pagination={{
              page: f.page,
              pageSize: f.pageSize,
              total: profits.data?.total ?? 0,
              pageSizes: PAGE_SIZES,
              onChange: f.onPageChange,
            }}
          />
        )}
      </Card>
    </div>
  );
}
